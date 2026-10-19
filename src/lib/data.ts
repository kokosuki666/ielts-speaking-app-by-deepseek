import seedQuestions from '../data/seed-questions.json';
import seedVocab from '../data/seed-vocab.json';
import type { Bank, Part, Question, VocabItem, VocabLevel, VocabType } from '../types';
import { slug } from './id';

export const BUILTIN_BANK_ID = 'bank_builtin';

interface RawQuestion {
  part?: number | string;
  topic?: string;
  topicZh?: string;
  question?: string;
  questionZh?: string;
  bullets?: string[];
  tags?: string[];
  difficulty?: number;
}

interface RawVocabItem {
  term: string;
  phonetic?: string;
  meaningZh: string;
  meaningEn?: string;
  example: string;
  exampleZh?: string;
  type: string;
  level: string;
}

const VALID_TYPES: VocabType[] = ['word', 'collocation', 'idiom', 'phrase', 'discourse'];

export function loadBuiltinQuestions(): { bank: Bank; questions: Question[] } {
  const raw = (seedQuestions as { name?: string; questions?: RawQuestion[] }).questions ?? [];
  const now = Date.now();
  const questions: Question[] = raw.map((q, i) => {
    const part = normalizePart(q.part, q.question);
    return {
      id: `q_builtin_${i + 1}`,
      part,
      topic: (q.topic || 'General').trim(),
      topicZh: (q.topicZh || q.topic || '通用').trim(),
      question: String(q.question || '').trim(),
      questionZh: q.questionZh?.trim(),
      bullets: Array.isArray(q.bullets) ? q.bullets.filter(Boolean) : undefined,
      tags: Array.isArray(q.tags) ? q.tags.filter(Boolean) : [],
      difficulty: (q.difficulty === 3 ? 3 : q.difficulty === 1 ? 1 : 2) as 1 | 2 | 3,
      bankId: BUILTIN_BANK_ID,
      createdAt: now,
    };
  });
  const bank: Bank = {
    id: BUILTIN_BANK_ID,
    name: (seedQuestions as { name?: string }).name || '内置题库',
    source: 'builtin',
    importedAt: now,
    questionCount: questions.length,
    topics: [...new Set(questions.map((q) => q.topic))],
  };
  return { bank, questions };
}

export function loadBuiltinVocab(): VocabItem[] {
  const topics = (seedVocab as { topics?: { topic: string; topicZh: string; items: RawVocabItem[] }[] }).topics ?? [];
  const now = Date.now();
  const out: VocabItem[] = [];
  for (const t of topics) {
    t.items.forEach((item, i) => {
      out.push({
        id: `v_builtin_${slug(t.topic)}_${i + 1}`,
        topic: t.topic,
        topicZh: t.topicZh,
        term: item.term.trim(),
        phonetic: item.phonetic,
        meaningZh: item.meaningZh,
        meaningEn: item.meaningEn,
        example: item.example,
        exampleZh: item.exampleZh,
        type: VALID_TYPES.includes(item.type as VocabType) ? (item.type as VocabType) : 'phrase',
        level: (['band6', 'band7', 'band8'].includes(item.level) ? item.level : 'band7') as VocabLevel,
        source: 'builtin',
        createdAt: now,
      });
    });
  }
  return out;
}

export function normalizePart(part: unknown, question?: unknown): Part {
  const n = typeof part === 'string' ? parseInt(part.replace(/\D/g, ''), 10) : Number(part);
  if (n === 1 || n === 2 || n === 3) return n as Part;
  const q = String(question ?? '').toLowerCase();
  if (q.startsWith('describe ')) return 2;
  if (q.includes('cue card')) return 2;
  return 1;
}

export const DEFAULT_TOPIC_META: Record<string, { zh: string; emoji: string }> = {
  Hometown: { zh: '家乡', emoji: '🏘️' },
  'Work or study': { zh: '工作与学习', emoji: '💼' },
  'Home & accommodation': { zh: '住房', emoji: '🏡' },
  'Daily routine': { zh: '日常作息', emoji: '🌤️' },
  Food: { zh: '饮食', emoji: '🍜' },
  'Weather & seasons': { zh: '天气与季节', emoji: '🌦️' },
  Hobbies: { zh: '兴趣爱好', emoji: '🎨' },
  Music: { zh: '音乐', emoji: '🎧' },
  'Films & TV': { zh: '电影电视', emoji: '🎬' },
  Reading: { zh: '阅读', emoji: '📚' },
  Shopping: { zh: '购物', emoji: '🛍️' },
  Travel: { zh: '旅行', emoji: '✈️' },
  Technology: { zh: '科技', emoji: '💻' },
  'Friends & family': { zh: '朋友与家人', emoji: '👨‍👩‍👧' },
};

export function topicEmoji(topic: string): string {
  for (const [key, meta] of Object.entries(DEFAULT_TOPIC_META)) {
    if (topic.toLowerCase().includes(key.toLowerCase().split(' ')[0])) return meta.emoji;
  }
  return '💬';
}

export function partLabel(part: Part): string {
  return part === 1 ? 'Part 1 · 日常问答' : part === 2 ? 'Part 2 · 个人陈述' : 'Part 3 · 深入讨论';
}

export function partShort(part: Part): string {
  return `P${part}`;
}
