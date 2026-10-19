import type { SpeechSettings } from '../types';

export const TTS_ERROR_EVENT = 'ielts:tts-error';
export const TTS_FALLBACK_EVENT = 'ielts:tts-fallback';
export const TTS_STATE_EVENT = 'ielts:tts-state';
export const TTS_VOICES_EVENT = 'ielts:tts-voices';

interface Runtime {
  provider: SpeechSettings['provider'];
  voiceURI: string;
  cloudVoice: string;
  ttsModel: string;
  rate: number;
}

let runtime: Runtime = {
  provider: 'edge',
  voiceURI: '',
  cloudVoice: 'en-GB-SoniaNeural',
  ttsModel: 'tts-1',
  rate: 1,
};

let currentAudio: HTMLAudioElement | null = null;
let speakingNow = false;
const blobCache = new Map<string, string>();
const MAX_CACHE = 60;

export function configureTts(settings: SpeechSettings): void {
  runtime = {
    provider: settings.provider,
    voiceURI: settings.voiceURI,
    cloudVoice: settings.cloudVoice,
    ttsModel: settings.ttsModel,
    rate: settings.rate,
  };
}

export function ttsRuntime(): Runtime {
  return { ...runtime };
}

export function isSpeaking(): boolean {
  return speakingNow;
}

function emitState(speaking: boolean): void {
  speakingNow = speaking;
  window.dispatchEvent(new CustomEvent(TTS_STATE_EVENT, { detail: speaking }));
}

function emitError(message: string): void {
  window.dispatchEvent(new CustomEvent(TTS_ERROR_EVENT, { detail: message }));
}

function cacheKey(text: string): string {
  return `${runtime.provider}|${runtime.cloudVoice}|${runtime.ttsModel}|${runtime.rate}|${text}`;
}

function putCache(key: string, url: string): void {
  if (blobCache.size >= MAX_CACHE) {
    const first = blobCache.keys().next().value;
    if (first) {
      URL.revokeObjectURL(blobCache.get(first)!);
      blobCache.delete(first);
    }
  }
  blobCache.set(key, url);
}

async function requestSpeechUrl(text: string): Promise<string> {
  const key = cacheKey(text);
  const hit = blobCache.get(key);
  if (hit) return hit;

  const res = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      provider: runtime.provider,
      voice: runtime.cloudVoice,
      model: runtime.ttsModel,
      rate: runtime.rate,
    }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || `语音合成失败（HTTP ${res.status}）`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  putCache(key, url);
  return url;
}

function playUrl(url: string, rate: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const audio = new Audio(url);
    audio.playbackRate = Math.max(0.6, Math.min(1.4, rate));
    currentAudio = audio;
    audio.onended = () => {
      currentAudio = null;
      emitState(false);
      resolve();
    };
    audio.onerror = () => {
      currentAudio = null;
      emitState(false);
      reject(new Error('音频播放失败'));
    };
    emitState(true);
    audio.play().catch((err) => {
      currentAudio = null;
      emitState(false);
      reject(err);
    });
  });
}

export function stopSpeaking(): void {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = '';
    currentAudio = null;
  }
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
  emitState(false);
}

/* ------------------------------- browser TTS ------------------------------ */

let cachedVoices: SpeechSynthesisVoice[] = [];

export function loadVoices(): SpeechSynthesisVoice[] {
  if (typeof speechSynthesis === 'undefined') return [];
  const voices = speechSynthesis.getVoices();
  if (voices.length) cachedVoices = voices;
  return cachedVoices;
}

export function voiceDiagnostics(): { name: string; uri: string; lang: string; local: boolean }[] {
  return loadVoices().map((v) => ({ name: v.name, uri: v.voiceURI, lang: v.lang, local: v.localService }));
}

function pickVoice(preferredURI: string): SpeechSynthesisVoice | null {
  const voices = loadVoices().filter((v) => /^en(-|_)/i.test(v.lang));
  if (!voices.length) return null;
  if (preferredURI) {
    const exact = voices.find((v) => v.voiceURI === preferredURI);
    if (exact) return exact;
  }
  // Prefer on-device voices: network voices are commonly blocked in mainland China.
  return (
    voices.find((v) => v.localService && /en-GB/i.test(v.lang)) ??
    voices.find((v) => v.localService) ??
    voices.find((v) => /en-GB/i.test(v.lang)) ??
    voices[0]
  );
}

function speakBrowser(text: string, rate: number): Promise<void> {
  return new Promise((resolve) => {
    if (typeof speechSynthesis === 'undefined') {
      emitError('当前浏览器不支持语音朗读');
      resolve();
      return;
    }
    const synth = speechSynthesis;
    synth.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    const voice = pickVoice(runtime.voiceURI);
    if (voice) utter.voice = voice;
    utter.lang = voice?.lang ?? 'en-GB';
    utter.rate = Math.max(0.6, Math.min(1.4, rate));
    utter.pitch = 1;
    utter.onstart = () => emitState(true);
    utter.onend = () => {
      emitState(false);
      resolve();
    };
    utter.onerror = (event) => {
      emitState(false);
      if (event.error !== 'interrupted' && event.error !== 'canceled') {
        emitError(`朗读失败（${event.error}）`);
      }
      resolve();
    };
    // Chrome drops utterances queued in the same tick as cancel().
    window.setTimeout(() => synth.speak(utter), 90);
  });
}

/* --------------------------------- public -------------------------------- */

export interface SpeakOptions {
  rate?: number;
  signal?: AbortSignal;
}

export async function speak(text: string, options: SpeakOptions = {}): Promise<void> {
  const clean = text.trim();
  if (!clean) return;
  const rate = options.rate ?? runtime.rate;
  stopSpeaking();

  if (runtime.provider === 'browser') {
    await speakBrowser(clean, rate);
    return;
  }

  try {
    const url = await requestSpeechUrl(clean);
    if (options.signal?.aborted) return;
    await playUrl(url, rate);
  } catch (err) {
    const message = (err as Error).message || '神经网络语音不可用';
    window.dispatchEvent(
      new CustomEvent(TTS_FALLBACK_EVENT, { detail: `${message}，已切换到系统语音` }),
    );
    await speakBrowser(clean, rate);
  }
}

export async function prewarmSpeech(text: string): Promise<void> {
  const clean = text.trim();
  if (!clean || runtime.provider === 'browser') return;
  try {
    await requestSpeechUrl(clean);
  } catch {
    /* prefetch is best-effort */
  }
}

export function speechSupported(): boolean {
  return typeof speechSynthesis !== 'undefined';
}

/* ------------------------------- recognition ------------------------------ */

interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

export function recognitionSupported(): boolean {
  return typeof window !== 'undefined' && Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
}

export function startRecognition(handlers: {
  onInterim?: (text: string) => void;
  onFinal?: (text: string) => void;
  onError?: (message: string) => void;
  onEnd?: () => void;
  lang?: string;
}): (() => void) | null {
  const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!Ctor) {
    handlers.onError?.('当前浏览器不支持语音识别，请用 Chrome 或 Edge');
    return null;
  }
  const rec: RecognitionLike = new Ctor();
  rec.lang = handlers.lang ?? 'en-GB';
  rec.continuous = true;
  rec.interimResults = true;

  rec.onresult = (event: any) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const text = result[0]?.transcript ?? '';
      if (result.isFinal) handlers.onFinal?.(text.trim());
      else interim += text;
    }
    if (interim) handlers.onInterim?.(interim.trim());
  };
  rec.onerror = (event: any) => {
    const map: Record<string, string> = {
      'not-allowed': '麦克风权限被拒绝，请在浏览器地址栏允许麦克风',
      'no-speech': '没有听到声音，请靠近麦克风',
      network: '语音识别需要联网（Chrome 使用 Google 服务）',
      'service-not-allowed': '浏览器禁止了语音识别服务',
    };
    handlers.onError?.(map[event.error] ?? `语音识别出错：${event.error}`);
  };
  rec.onend = () => handlers.onEnd?.();

  try {
    rec.start();
  } catch (err) {
    handlers.onError?.((err as Error).message);
    return null;
  }
  return () => {
    try {
      rec.stop();
    } catch {
      /* already stopped */
    }
  };
}

/* --------------------------------- recorder ------------------------------- */

export interface RecorderHandle {
  stop: () => Promise<{ url: string; blob: Blob } | null>;
  cancel: () => void;
}

export async function startRecorder(): Promise<RecorderHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const chunks: BlobPart[] = [];
  const recorder = new MediaRecorder(stream);
  recorder.ondataavailable = (event) => {
    if (event.data.size) chunks.push(event.data);
  };
  recorder.start(250);

  const cleanup = () => stream.getTracks().forEach((t) => t.stop());

  return {
    stop: () =>
      new Promise((resolve) => {
        recorder.onstop = () => {
          cleanup();
          if (!chunks.length) {
            resolve(null);
            return;
          }
          const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
          resolve({ url: URL.createObjectURL(blob), blob });
        };
        recorder.stop();
      }),
    cancel: () => {
      try {
        recorder.stop();
      } catch {
        /* ignore */
      }
      cleanup();
    },
  };
}
