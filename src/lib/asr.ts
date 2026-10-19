import type { AsrSettings, Settings } from '../types';
import { sanitizeApiKey, toConfig, type AiConfig } from './ai';

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Sends a recorded clip to the local proxy, which forwards it to an
 * OpenAI-compatible /audio/transcriptions endpoint.
 */
export async function transcribeAudio(
  blob: Blob,
  opts: { config: AiConfig; asr: AsrSettings; signal?: AbortSignal },
): Promise<string> {
  const buffer = await blob.arrayBuffer();
  if (!buffer.byteLength) throw new Error('没有录到声音');

  const res = await fetch('/api/asr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      audio: toBase64(new Uint8Array(buffer)),
      mime: blob.type || 'audio/webm',
      model: opts.asr.model,
      language: opts.asr.language,
      config: opts.config,
    }),
    signal: opts.signal,
  });

  const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string; detail?: string };
  if (!res.ok) throw new Error(data.detail || data.error || `转写失败（HTTP ${res.status}）`);
  return String(data.text || '').trim();
}

export function asrReady(asr: AsrSettings): boolean {
  return asr.provider === 'openai' && Boolean(asr.model.trim());
}

/**
 * ASR can run on its own provider (e.g. SiliconFlow for transcription while
 * chat stays on DeepSeek). An empty Base URL falls back to the AI config;
 * once a Base URL is set, its key is used as-is (local servers need none).
 */
export function buildAsrConfig(settings: Settings): AiConfig {
  const base = settings.asr.baseUrl.trim();
  if (!base) return toConfig(settings.ai);
  return {
    ...toConfig(settings.ai),
    baseUrl: base,
    apiKey: sanitizeApiKey(settings.asr.apiKey),
    model: settings.asr.model.trim() || 'whisper-1',
    useServerDefault: false,
  };
}
