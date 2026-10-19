import type { CriteriaKey } from '../types';

export interface CriterionMeta {
  key: CriteriaKey;
  en: string;
  zh: string;
  short: string;
  blurb: string;
}

export const CRITERIA: CriterionMeta[] = [
  {
    key: 'fluency',
    en: 'Fluency & Coherence',
    zh: '流利度与连贯性',
    short: 'FC',
    blurb: '语速、停顿、自我修正与话题展开的逻辑',
  },
  {
    key: 'lexical',
    en: 'Lexical Resource',
    zh: '词汇多样性',
    short: 'LR',
    blurb: '词汇的准确度、搭配、习语与同义替换能力',
  },
  {
    key: 'grammar',
    en: 'Grammatical Range & Accuracy',
    zh: '语法多样性与准确性',
    short: 'GRA',
    blurb: '复杂句式的使用与语法错误对理解的影响',
  },
  {
    key: 'pronunciation',
    en: 'Pronunciation',
    zh: '发音',
    short: 'P',
    blurb: '清晰度、重音节奏、语调与连读',
  },
];

/** Official IELTS overall rounding: average of four criteria to the nearest half band. */
export function roundBand(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const clamped = Math.max(0, Math.min(9, value));
  return Math.round(clamped * 2) / 2;
}

export function overallFrom(criteria: Record<CriteriaKey, { band: number }>): number {
  const vals = CRITERIA.map((c) => criteria[c.key]?.band ?? 0);
  return roundBand(vals.reduce((a, b) => a + b, 0) / vals.length);
}

export function fmtBand(value: number | undefined | null): string {
  if (value === undefined || value === null || Number.isNaN(value)) return '—';
  return value.toFixed(1);
}

export function bandTone(band: number): 'poor' | 'fair' | 'good' | 'great' | 'elite' {
  if (band >= 8) return 'elite';
  if (band >= 7) return 'great';
  if (band >= 6) return 'good';
  if (band >= 5) return 'fair';
  return 'poor';
}

/** Maps a band to the four semantic tones used by <Tag>. */
export function tagTone(band: number): 'ok' | 'accent' | 'warn' | 'bad' {
  const tone = bandTone(band);
  return tone === 'elite' || tone === 'great' ? 'ok' : tone === 'good' ? 'accent' : tone === 'fair' ? 'warn' : 'bad';
}

export const BAND_SCALE: { band: number; label: string; desc: string }[] = [
  { band: 5, label: '5.0', desc: '能交流但频繁停顿，句子结构有限' },
  { band: 5.5, label: '5.5', desc: '基本能表达，词汇与语法仍有明显不足' },
  { band: 6, label: '6.0', desc: '能较流畅地讨论熟悉话题，有可见错误' },
  { band: 6.5, label: '6.5', desc: '表达较自然，偶有卡顿与用词不当' },
  { band: 7, label: '7.0', desc: '流利、少停顿，能使用一定复杂句式与地道表达' },
  { band: 7.5, label: '7.5', desc: '接近自如，用词精准，逻辑清晰' },
  { band: 8, label: '8.0', desc: '流利自然，词汇丰富灵活，错误极少' },
  { band: 8.5, label: '8.5', desc: '近乎母语者的表达，话题展开充分' },
  { band: 9, label: '9.0', desc: '完全自如、精确、地道' },
];

/** Canonical band-descriptor bullet points, condensed for prompt + UI tooltips. */
export const BAND_DESCRIPTORS: Record<CriteriaKey, { band: number; text: string }[]> = {
  fluency: [
    { band: 9, text: 'Fully fluent, only native-like hesitation for content, completely coherent.' },
    { band: 8, text: 'Fluent with only occasional hesitation; ideas developed coherently with fully appropriate marking.' },
    { band: 7, text: 'Speaks at length without noticeable effort; some hesitation or repetition; uses a range of connectives and discourse markers.' },
    { band: 6, text: 'Willing to speak at length but loses coherence at times; uses connectives but not always appropriately.' },
    { band: 5, text: 'Usually maintains flow but relies on repetition and self-correction; over-uses simple connectives.' },
  ],
  lexical: [
    { band: 9, text: 'Uses vocabulary with full flexibility and precision; idiomatic language used naturally.' },
    { band: 8, text: 'Uses a wide vocabulary resource readily and flexibly; skilful use of less common and idiomatic items with occasional slips.' },
    { band: 7, text: 'Uses vocabulary resource flexibly to discuss a variety of topics; some less common and idiomatic items, with some awareness of style.' },
    { band: 6, text: 'Has a wide enough vocabulary to discuss topics at length; generally paraphrases successfully, but with limited flexibility.' },
    { band: 5, text: 'Manages to talk about familiar and unfamiliar topics but vocabulary is limited; frequent paraphrasing.' },
  ],
  grammar: [
    { band: 9, text: 'Uses a full range of structures naturally and appropriately; errors are rare and negligible.' },
    { band: 8, text: 'Uses a wide range of structures flexibly; the majority of sentences are error-free.' },
    { band: 7, text: 'Uses a range of complex structures with some flexibility; frequently produces error-free sentences.' },
    { band: 6, text: 'Uses a mix of simple and complex structures but with limited flexibility; errors rarely impede communication.' },
    { band: 5, text: 'Uses only a limited range of structures; attempts complex sentences but with frequent errors.' },
  ],
  pronunciation: [
    { band: 9, text: 'Uses a full range of pronunciation features with precision; sustained flexible use; effortless to understand.' },
    { band: 8, text: 'Sustained flexible use of features; easily understood throughout; occasional lapses.' },
    { band: 7, text: 'Shows all the positive features of band 6 with some, but not all, band 8 features.' },
    { band: 6, text: 'Uses a range of features with mixed control; some effective use of intonation; generally clear, occasional lapses.' },
    { band: 5, text: 'Shows some features of band 6 but generally limited control; listener may need some effort.' },
  ],
};

export function nextBandTarget(current: number, target: number): string {
  const gap = target - current;
  if (gap <= 0) return '已达成目标分数，继续打磨稳定性即可。';
  if (gap <= 0.5) return '距离目标只差半步，重点在稳定性与细节精度。';
  if (gap <= 1) return '一个可实现的台阶，需要 4–6 周的针对性训练。';
  if (gap <= 1.5) return '跨度较大，需要 8–10 周并同时补语言基础。';
  return '跨度很大，建议分阶段设目标，先稳固当前分数。';
}
