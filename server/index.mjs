#!/usr/bin/env node
/**
 * Local AI proxy + static file server.
 *
 * Why a proxy: browser CORS blocks most LLM endpoints, and keeping the key out
 * of the bundle is safer. Keys can come from the client (Settings, stored in
 * localStorage) or from the environment / .env file.
 *
 *   node server/index.mjs            # API only (dev: Vite proxies /api here)
 *   node server/index.mjs --serve    # API + built ./dist
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

const SERVE_STATIC = process.argv.includes('--serve');

/* --------------------------------- env ---------------------------------- */
function loadEnv() {
  const candidates = [path.join(ROOT, '.env'), path.join(ROOT, '.env.local')];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  }
}
loadEnv();

const ENV = {
  baseUrl: process.env.IELTS_AI_BASE_URL || 'https://api.deepseek.com/v1',
  apiKey: process.env.IELTS_AI_API_KEY || process.env.OPENAI_API_KEY || '',
  model: process.env.IELTS_AI_MODEL || 'deepseek-chat',
};
const PORT = Number(process.env.PORT || process.env.IELTS_PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';

/* --------------------------- process resilience --------------------------- */
// This is a long-running local tool: a dropped WebSocket or a stray rejected
// promise must never take the whole server (and the app) down.
process.on('uncaughtException', (err) => {
  console.error(`\n[${new Date().toLocaleTimeString()}] 未捕获异常（服务继续运行）：`);
  console.error(err?.stack || err);
});
process.on('unhandledRejection', (reason) => {
  console.error(`\n[${new Date().toLocaleTimeString()}] 未处理的 Promise 拒绝（服务继续运行）：`);
  console.error(reason?.stack || reason);
});

/* -------------------------------- helpers -------------------------------- */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.map': 'application/json',
};

function sendJSON(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readBody(req, limit = 4 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error('请求体过大'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function readRawBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error(`文件超过 ${Math.round(limit / 1024 / 1024)} MB 上限`), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/* --------------------------- document extraction -------------------------- */
const EXTRACT_LIMIT = 25 * 1024 * 1024;

async function extractPdf(buffer) {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { totalPages, text } = await extractText(pdf, { mergePages: true });
  const value = Array.isArray(text) ? text.join('\n') : String(text || '');
  return {
    kind: 'pdf',
    text: value,
    warnings: totalPages ? [] : ['PDF 中没有页面'],
    meta: { pages: totalPages },
  };
}

async function extractDocx(buffer) {
  const mammoth = (await import('mammoth')).default;
  const { value, messages } = await mammoth.extractRawText({ buffer });
  const warnings = [];
  if (messages?.length) {
    warnings.push(`Word 解析器记录了 ${messages.length} 条提示（不影响正文提取）`);
  }
  return { kind: 'docx', text: value || '', warnings, meta: {} };
}

async function extractSheet(buffer) {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const chunks = [];
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' });
    const tsv = rows
      .map((row) =>
        row
          .map((cell) => String(cell ?? '').replace(/\t/g, ' ').replace(/\r?\n/g, ' '))
          .join('\t')
          .replace(/\t+$/, ''),
      )
      .filter((line) => line.trim())
      .join('\n');
    if (tsv.trim()) chunks.push(tsv);
  }
  return {
    kind: 'xlsx',
    text: chunks.join('\n\n'),
    warnings: workbook.SheetNames.length > 1 ? [`合并了 ${workbook.SheetNames.length} 个工作表`] : [],
    meta: { sheets: workbook.SheetNames },
  };
}

async function handleExtract(req, res, name) {
  const ext = String(name || '').split('.').pop().toLowerCase();
  const supported = ['pdf', 'docx', 'xlsx', 'xls'];
  if (!supported.includes(ext)) {
    if (ext === 'doc') {
      return sendJSON(res, 400, {
        error: '暂不支持旧版 .doc',
        detail: '请用 Word 打开后「另存为 .docx」再导入。',
      });
    }
    return sendJSON(res, 415, { error: `不支持的文件类型：.${ext}` });
  }

  let buffer;
  try {
    buffer = await readRawBody(req, EXTRACT_LIMIT);
  } catch (err) {
    return sendJSON(res, err.status || 400, { error: err.message });
  }
  if (!buffer.length) return sendJSON(res, 400, { error: '文件是空的' });

  try {
    const result =
      ext === 'pdf'
        ? await extractPdf(buffer)
        : ext === 'docx'
          ? await extractDocx(buffer)
          : await extractSheet(buffer);
    return sendJSON(res, 200, result);
  } catch (err) {
    const missing = /Cannot find (module|package)/i.test(err.message);
    return sendJSON(res, missing ? 501 : 422, {
      error: missing ? '缺少文档解析依赖' : '文档解析失败',
      detail: missing ? '请在项目目录运行 npm install，然后重启 npm run dev。' : err.message,
    });
  }
}

function normalizeBase(baseUrl) {
  const url = String(baseUrl || ENV.baseUrl).trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(url)) throw Object.assign(new Error('Base URL 必须以 http:// 或 https:// 开头'), { status: 400 });
  return url.endsWith('/chat/completions') ? url : `${url}/chat/completions`;
}

function isLocalUrl(value) {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return ['localhost', '127.0.0.1', '0.0.0.0', '[::1]', '::1', 'host.docker.internal'].includes(host);
  } catch {
    return false;
  }
}

function resolveConfig(bodyConfig = {}) {
  const useDefault = Boolean(bodyConfig.useServerDefault);
  const baseUrl = (
    useDefault ? ENV.baseUrl : String(bodyConfig.baseUrl || '').trim() || ENV.baseUrl
  ).replace(/\/+$/, '');
  const model = (useDefault ? ENV.model : String(bodyConfig.model || '').trim() || ENV.model) || ENV.model;
  const local = isLocalUrl(baseUrl);

  let apiKey = useDefault ? ENV.apiKey : String(bodyConfig.apiKey || '');
  // Same provider as the server default? Then the .env key can be reused,
  // which keeps "服务端密钥" working even when the toggle is off.
  if (!apiKey && !local && ENV.apiKey && baseUrl === ENV.baseUrl.replace(/\/+$/, '')) {
    apiKey = ENV.apiKey;
  }
  if (!apiKey && !local) {
    throw Object.assign(new Error('尚未配置 API Key'), {
      status: 400,
      detail: '在「设置」里填入 API Key（本地模型可留空），或在项目根目录的 .env 中设置 IELTS_AI_API_KEY。',
    });
  }
  return { apiKey, baseUrl, model, local, temperature: bodyConfig.temperature ?? 0.6 };
}

async function upstream(cfg, messages, { stream, json, temperature, omitTemperature = false }) {
  const endpoint = normalizeBase(cfg.baseUrl);
  const body = {
    model: cfg.model,
    messages,
    stream: Boolean(stream),
  };
  if (!omitTemperature) body.temperature = temperature ?? cfg.temperature;
  if (json) body.response_format = { type: 'json_object' };

  const headers = { 'Content-Type': 'application/json' };
  // Local runtimes (Ollama / LM Studio / vLLM) usually need no key at all.
  if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180_000);
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return { res, endpoint };
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------ text to speech ---------------------------- */
const TTS_MAX_CHARS = 1200;
const TTS_CACHE_LIMIT = 160;
const ttsCache = new Map();

const EDGE_DEFAULT_VOICE = 'en-GB-SoniaNeural';

function ttsCacheKey(parts) {
  return crypto.createHash('sha1').update(parts.join('|')).digest('hex');
}

async function synthesizeEdgeOnce(tts, text, rate) {
  const { audioStream } = tts.toStream(text, { rate });
  const chunks = [];
  const buffer = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('语音合成超时')), 45000);
    audioStream.on('data', (chunk) => chunks.push(chunk));
    audioStream.on('close', () => {
      clearTimeout(timer);
      resolve(Buffer.concat(chunks));
    });
    audioStream.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
  if (!buffer.length) throw new Error('语音服务返回了空音频');
  return buffer;
}

/**
 * Reuse the Edge WebSocket per voice: the handshake costs ~1s, so pooling keeps
 * repeat playback fast (vocabulary drills hit the same voice constantly).
 * Requests are also serialized with a small gap — the service throttles bursts.
 */
const edgePool = new Map();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let edgeChain = Promise.resolve();
let lastEdgeAt = 0;
const EDGE_MIN_GAP_MS = 250;

function scheduleEdge(task) {
  const run = edgeChain.then(task, task);
  edgeChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function createEdgeClient(voice) {
  const { MsEdgeTTS, OUTPUT_FORMAT } = await import('msedge-tts');
  const tts = new MsEdgeTTS({ connectionTimeoutMs: 10000, synthesisTimeoutMs: 40000 });
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  return { tts, lastUsed: Date.now() };
}

async function edgeAttempt(text, voice, rate) {
  let entry = edgePool.get(voice);
  if (!entry) {
    entry = await createEdgeClient(voice);
    edgePool.set(voice, entry);
  }
  try {
    entry.lastUsed = Date.now();
    return await synthesizeEdgeOnce(entry.tts, text, rate);
  } catch (err) {
    try {
      entry.tts.close();
    } catch {
      /* ignore */
    }
    edgePool.delete(voice);
    throw err;
  }
}

async function synthesizeEdge(text, voice, rate) {
  return scheduleEdge(async () => {
    const gap = EDGE_MIN_GAP_MS - (Date.now() - lastEdgeAt);
    if (gap > 0) await sleep(gap);
    lastEdgeAt = Date.now();

    let lastError;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await edgeAttempt(text, voice, rate);
      } catch (err) {
        lastError = err;
        const throttled = /429|Too Many Requests/i.test(String(err.message || ''));
        if (throttled && attempt < 2) {
          await sleep(1000 * (attempt + 1));
          continue;
        }
        if (!throttled && attempt === 0) continue;
        throw err;
      }
    }
    throw lastError || new Error('语音合成失败');
  });
}

setInterval(() => {
  const now = Date.now();
  for (const [voice, entry] of edgePool) {
    if (now - entry.lastUsed > 120_000) {
      try {
        entry.tts.close();
      } catch {
        /* ignore */
      }
      edgePool.delete(voice);
    }
  }
}, 60_000).unref?.();

function normalizeSpeechEndpoint(baseUrl) {
  const url = String(baseUrl || ENV.baseUrl).trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(url)) {
    throw Object.assign(new Error('Base URL 必须以 http:// 或 https:// 开头'), { status: 400 });
  }
  return url.endsWith('/audio/speech') ? url : `${url}/audio/speech`;
}

async function synthesizeOpenAi(text, { baseUrl, apiKey, model, voice, speed }) {
  const endpoint = normalizeSpeechEndpoint(baseUrl);
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        input: text,
        voice,
        speed,
        response_format: 'mp3',
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw Object.assign(new Error(`TTS 服务返回 ${res.status}: ${body.slice(0, 300)}`), {
        status: res.status === 401 || res.status === 403 ? 401 : 502,
      });
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    if (!buffer.length) throw new Error('TTS 服务返回了空音频');
    return buffer;
  } finally {
    clearTimeout(timer);
  }
}

async function handleTts(req, res) {
  let payload;
  try {
    payload = JSON.parse(await readBody(req, 512 * 1024));
  } catch (err) {
    return sendJSON(res, err.status || 400, { error: '请求格式错误', detail: err.message });
  }

  const text = String(payload.text || '').replace(/\s+/g, ' ').trim().slice(0, TTS_MAX_CHARS);
  if (!text) return sendJSON(res, 400, { error: '缺少要朗读的文本' });

  const provider = payload.provider === 'openai' ? 'openai' : 'edge';
  const rate = Math.min(1.5, Math.max(0.5, Number(payload.rate) || 1));

  try {
    let buffer;
    let key;

    if (provider === 'edge') {
      const voice = /^[A-Za-z]{2,3}-[A-Za-z]{2,4}-[A-Za-z]+Neural$/.test(String(payload.voice || ''))
        ? String(payload.voice)
        : EDGE_DEFAULT_VOICE;
      key = ttsCacheKey(['edge', voice, rate, text]);
      buffer = ttsCache.get(key);
      if (!buffer) buffer = await synthesizeEdge(text, voice, rate);
    } else {
      if (!payload.config || !payload.config.baseUrl) {
        return sendJSON(res, 400, {
          error: 'OpenAI TTS 需要配置 Base URL',
          detail: '请在设置里填写 AI Base URL 与 API Key（或使用免费的 Edge 神经音色）。',
        });
      }
      const cfg = resolveConfig(payload.config);
      const voice = String(payload.voice || 'alloy');
      const model = String(payload.model || 'tts-1');
      key = ttsCacheKey(['openai', cfg.baseUrl, model, voice, rate, text]);
      buffer = ttsCache.get(key);
      if (!buffer) {
        buffer = await synthesizeOpenAi(text, {
          baseUrl: cfg.baseUrl,
          apiKey: cfg.apiKey,
          model,
          voice,
          speed: rate,
        });
      }
    }

    if (ttsCache.size >= TTS_CACHE_LIMIT) {
      const oldest = ttsCache.keys().next().value;
      if (oldest) ttsCache.delete(oldest);
    }
    ttsCache.set(key, buffer);

    res.writeHead(200, {
      'Content-Type': 'audio/mpeg',
      'Content-Length': buffer.length,
      'Cache-Control': 'no-store',
    });
    res.end(buffer);
  } catch (err) {
    const status = err.status || 502;
    return sendJSON(res, status, {
      error: provider === 'edge' ? '神经音色合成失败' : 'TTS 合成失败',
      detail: err.message,
    });
  }
}

/* ------------------------------- web import ------------------------------- */
const FETCH_LIMIT = 5 * 1024 * 1024;

async function handleFetchPage(req, res, target) {
  let url;
  try {
    url = new URL(String(target || ''));
  } catch {
    return sendJSON(res, 400, { error: '网址格式不正确' });
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return sendJSON(res, 400, { error: '只支持 http / https 网址' });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const upstream = await fetch(url, {
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/json,text/plain;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8',
      },
      signal: controller.signal,
    });
    if (!upstream.ok) {
      return sendJSON(res, 502, {
        error: `网页返回 ${upstream.status}`,
        detail: upstream.statusText || '对方服务器拒绝了请求',
      });
    }
    const buffer = Buffer.from(await upstream.arrayBuffer());
    if (buffer.length > FETCH_LIMIT) {
      return sendJSON(res, 413, { error: '网页内容超过 5 MB，请改用文件导入' });
    }
    let text;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    } catch {
      try {
        text = new TextDecoder('gbk').decode(buffer);
      } catch {
        text = buffer.toString('utf8');
      }
    }
    return sendJSON(res, 200, {
      text,
      contentType: upstream.headers.get('content-type') || '',
      finalUrl: upstream.url || url.toString(),
    });
  } catch (err) {
    const detail = err.name === 'AbortError' ? '请求超时（15 秒）' : err.message;
    return sendJSON(res, 504, { error: '抓取网页失败', detail });
  } finally {
    clearTimeout(timer);
  }
}

/* --------------------------------- routes -------------------------------- */
async function handleChat(req, res) {
  let payload;
  try {
    payload = JSON.parse(await readBody(req));
  } catch (err) {
    return sendJSON(res, err.status || 400, { error: '请求格式错误', detail: err.message });
  }

  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  if (!messages.length) return sendJSON(res, 400, { error: '缺少 messages' });

  let cfg;
  try {
    cfg = resolveConfig(payload.config);
  } catch (err) {
    return sendJSON(res, err.status || 400, { error: err.message, detail: err.detail });
  }

  const wantsStream = payload.stream !== false;
  const wantsJson = Boolean(payload.json);

  // Some providers / gateways reject response_format or temperature. Retry with
  // progressively simpler payloads so "any OpenAI-compatible model" holds up.
  const variants = wantsJson
    ? [{ json: true }, { json: false }, { json: false, omitTemperature: true }]
    : [{ json: false }, { json: false, omitTemperature: true }];

  let result;
  for (let i = 0; i < variants.length; i++) {
    try {
      result = await upstream(cfg, messages, {
        stream: wantsStream,
        temperature: payload.temperature,
        ...variants[i],
      });
    } catch (err) {
      const msg = err.name === 'AbortError' ? '上游请求超时（180s）' : err.message;
      return sendJSON(res, 504, { error: '无法连接 AI 服务', detail: msg });
    }
    if (result.res.ok) break;
    const retryable = result.res.status === 400 || result.res.status === 422;
    if (!retryable || i === variants.length - 1) break;
    // Drain the failed body before retrying on the same keep-alive connection.
    await result.res.text().catch(() => '');
  }

  const { res: up } = result;
  if (!up.ok) {
    const text = await up.text().catch(() => '');
    let detail = text.slice(0, 800);
    try {
      const parsed = JSON.parse(text);
      detail = parsed.error?.message || parsed.message || detail;
    } catch {
      /* keep raw */
    }
    const status = up.status === 401 || up.status === 403 ? 401 : up.status === 429 ? 429 : 502;
    return sendJSON(res, status, { error: `AI 服务返回 ${up.status}`, detail });
  }

  const contentType = up.headers.get('content-type') || '';

  if (!wantsStream || !contentType.includes('text/event-stream')) {
    const data = await up.json().catch(async () => ({ raw: await up.text().catch(() => '') }));
    const content =
      data?.choices?.[0]?.message?.content ??
      data?.choices?.[0]?.text ??
      data?.content ??
      '';
    return sendJSON(res, 200, { content, usage: data?.usage ?? null });
  }

  res.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for await (const chunk of up.body) {
      buffer += decoder.decode(chunk, { stream: true });
      let idx;
      while ((idx = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        for (const line of block.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (!data || data === '[DONE]') continue;
          try {
            const evt = JSON.parse(data);
            const delta = evt?.choices?.[0]?.delta?.content ?? evt?.choices?.[0]?.text ?? '';
            if (delta) res.write(delta);
          } catch {
            /* skip malformed keep-alive */
          }
        }
      }
    }
  } catch (err) {
    res.write(`\n[stream error: ${err.message}]`);
  } finally {
    res.end();
  }
}

function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath.split('?')[0]);
  if (rel === '/' || rel === '') rel = '/index.html';
  const filePath = path.join(DIST, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!filePath.startsWith(DIST)) return sendJSON(res, 403, { error: 'forbidden' });

  let target = filePath;
  if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) {
    target = path.join(DIST, 'index.html');
  }
  if (!fs.existsSync(target)) {
    return sendJSON(res, 404, {
      error: '前端尚未构建',
      detail: '先运行 `npm run build`，或者用 `npm run dev` 开发模式。',
    });
  }
  const ext = path.extname(target).toLowerCase();
  const data = fs.readFileSync(target);
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': data.length,
    'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=31536000, immutable',
  });
  res.end(data);
}

/**
 * Speech-to-text proxy. Browsers' Web Speech API sends audio to Google in
 * Chrome, which is unreachable in mainland China; this endpoint lets the app
 * use any OpenAI-compatible /audio/transcriptions provider instead.
 */
async function handleAsr(req, res) {
  let payload;
  try {
    payload = JSON.parse(await readBody(req, 30 * 1024 * 1024));
  } catch (err) {
    return sendJSON(res, err.status || 400, { error: '请求格式错误', detail: err.message });
  }

  const audio = String(payload.audio || '');
  if (!audio) return sendJSON(res, 400, { error: '缺少音频数据' });

  let cfg;
  try {
    cfg = resolveConfig(payload.config);
  } catch (err) {
    return sendJSON(res, err.status || 400, { error: err.message, detail: err.detail });
  }

  const model = String(payload.model || '').trim() || 'whisper-1';
  const buffer = Buffer.from(audio, 'base64');
  if (!buffer.length) return sendJSON(res, 400, { error: '音频为空' });

  const form = new FormData();
  form.append('file', new Blob([buffer], { type: payload.mime || 'audio/webm' }), 'answer.webm');
  form.append('model', model);
  form.append('response_format', 'json');
  if (payload.language) form.append('language', String(payload.language));

  const endpoint = `${cfg.baseUrl.replace(/\/+$/, '')}/audio/transcriptions`;
  const headers = {};
  if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  try {
    const up = await fetch(endpoint, { method: 'POST', headers, body: form, signal: controller.signal });
    const text = await up.text().catch(() => '');
    if (!up.ok) {
      let detail = text.slice(0, 500);
      try {
        const parsed = JSON.parse(text);
        detail = parsed.error?.message || parsed.message || detail;
      } catch {
        /* keep raw */
      }
      const status = up.status === 401 || up.status === 403 ? 401 : up.status === 429 ? 429 : 502;
      return sendJSON(res, status, { error: `转写服务返回 ${up.status}`, detail });
    }
    let data = {};
    try {
      data = JSON.parse(text);
    } catch {
      data = { text: text.trim() };
    }
    return sendJSON(res, 200, { text: data.text || data.result || '' });
  } catch (err) {
    const detail = err.name === 'AbortError' ? '转写超时（120s）' : err.message;
    return sendJSON(res, 504, { error: '无法连接转写服务', detail });
  } finally {
    clearTimeout(timer);
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  if (pathname === '/api/health') {
    return sendJSON(res, 200, {
      ok: true,
      ai: Boolean(ENV.apiKey),
      model: ENV.model,
      baseUrl: ENV.baseUrl,
      static: SERVE_STATIC && fs.existsSync(DIST),
      extract: true,
      tts: ['edge', 'openai'],
      version: '1.2.0',
    });
  }

  if (pathname === '/api/tts') {
    if (req.method !== 'POST') return sendJSON(res, 405, { error: 'method not allowed' });
    try {
      return await handleTts(req, res);
    } catch (err) {
      if (!res.headersSent) sendJSON(res, 500, { error: '语音服务内部错误', detail: err.message });
      else res.end();
      return;
    }
  }

  if (pathname === '/api/fetch') {
    try {
      return await handleFetchPage(req, res, url.searchParams.get('url'));
    } catch (err) {
      if (!res.headersSent) sendJSON(res, 500, { error: '抓取服务内部错误', detail: err.message });
      else res.end();
      return;
    }
  }

  if (pathname === '/api/extract') {
    if (req.method !== 'POST') return sendJSON(res, 405, { error: 'method not allowed' });
    try {
      return await handleExtract(req, res, url.searchParams.get('name'));
    } catch (err) {
      if (!res.headersSent) sendJSON(res, 500, { error: '解析服务内部错误', detail: err.message });
      else res.end();
      return;
    }
  }

  if (pathname === '/api/asr') {
    if (req.method !== 'POST') return sendJSON(res, 405, { error: 'method not allowed' });
    try {
      return await handleAsr(req, res);
    } catch (err) {
      if (!res.headersSent) sendJSON(res, 500, { error: '转写服务内部错误', detail: err.message });
      else res.end();
      return;
    }
  }

  if (pathname === '/api/ai/chat') {
    if (req.method !== 'POST') return sendJSON(res, 405, { error: 'method not allowed' });
    try {
      return await handleChat(req, res);
    } catch (err) {
      if (!res.headersSent) sendJSON(res, 500, { error: '代理内部错误', detail: err.message });
      else res.end();
      return;
    }
  }

  if (pathname.startsWith('/api/')) {
    return sendJSON(res, 404, { error: 'unknown endpoint' });
  }

  if (SERVE_STATIC) return serveStatic(req, res, pathname);

  return sendJSON(res, 404, { error: 'not found', hint: 'dev 模式请访问 Vite 端口' });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  端口 ${PORT} 已被占用。关掉占用该端口的程序，或改用其他端口：`);
    console.error(`  PowerShell:  $env:PORT=8790; npm run dev\n`);
    // 78 = configuration error: the supervisor must not keep restarting us.
    process.exit(78);
  }
  console.error(`\n  服务启动失败：${err.message}\n`);
  process.exit(1);
});

// Keep idle keep-alive sockets alive longer than the browser's polling gap, so
// the first request after a quiet period does not fail with ECONNRESET.
server.keepAliveTimeout = 120_000;
server.headersTimeout = 125_000;

// Malformed request from a dropped connection: close that socket only.
server.on('clientError', (err, socket) => {
  if (socket.writable && !socket.destroyed) {
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
  } else {
    socket.destroy();
  }
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log('\n  正在关闭本地服务…');
    try {
      server.close();
    } catch {
      /* ignore */
    }
    setTimeout(() => process.exit(0), 150).unref?.();
  });
}

server.listen(PORT, HOST, () => {
  console.log(`\n  IELTS Speaking Studio - AI proxy`);
  console.log(`  -> http://${HOST}:${PORT}`);
  console.log(`  AI: ${ENV.apiKey ? `已配置（${ENV.model}）` : '未配置（可在网站设置里填 API Key）'}`);
  if (SERVE_STATIC) console.log(`  Static: ${DIST}`);
  console.log('');
});
