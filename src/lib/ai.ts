export type AiErrorKind = 'config' | 'auth' | 'billing' | 'rate' | 'network' | 'server' | 'parse';

export class AiError extends Error {
  kind: AiErrorKind;
  detail?: string;
  status?: number;

  constructor(kind: AiErrorKind, message: string, detail?: string, status?: number) {
    super(message);
    this.name = 'AiError';
    this.kind = kind;
    this.detail = detail;
    this.status = status;
  }
}

export interface AiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  useServerDefault: boolean;
}

export interface ChatMessageInput {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '0.0.0.0', '::1', 'host.docker.internal'];

export function isLocalBaseUrl(baseUrl: string): boolean {
  try {
    const host = new URL(baseUrl.trim()).hostname.toLowerCase();
    return LOCAL_HOSTS.includes(host) || host.endsWith('.local');
  } catch {
    return false;
  }
}

/** Removes what copy-paste tends to add: spaces, newlines, quotes, "Bearer ". */
export function sanitizeApiKey(value: string): string {
  return String(value ?? '')
    .replace(/^\s*bearer\s+/i, '')
    .replace(/[\s\u200b-\u200d\ufeff]/g, '')
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .trim();
}

export interface KeyDiagnostics {
  length: number;
  hasWhitespace: boolean;
  looksValid: boolean;
  issues: string[];
}

/** Purely local sanity check — never sends the key anywhere. */
export function keyDiagnostics(apiKey: string): KeyDiagnostics {
  const raw = String(apiKey ?? '');
  const clean = sanitizeApiKey(raw);
  const issues: string[] = [];
  if (!clean) issues.push('还没有填写 Key');
  if (/\s/.test(raw.trim())) issues.push('包含空格或换行，已自动清理');
  if (clean && !/^sk-[A-Za-z0-9_-]{20,}$/.test(clean)) {
    issues.push('格式不像标准 API Key（通常以 sk- 开头，共 32–64 位）');
  }
  if (clean && clean.length < 30) issues.push(`只有 ${clean.length} 个字符，可能复制不完整`);
  return {
    length: clean.length,
    hasWhitespace: /\s/.test(raw.trim()),
    looksValid: /^sk-[A-Za-z0-9_-]{20,}$/.test(clean),
    issues,
  };
}

export function isConfigured(ai: { baseUrl: string; apiKey: string; model: string; useServerDefault: boolean }): boolean {
  if (!ai.model.trim() || !ai.baseUrl.trim()) return false;
  if (ai.useServerDefault) return true;
  const key = sanitizeApiKey(ai.apiKey);
  return Boolean(key) || isLocalBaseUrl(ai.baseUrl);
}

export function toConfig(ai: {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  useServerDefault: boolean;
}): AiConfig {
  return {
    baseUrl: ai.baseUrl.trim(),
    apiKey: sanitizeApiKey(ai.apiKey),
    model: ai.model.trim(),
    temperature: Number.isFinite(ai.temperature) ? ai.temperature : 0.6,
    useServerDefault: ai.useServerDefault,
  };
}

interface ChatOptions {
  config: AiConfig;
  messages: ChatMessageInput[];
  onDelta?: (delta: string) => void;
  signal?: AbortSignal;
  json?: boolean;
  temperature?: number;
}

interface ChatResult {
  content: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null;
}

function mapError(status: number, error: string, detail?: string): AiError {
  const kind: AiErrorKind =
    status === 401 || status === 403
      ? 'auth'
      : status === 402
        ? 'billing'
        : status === 429
          ? 'rate'
          : status === 504
            ? 'network'
            : 'server';
  const message =
    kind === 'auth'
      ? 'API Key 无效或没有权限'
      : kind === 'billing'
        ? '账户余额不足，请充值后再试'
        : kind === 'rate'
          ? '请求过于频繁，请稍后再试'
          : kind === 'network'
            ? '无法连接 AI 服务'
            : error || `AI 服务返回 ${status}`;
  return new AiError(kind, message, detail, status);
}

/** Sends a chat request through the local proxy (which talks to the provider). */
export async function streamChat({ config, messages, onDelta, signal, json, temperature }: ChatOptions): Promise<ChatResult> {
  const streaming = Boolean(onDelta);
  let res: Response;
  try {
    res = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        config,
        messages,
        stream: streaming,
        json: Boolean(json),
        temperature: temperature ?? config.temperature,
      }),
      signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new AiError('network', '无法连接本地 AI 代理服务', '请确认本地服务正在运行（npm run dev / 桌面版）');
  }

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
    throw mapError(res.status, data.error ?? '', data.detail);
  }

  if (!streaming) {
    const data = (await res.json()) as { content?: string; usage?: ChatResult['usage']; error?: string; detail?: string };
    if (data.error && !data.content) throw mapError(500, data.error, data.detail);
    return { content: data.content ?? '', usage: data.usage ?? null };
  }

  if (!res.body) throw new AiError('network', '浏览器不支持流式响应');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let content = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    if (!chunk) continue;
    content += chunk;
    onDelta?.(chunk);
  }
  content += decoder.decode();
  return { content };
}

/** Extracts the first JSON object/array from a model response. */
export function extractJson<T = unknown>(text: string): T {
  const trimmed = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    /* fall through to brace scanning */
  }
  const start = trimmed.search(/[[{]/);
  if (start < 0) throw new AiError('parse', '模型没有返回 JSON', trimmed.slice(0, 200));
  const open = trimmed[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(trimmed.slice(start, i + 1)) as T;
        } catch (err) {
          throw new AiError('parse', '模型返回的 JSON 无法解析', (err as Error).message);
        }
      }
    }
  }
  throw new AiError('parse', '模型返回的 JSON 不完整', trimmed.slice(0, 200));
}

export async function askJson<T>(opts: {
  config: AiConfig;
  system: string;
  user: string;
  temperature?: number;
  signal?: AbortSignal;
}): Promise<T> {
  const res = await streamChat({
    config: opts.config,
    messages: [
      { role: 'system', content: opts.system },
      { role: 'user', content: opts.user },
    ],
    json: true,
    temperature: opts.temperature,
    signal: opts.signal,
  });
  return extractJson<T>(res.content);
}

export async function testConnection(config: AiConfig, signal?: AbortSignal): Promise<string> {
  const res = await streamChat({
    config,
    messages: [
      { role: 'system', content: 'You are a connectivity test. Reply with exactly one short sentence.' },
      { role: 'user', content: 'Reply with: connection ok' },
    ],
    temperature: 0,
    signal,
  });
  return res.content.trim() || '（模型返回了空内容）';
}

/** Long, human-readable error including the provider's own message. */
export function describeAiError(err: unknown): string {
  if (err instanceof AiError) {
    if (err.detail) {
      const detail = err.detail.length > 220 ? `${err.detail.slice(0, 219)}…` : err.detail;
      return `${err.message}：${detail}`;
    }
    return err.message;
  }
  return (err as Error)?.message ?? String(err);
}
