/**
 * Cheap, deterministic spoken-English analysis used by the offline scoring engine.
 * Nothing here pretends to be a real acoustic assessment — it reads the transcript.
 */

export interface FillerHit {
  word: string;
  count: number;
}

export interface TextMetrics {
  words: number;
  sentences: number;
  avgSentence: number;
  longSentences: number;
  uniqueWords: number;
  ttr: number;
  fillers: number;
  fillerRatio: number;
  fillerHits: FillerHit[];
  connectives: string[];
  complexMarkers: number;
  bandPhrases: string[];
  advancedRatio: number;
  repetition: { phrase: string; count: number }[];
  wpm: number;
  avgWordLength: number;
}

const FILLERS = [
  'um', 'uh', 'er', 'erm', 'ah', 'hmm', 'mmm',
  'you know', 'i mean', 'kind of', 'sort of', 'like i said', 'actually',
];

const CONNECTIVES = [
  'however', 'although', 'though', 'whereas', 'while', 'because', 'since', 'so that',
  'in addition', 'moreover', 'furthermore', 'on the other hand', 'as a result',
  'for example', 'for instance', 'in fact', 'actually', 'to be honest', 'in my opinion',
  'what is more', 'that said', 'having said that', 'compared with', 'despite', 'instead',
  'therefore', 'meanwhile', 'eventually', 'overall', 'to sum up',
];

const COMPLEX_MARKERS = [
  'which', 'who', 'whose', 'that', 'although', 'though', 'while', 'whereas', 'because',
  'since', 'unless', 'if', 'whether', 'when', 'once', 'as long as', 'so that', 'in order to',
  'despite', 'in spite of', 'having', 'being', 'to be honest', 'the reason why',
];

/** High-value spoken vocabulary the offline engine rewards. */
export const BAND_PHRASES = [
  'a stone\'s throw away', 'off the beaten track', 'a breath of fresh air', 'part and parcel',
  'at the end of the day', 'on the whole', 'by and large', 'in the long run', 'a big fan of',
  'can\'t get enough of', 'not really my cup of tea', 'worth every penny', 'rip-off',
  'a bit of a', 'the thing is', 'to be honest', 'if I\'m being honest', 'as far as I\'m concerned',
  'it depends on', 'there\'s no denying that', 'what strikes me most', 'what I love most about',
  'grew up', 'brought up', 'hang out', 'catch up', 'wind down', 'chill out', 'grab a bite',
  'pop over', 'run errands', 'keep fit', 'take up', 'give up', 'come across', 'figure out',
  'look forward to', 'put up with', 'get the hang of', 'make the most of', 'cut down on',
  'quality of life', 'work-life balance', 'tight-knit', 'close-knit', 'fast-paced', 'laid-back',
  'cost-effective', 'user-friendly', 'time-consuming', 'eye-catching', 'mouth-watering',
  'breathtaking', 'overwhelming', 'rewarding', 'demanding', 'affordable', 'accessible',
  'sustainable', 'eco-friendly', 'cutting-edge', 'state-of-the-art', 'up-to-date',
  'handy', 'versatile', 'reliable', 'convenient', 'straightforward', 'flexible',
  'fascinating', 'intriguing', 'appealing', 'impressive', 'memorable', 'vibrant', 'cosy',
  'the pace of life', 'having said that', 'that said', 'what I like most', 'I would say',
  'in terms of', 'comes down to', 'makes a big difference', 'a big deal', 'worth it',
  'get the most out of', 'in the long term', 'day-to-day', 'hands-on', 'within walking distance',
  'home from home', 'a sense of community', 'in my experience', 'more often than not',
  'on the flip side', 'the flip side', 'it boils down to', 'a couple of reasons',
  'the obvious one', 'having grown up', 'looking back', 'these days', 'back in the day',
];

const STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'to', 'of', 'in', 'on', 'at', 'for', 'with', 'is',
  'are', 'was', 'were', 'be', 'been', 'it', 'its', 'i', 'my', 'me', 'we', 'our', 'you', 'your',
  'he', 'she', 'they', 'them', 'this', 'that', 'these', 'those', 'so', 'as', 'do', 'does',
  'did', 'have', 'has', 'had', 'not', 'very', 'just', 'can', 'could', 'would', 'will', 'there',
  'from', 'about', 'like', 'what', 'when', 'where', 'who', 'how', 'also', 'if', 'than', 'then',
]);

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function analyzeText(transcript: string, durationSec: number): TextMetrics {
  const raw = transcript.trim();
  const lower = normalize(raw);
  const wordList = raw.match(/[A-Za-z0-9'’-]+/g) ?? [];
  const words = wordList.length;
  const sentenceParts = raw
    .split(/[.!?。！？]+|\s{2,}/)
    .map((s) => s.trim())
    .filter((s) => s.split(/\s+/).filter(Boolean).length > 2);
  const sentences = Math.max(sentenceParts.length, words > 12 ? 1 : 0);
  const lengths = sentenceParts.map((s) => (s.match(/[A-Za-z0-9'’-]+/g) ?? []).length);
  const avgSentence = lengths.length ? lengths.reduce((a, b) => a + b, 0) / lengths.length : words;
  const longSentences = lengths.filter((l) => l >= 16).length;

  const unique = new Set(wordList.map((w) => w.toLowerCase().replace(/'s$/, '')));
  const contentUnique = new Set(
    [...unique].filter((w) => !STOP.has(w) && w.length > 2),
  );
  const ttr = words > 0 ? Math.min(1, contentUnique.size / Math.max(20, words * 0.55)) : 0;

  const fillerHits: FillerHit[] = [];
  let fillers = 0;
  for (const f of FILLERS) {
    const re = new RegExp(`(?:^|[^a-z])${f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:[^a-z]|$)`, 'g');
    const n = (lower.match(re) ?? []).length;
    if (n > 0) {
      fillerHits.push({ word: f, count: n });
      fillers += n;
    }
  }
  fillerHits.sort((a, b) => b.count - a.count);

  const connectives = CONNECTIVES.filter((c) => lower.includes(c));
  const complexMarkers = COMPLEX_MARKERS.reduce(
    (acc, m) => acc + (lower.match(new RegExp(`\\b${m}\\b`, 'g')) ?? []).length,
    0,
  );
  const bandPhrases = BAND_PHRASES.filter((p) => lower.includes(p));
  const advancedWords = wordList.filter((w) => w.length >= 8).length;
  const advancedRatio = words ? (advancedWords + bandPhrases.length * 4) / words : 0;

  // repeated 4-grams → tells us the candidate is looping the same chunk
  const grams = new Map<string, number>();
  const toks = lower.replace(/[^a-z0-9' ]/g, ' ').split(/\s+/).filter(Boolean);
  for (let i = 0; i + 4 <= toks.length; i++) {
    const g = toks.slice(i, i + 4).join(' ');
    if (g.split(' ').every((w) => STOP.has(w) || w.length < 4)) continue;
    grams.set(g, (grams.get(g) ?? 0) + 1);
  }
  const repetition = [...grams.entries()]
    .filter(([, n]) => n >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([phrase, count]) => ({ phrase, count }));

  const wpm = durationSec > 1 ? (words / durationSec) * 60 : words * 6;
  const avgWordLength = words ? wordList.join('').length / words : 0;

  return {
    words,
    sentences,
    avgSentence,
    longSentences,
    uniqueWords: unique.size,
    ttr,
    fillers,
    fillerRatio: words ? fillers / words : 0,
    fillerHits,
    connectives,
    complexMarkers,
    bandPhrases,
    advancedRatio,
    repetition,
    wpm,
    avgWordLength,
  };
}

export function hasCjk(text: string): boolean {
  return /[\u4e00-\u9fa5]/.test(text);
}

export function sentenceCase(s: string): string {
  const t = s.trim();
  if (!t) return t;
  return t[0].toUpperCase() + t.slice(1);
}

export function truncate(s: string, n: number): string {
  const t = s.trim();
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`;
}
