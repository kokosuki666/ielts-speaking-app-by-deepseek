import type { Part } from '../types';
import { normalizePart } from './data';
import type { ParsedBank, ParsedQuestion } from './importBank';

interface Draft {
  part: Part;
  topic?: string;
  topicZh?: string;
  question?: string;
  questionZh?: string;
  bullets: string[];
  inCue: boolean;
  awaitingBullets: boolean;
}

const CJK = /[\u4e00-\u9fa5]/;
const QUESTION_START =
  /^(what|where|when|who|whom|whose|why|how|do|does|did|are|is|was|were|can|could|would|will|should|have|has|had|describe|tell me|talk about|explain|compare|give me|do you|are you|have you)\b/i;

/**
 * Heuristic parser for PDF / Word / HTML text dumps: finds Part headings,
 * topic headings, cue cards with bullet points, and Chinese translations.
 */
export function parseDocumentText(text: string, fileName = 'document'): ParsedBank {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\t+/g, ' ').replace(/\s{2,}/g, ' ').trim())
    .filter(Boolean)
    .filter((l) => !/^page\s*\d+(\s*(of|\/)\s*\d+)?$/i.test(l))
    .filter((l) => !/^\d{1,3}$/.test(l));

  const drafts: Draft[] = [];
  let current: Draft | null = null;
  let part: Part = 1;
  let pendingTopic: string | null = null;

  const push = () => {
    if (current?.question && current.question.trim().length > 3) {
      drafts.push(current);
    }
    current = null;
  };

  const topicFromLine = (line: string): string | null => {
    const t = line.replace(/^#+\s*/, '').replace(/[:：]\s*$/, '').trim();
    if (t.length < 2 || t.length > 60) return null;
    if (/[?？]$/.test(t)) return null;
    if (QUESTION_START.test(t)) return null;
    if (/^part\s*[123]/i.test(t)) return null;
    if (/^(ielts|speaking|test|sample|answer|band|note|tips?|question)/i.test(t) && t.length < 14) return null;
    return t;
  };

  for (const raw of lines) {
    const line = raw.replace(/^[•·▪◦]\s*/, '• ').trim();

    const partMatch = line.match(/^part\s*([123])\b/i) || line.match(/^第\s*([一二三])\s*部分/);
    if (partMatch) {
      push();
      const n = partMatch[1];
      part = n === '一' ? 1 : n === '二' ? 2 : n === '三' ? 3 : (Number(n) as Part);
      continue;
    }

    if (/^(you should say|你应该说|提示点|cue card)/i.test(line)) {
      if (current) current.awaitingBullets = true;
      continue;
    }

    if (line.startsWith('• ')) {
      const bullet = line.slice(2).trim();
      if (!bullet) continue;
      if (current && (current.inCue || current.awaitingBullets || current.part === 2) && CJK.test(bullet)) {
        continue;
      }
      if (current && (current.awaitingBullets || current.inCue)) {
        current.bullets.push(bullet);
        continue;
      }
      // A bullet outside a cue card is usually a topic hint — treat as question text.
      if (!current && QUESTION_START.test(bullet)) {
        current = { part, bullets: [], inCue: false, awaitingBullets: false, question: bullet };
        continue;
      }
      continue;
    }

    const isCue = /^(describe|talk about)\b/i.test(line);
    if (isCue) {
      push();
      current = {
        part: 2,
        topic: pendingTopic ?? undefined,
        question: line,
        bullets: [],
        inCue: true,
        awaitingBullets: false,
      };
      part = 2;
      continue;
    }

    if (/[?？]\s*$/.test(line) || (QUESTION_START.test(line) && line.length > 12 && line.length < 220)) {
      if (current && !current.inCue && current.awaitingBullets) {
        push();
      } else if (current && !current.inCue) {
        push();
      }
      current = {
        part: normalizePart(undefined, line),
        topic: pendingTopic ?? undefined,
        question: line.replace(/\s*[?？]\s*$/, '?'),
        bullets: [],
        inCue: false,
        awaitingBullets: false,
      };
      continue;
    }

    if (CJK.test(line)) {
      if (current && !current.questionZh) {
        current.questionZh = line;
        current.topicZh ||= current.topic;
        continue;
      }
      const lastQ = drafts[drafts.length - 1];
      if (lastQ && !lastQ.questionZh) {
        lastQ.questionZh = line;
        continue;
      }
      continue;
    }

    const topic = topicFromLine(line);
    if (topic) {
      push();
      pendingTopic = topic;
      // If the heading looks like "Topic: subtopic", keep the last segment.
      const seg = topic.split(/[:：]/).pop()?.trim();
      if (seg) pendingTopic = seg;
    }
  }
  push();

  const questions: ParsedQuestion[] = drafts.map((d) => ({
    part: d.part,
    topic: d.topic?.trim() || 'Imported',
    topicZh: d.topicZh?.trim() || d.topic?.trim() || '导入',
    question: d.question!.trim(),
    questionZh: d.questionZh?.trim() || undefined,
    bullets: d.part === 2 && d.bullets.length >= 2 ? d.bullets : undefined,
    tags: [],
    difficulty: 2,
  }));

  const deduped: ParsedQuestion[] = [];
  const seen = new Set<string>();
  for (const q of questions) {
    const key = q.question.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, ' ').trim();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(q);
  }

  const name = fileName.replace(/\.[^.]+$/, '');
  const warnings: string[] = [];
  if (!deduped.length) warnings.push('没有识别到题目：文档里需要有问句或 Describe 题卡');
  if (deduped.length && !deduped.some((q) => q.part === 2)) {
    warnings.push('未识别到 Part 2 题卡，已只导入 Part 1 / Part 3');
  }
  return { name, questions: deduped, warnings, format: 'document' };
}
