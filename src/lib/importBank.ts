import type { Part, Question } from '../types';
import { normalizePart } from './data';

export type ParsedQuestion = Omit<Question, 'id' | 'bankId' | 'createdAt'>;

export interface ParsedBank {
  name: string;
  questions: ParsedQuestion[];
  warnings: string[];
  format: 'json' | 'csv' | 'text' | 'document' | 'sheet';
}

const HEADER_ALIASES: Record<string, string[]> = {
  part: ['part', 'part_number', 'partno', 'section', '部分', '题号'],
  topic: ['topic', 'theme', 'category', 'title', '话题', '主题', '类别'],
  topicZh: ['topic_zh', 'topiczh', 'topic_cn', '话题中文', '主题中文'],
  question: ['question', 'question_en', 'english', 'prompt', 'text', 'content', '题目', '问题', '题干'],
  questionZh: ['question_zh', 'questionzh', 'question_cn', 'chinese', '中文', '翻译', '题目中文'],
  bullets: ['bullets', 'bullet', 'cue_points', 'cuepoints', 'points', 'hints', '提示', '要点', '小问'],
  tags: ['tags', 'tag', 'labels', '标签'],
  difficulty: ['difficulty', 'level', '难度'],
};

function matchHeader(cell: string): string | null {
  const key = cell.trim().toLowerCase().replace(/[\s\-.]/g, '_');
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.includes(key)) return field;
  }
  return null;
}

/** RFC4180-ish parser that also tolerates TSV and stray quotes. */
export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
      field = '';
    } else if (ch === '\r') {
      /* skip */
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

function detectDelimiter(text: string): string {
  const firstLines = text.split(/\r?\n/).slice(0, 5).join('\n');
  const candidates = [',', '\t', ';', '|'];
  let best = ',';
  let bestCount = -1;
  for (const d of candidates) {
    const count = firstLines.split(d).length - 1;
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

function splitList(value: string): string[] {
  return value
    .split(/\s*(?:\||;|\n|·|•)\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function cleanBullets(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const list = splitList(value).map((s) => s.replace(/^[-–•\d.)\s]+/, '').trim());
  return list.length ? list : undefined;
}

function toQuestion(rec: Record<string, string>): ParsedQuestion | null {
  const question = (rec.question || '').trim();
  if (!question || question.length < 3) return null;
  const bullets = cleanBullets(rec.bullets);
  const part = normalizePart(rec.part, question);
  return {
    part,
    topic: (rec.topic || '').trim() || 'Custom',
    topicZh: (rec.topicZh || '').trim() || (rec.topic || '自定义').trim(),
    question,
    questionZh: rec.questionZh?.trim() || undefined,
    bullets: part === 2 ? bullets : undefined,
    tags: rec.tags ? splitList(rec.tags).slice(0, 4) : [],
    difficulty: (Number(rec.difficulty) === 3 ? 3 : Number(rec.difficulty) === 1 ? 1 : 2) as 1 | 2 | 3,
  };
}

function fromDelimited(text: string, delimiter?: string): { questions: ParsedQuestion[]; warnings: string[] } {
  const delim = delimiter ?? detectDelimiter(text);
  const rows = parseDelimited(text, delim);
  const warnings: string[] = [];
  if (!rows.length) return { questions: [], warnings: ['文件是空的'] };

  const header = rows[0].map((c) => matchHeader(c));
  const hasHeader = header.filter(Boolean).length >= 2;
  let dataRows = rows;
  let columns: (string | null)[];

  if (hasHeader) {
    columns = header;
    dataRows = rows.slice(1);
  } else {
    columns = rows[0].map((_, i) => (i === 0 ? 'question' : i === 1 ? 'topic' : null));
    dataRows = rows;
    warnings.push('未检测到表头，已按「第一列=题目，第二列=话题」解析');
  }

  const questions: ParsedQuestion[] = [];
  dataRows.forEach((cells, idx) => {
    const rec: Record<string, string> = {};
    columns.forEach((field, i) => {
      if (field && cells[i] !== undefined) rec[field] = cells[i];
    });
    const q = toQuestion(rec);
    if (q) questions.push(q);
    else if (cells.join('').trim()) warnings.push(`第 ${idx + (hasHeader ? 2 : 1)} 行缺少题目，已跳过`);
  });
  return { questions, warnings };
}

function collectFromJson(
  node: unknown,
  ctx: Partial<ParsedQuestion>,
  out: ParsedQuestion[],
  depth = 0,
): void {
  if (depth > 6 || node == null) return;

  if (Array.isArray(node)) {
    for (const child of node) collectFromJson(child, ctx, out, depth + 1);
    return;
  }

  if (typeof node === 'string') {
    const question = node.trim();
    if (question.length >= 3) {
      out.push({
        part: normalizePart(ctx.part, question),
        topic: ctx.topic || 'Custom',
        topicZh: ctx.topicZh || ctx.topic || '自定义',
        question,
        bullets: ctx.part === 2 || ctx.bullets ? ctx.bullets : undefined,
        tags: ctx.tags ?? [],
        difficulty: ctx.difficulty ?? 2,
      });
    }
    return;
  }

  if (typeof node !== 'object') return;
  const obj = node as Record<string, unknown>;

  const text =
    (obj.question as string) ||
    (obj.question_en as string) ||
    (obj.prompt as string) ||
    (obj.text as string) ||
    (obj.english as string) ||
    (obj.content as string) ||
    (obj['题目'] as string) ||
    '';

  const nextCtx: Partial<ParsedQuestion> = { ...ctx };
  const topic = (obj.topic || obj.theme || obj.category || obj.title || obj['话题'] || obj['主题']) as
    | string
    | undefined;
  if (topic) {
    nextCtx.topic = String(topic);
    nextCtx.topicZh = String((obj.topicZh || obj.topic_zh || obj['话题中文'] || topic) as string);
  }
  if (obj.part !== undefined) nextCtx.part = normalizePart(obj.part, text);
  if (obj.bullets || obj.cue_points || obj.points) {
    const b = obj.bullets ?? obj.cue_points ?? obj.points;
    nextCtx.bullets = Array.isArray(b) ? b.map(String) : cleanBullets(String(b));
  }
  if (obj.tags) nextCtx.tags = Array.isArray(obj.tags) ? obj.tags.map(String) : splitList(String(obj.tags));
  if (obj.difficulty !== undefined) {
    const d = Number(obj.difficulty);
    nextCtx.difficulty = (d === 3 ? 3 : d === 1 ? 1 : 2) as 1 | 2 | 3;
  }

  if (text && String(text).trim().length >= 3) {
    const q = toQuestion({
      question: String(text),
      part: String(nextCtx.part ?? ''),
      topic: nextCtx.topic ?? '',
      topicZh: nextCtx.topicZh ?? '',
      bullets: nextCtx.bullets?.join('|') ?? '',
      tags: nextCtx.tags?.join('|') ?? '',
      difficulty: String(nextCtx.difficulty ?? 2),
    });
    if (q) out.push(q);
    return;
  }

  for (const [key, value] of Object.entries(obj)) {
    if (['name', 'title', 'description', 'version', 'author', 'source'].includes(key)) continue;
    const partMatch = key.match(/part\s*([123])/i);
    if (partMatch) {
      collectFromJson(value, { ...nextCtx, part: Number(partMatch[1]) as Part }, out, depth + 1);
      continue;
    }
    if (typeof value === 'string') {
      collectFromJson(value, { ...nextCtx, topic: nextCtx.topic ?? key }, out, depth + 1);
      continue;
    }
    if (value && typeof value === 'object') {
      // Object bucket keyed by topic, e.g. { "Hometown": ["Where ...", ...] }
      const bucketIsArrayOfScalars =
        Array.isArray(value) && (value as unknown[]).every((v) => typeof v === 'string');
      const structuralKey = /^(?:part|section|p)?\s*\d+$|^cue_?cards?$|^questions?$|^items?$|^data$|^list$/i.test(
        key,
      );
      if (bucketIsArrayOfScalars) {
        collectFromJson(
          value,
          structuralKey
            ? nextCtx
            : { ...nextCtx, topic: nextCtx.topic ?? key, topicZh: nextCtx.topicZh ?? key },
          out,
          depth + 1,
        );
      } else {
        collectFromJson(value, nextCtx, out, depth + 1);
      }
    }
  }
}

export function parseQuestionText(text: string, fileName = 'imported'): ParsedBank {
  const baseName = fileName.replace(/\.[^.]+$/, '');
  const trimmed = text.replace(/^\uFEFF/, '').trim();
  const warnings: string[] = [];

  if (!trimmed) {
    return { name: baseName, questions: [], warnings: ['文件是空的'], format: 'text' };
  }

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const data = JSON.parse(trimmed);
      const questions: ParsedQuestion[] = [];
      let name = baseName;
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        const n = (data as Record<string, unknown>).name || (data as Record<string, unknown>).title;
        if (typeof n === 'string' && n.trim()) name = n.trim();
      }
      collectFromJson(data, {}, questions);
      const deduped = dedupe(questions);
      if (!deduped.length) {
        warnings.push('JSON 解析成功，但没有识别到题目字段（需要 question / prompt / text 等字段）');
      }
      return { name, questions: deduped, warnings, format: 'json' };
    } catch (err) {
      warnings.push(`JSON 解析失败：${(err as Error).message}`);
    }
  }

  const looksDelimited = /[,\t;|]/.test(trimmed.split(/\r?\n/).slice(0, 3).join(''));
  if (looksDelimited) {
    const parsed = fromDelimited(trimmed);
    return {
      name: baseName,
      questions: dedupe(parsed.questions),
      warnings: [...warnings, ...parsed.warnings],
      format: 'csv',
    };
  }

  const lines = trimmed
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-–•*]|\d+[.)])\s*/, '').trim())
    .filter((l) => l.length > 2 && /[A-Za-z]/.test(l));
  const questions: ParsedQuestion[] = lines.map((line) => ({
    part: normalizePart(undefined, line),
    topic: baseName,
    topicZh: baseName,
    question: line,
    tags: [],
    difficulty: 2,
  }));
  if (questions.length) warnings.push('已按「每行一题」解析纯文本文件');
  return { name: baseName, questions: dedupe(questions), warnings, format: 'text' };
}

function dedupe(list: ParsedQuestion[]): ParsedQuestion[] {
  const seen = new Set<string>();
  const out: ParsedQuestion[] = [];
  for (const q of list) {
    const key = q.question.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, ' ').trim();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(q);
  }
  return out;
}

export function decodeFileText(buffer: ArrayBuffer): string {
  try {
    // Excel on Chinese Windows exports CSV as GBK; try strict UTF-8 first.
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    try {
      return new TextDecoder('gbk').decode(buffer);
    } catch {
      return new TextDecoder('utf-8').decode(buffer);
    }
  }
}

export function stripHtmlText(html: string): string {
  if (typeof DOMParser === 'undefined') {
    return html.replace(/<[^>]+>/g, '\n').replace(/&nbsp;/g, ' ');
  }
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script,style,nav,footer,header').forEach((el) => el.remove());
  // Block elements become line breaks so headings keep their own line.
  doc.querySelectorAll('p,div,li,tr,br,h1,h2,h3,h4,h5,h6,section').forEach((el) => {
    el.append('\n');
  });
  return (doc.body?.textContent ?? '').replace(/\n{3,}/g, '\n\n');
}

/**
 * Any file the importer accepts. PDF / Word / Excel are extracted by the local
 * Node service (`/api/extract`) so the browser bundle stays small.
 */
export async function parseQuestionFile(file: File): Promise<ParsedBank> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const buffer = await file.arrayBuffer();

  if (ext === 'pdf' || ext === 'docx' || ext === 'doc') {
    if (ext === 'doc') {
      throw new Error('暂不支持旧版 .doc 格式，请在 Word 里「另存为 .docx」后再导入');
    }
    const { extractDocument } = await import('./document');
    const extracted = await extractDocument(file);
    const parsed = (await import('./parseDocument')).parseDocumentText(extracted.text, file.name);
    return {
      ...parsed,
      warnings: [...extracted.warnings, ...parsed.warnings],
      format: 'document',
    };
  }

  if (ext === 'xlsx' || ext === 'xls') {
    const { extractDocument } = await import('./document');
    const extracted = await extractDocument(file);
    // The service returns every sheet as TSV, so the existing table parser works.
    const table = fromDelimited(extracted.text, '\t');
    return {
      name: file.name.replace(/\.[^.]+$/, ''),
      questions: dedupe(table.questions),
      warnings: [...extracted.warnings, ...table.warnings],
      format: 'sheet',
    };
  }

  const text = decodeFileText(buffer);

  if (ext === 'html' || ext === 'htm') {
    const parsed = (await import('./parseDocument')).parseDocumentText(stripHtmlText(text), file.name);
    return { ...parsed, format: 'document' };
  }

  if (ext === 'md' || ext === 'markdown') {
    const plain = text
      .replace(/```[\s\S]*?```/g, '')
      .replace(/!\[[^\]]*]\([^)]*\)/g, '')
      .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
      .replace(/^\s{0,3}#{1,6}\s+/gm, '')
      .replace(/^\s*[-*+]\s+/gm, '• ')
      .replace(/[*_`>]/g, '');
    const parsed = (await import('./parseDocument')).parseDocumentText(plain, file.name);
    return { ...parsed, format: 'document' };
  }

  return parseQuestionText(text, file.name);
}

export const IMPORT_TEMPLATE_CSV = `part,topic,topic_zh,question,question_zh,bullets,tags,difficulty
1,Hometown,家乡,Where is your hometown?,你的家乡在哪里?,,高频|基础,1
2,A person you admire,你敬佩的人,Describe a person you admire.,描述一个你敬佩的人。,who the person is|how you know about them|what qualities they have|and explain why you admire this person,人物|进阶,2
3,A person you admire,你敬佩的人,What kind of people are admired in your country?,在你的国家什么样的人受到敬佩?,,抽象,3`;

export const IMPORT_TEMPLATE_JSON = JSON.stringify(
  {
    name: '我的口语题库',
    version: 1,
    questions: [
      {
        part: 1,
        topic: 'Hometown',
        topicZh: '家乡',
        question: 'Where is your hometown?',
        questionZh: '你的家乡在哪里？',
        tags: ['高频'],
        difficulty: 1,
      },
      {
        part: 2,
        topic: 'A person you admire',
        topicZh: '你敬佩的人',
        question: 'Describe a person you admire.',
        questionZh: '描述一个你敬佩的人。',
        bullets: [
          'who the person is',
          'how you know about them',
          'what qualities they have',
          'and explain why you admire this person',
        ],
        tags: ['人物'],
        difficulty: 2,
      },
    ],
  },
  null,
  2,
);
