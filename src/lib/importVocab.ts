import type { VocabLevel, VocabType } from '../types';
import { parseDelimited, decodeFileText, stripHtmlText } from './importBank';

export const VOCAB_TYPES: { value: VocabType; label: string }[] = [
  { value: 'word', label: '单词' },
  { value: 'collocation', label: '搭配' },
  { value: 'idiom', label: '习语' },
  { value: 'phrase', label: '短语' },
  { value: 'discourse', label: '话语标记' },
];

export const VOCAB_LEVELS: { value: VocabLevel; label: string }[] = [
  { value: 'band6', label: '6 分' },
  { value: 'band7', label: '7 分' },
  { value: 'band8', label: '8 分' },
];

export interface ParsedVocabItem {
  term: string;
  phonetic?: string;
  meaningZh: string;
  meaningEn?: string;
  example?: string;
  exampleZh?: string;
  type: VocabType;
  level: VocabLevel;
  topic?: string;
  topicZh?: string;
}

export interface ParsedVocab {
  name: string;
  items: ParsedVocabItem[];
  warnings: string[];
  format: 'json' | 'table' | 'text' | 'document';
  detectedTopics: string[];
}

const TYPE_ALIASES: Record<string, VocabType> = {
  word: 'word',
  单词: 'word',
  vocab: 'word',
  collocation: 'collocation',
  搭配: 'collocation',
  idiom: 'idiom',
  习语: 'idiom',
  phrase: 'phrase',
  短语: 'phrase',
  expression: 'phrase',
  discourse: 'discourse',
  marker: 'discourse',
  话语标记: 'discourse',
};

const LEVEL_ALIASES: Record<string, VocabLevel> = {
  '6': 'band6',
  '6.0': 'band6',
  band6: 'band6',
  '7': 'band7',
  '7.0': 'band7',
  band7: 'band7',
  '8': 'band8',
  '8.0': 'band8',
  band8: 'band8',
};

const FIELD_ALIASES: Record<string, string> = {
  term: 'term',
  word: 'term',
  phrase: 'term',
  entry: 'term',
  english: 'term',
  '单词': 'term',
  '词组': 'term',
  '词条': 'term',
  '表达': 'term',
  meaning: 'meaningZh',
  'meaning_zh': 'meaningZh',
  'meaningzh': 'meaningZh',
  'meaning_cn': 'meaningZh',
  'chinese': 'meaningZh',
  '中文': 'meaningZh',
  '释义': 'meaningZh',
  '意思': 'meaningZh',
  '翻译': 'meaningZh',
  'meaning_en': 'meaningEn',
  'meaningen': 'meaningEn',
  definition: 'meaningEn',
  '英文释义': 'meaningEn',
  example: 'example',
  sentence: 'example',
  '例句': 'example',
  'example_zh': 'exampleZh',
  'examplezh': 'exampleZh',
  '例句中文': 'exampleZh',
  phonetic: 'phonetic',
  ipa: 'phonetic',
  pronunciation: 'phonetic',
  '音标': 'phonetic',
  type: 'type',
  kind: 'type',
  '类型': 'type',
  level: 'level',
  band: 'level',
  '难度': 'level',
  '等级': 'level',
  topic: 'topic',
  theme: 'topic',
  category: 'topic',
  '话题': 'topic',
  '主题': 'topic',
  'topic_zh': 'topicZh',
  'topiczh': 'topicZh',
  '话题中文': 'topicZh',
};

function cleanBrackets(value: string): string {
  return value
    .replace(/[（(]\s*(?:n|v|adj|adv|phr|idiom|informal|formal| slang)\.?\s*[)）]/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function guessType(term: string): VocabType {
  const clean = term.trim();
  const words = clean.split(/\s+/).length;
  if (/^[a-z]+$/i.test(clean)) return 'word';
  if (/^(to be|well|honestly|actually|i mean|you know|that said|having said)/i.test(clean)) return 'discourse';
  return words <= 3 ? 'collocation' : 'phrase';
}

function guessLevel(type: VocabType, term: string): VocabLevel {
  if (type === 'idiom') return 'band8';
  if (type === 'word' && term.length > 10) return 'band8';
  return 'band7';
}

function normalizeType(value: string | undefined, term: string): VocabType {
  if (!value) return guessType(term);
  const key = value.trim().toLowerCase();
  return TYPE_ALIASES[key] ?? guessType(term);
}

function normalizeLevel(value: string | undefined, type: VocabType, term: string): VocabLevel {
  if (!value) return guessLevel(type, term);
  return LEVEL_ALIASES[value.trim().toLowerCase()] ?? guessLevel(type, term);
}

function headerField(cell: string): string | null {
  const key = cell.trim().toLowerCase().replace(/[\s\-.]+/g, '_');
  return FIELD_ALIASES[key] ?? FIELD_ALIASES[key.replace(/_/g, '')] ?? null;
}

function detectTable(text: string): boolean {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return false;
  for (const delim of ['\t', ',', ';']) {
    const rows = parseDelimited(text, delim).slice(0, 6);
    if (rows.length >= 2 && rows[0].length >= 2 && rows.every((r) => r.length === rows[0].length)) return true;
  }
  return false;
}

function fromTable(text: string): ParsedVocab {
  let delimiter = '\t';
  let best = 0;
  for (const d of [',', '\t', ';']) {
    const rows = parseDelimited(text, d);
    if (rows.length > best && rows.every((r) => r.length === rows[0].length)) {
      best = rows.length;
      delimiter = d;
    }
  }
  const rows = parseDelimited(text, delimiter).filter((r) => r.some((c) => c.trim()));
  const header = rows[0].map((c) => headerField(c));
  const hasHeader = header.filter(Boolean).length >= 2;
  const columns = hasHeader
    ? header
    : rows[0].map((_, i) => (i === 0 ? 'term' : i === 1 ? 'meaningZh' : i === 2 ? 'example' : null));
  const dataRows = hasHeader ? rows.slice(1) : rows;

  const warnings: string[] = [];
  if (!hasHeader) warnings.push('未检测到表头，按「第一列=词条，第二列=释义」解析');

  const items: ParsedVocabItem[] = [];
  for (const cells of dataRows) {
    const rec: Record<string, string> = {};
    columns.forEach((field, i) => {
      if (field && cells[i] !== undefined) rec[field] = cells[i];
    });
    const term = (rec.term || '').trim();
    if (!term) continue;
    const meaningZh = cleanBrackets(rec.meaningZh || '');
    const type = normalizeType(rec.type, term);
    items.push({
      term,
      meaningZh,
      meaningEn: rec.meaningEn?.trim() || undefined,
      example: rec.example?.trim() || undefined,
      exampleZh: rec.exampleZh?.trim() || undefined,
      phonetic: rec.phonetic?.trim() || undefined,
      type,
      level: normalizeLevel(rec.level, type, term),
      topic: rec.topic?.trim() || undefined,
      topicZh: rec.topicZh?.trim() || undefined,
    });
  }
  return { name: '', items, warnings, format: 'table', detectedTopics: collectTopics(items) };
}

function fromLines(lines: string[]): ParsedVocab {
  const items: ParsedVocabItem[] = [];
  const warnings: string[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || /^[#>`]/.test(line)) continue;

    let parts = line.split(/\s*[|\t]\s*/);
    if (parts.length === 1) {
      parts = line.split(/\s+[-–—]\s+/);
    }
    if (parts.length === 1) {
      // "word, 中文" (single comma, only the right side has Chinese)
      const commas = (line.match(/,/g) || []).length;
      if (commas === 1) {
        const [left, right] = line.split(',');
        if (!/[\u4e00-\u9fa5]/.test(left) && /[\u4e00-\u9fa5]/.test(right)) parts = [left, right];
      }
    }
    if (parts.length === 1) {
      const idx = line.search(/[\u4e00-\u9fa5]/);
      if (idx > 1) parts = [line.slice(0, idx), line.slice(idx)];
    }
    if (parts.length === 1) {
      const colon = line.indexOf('：');
      if (colon > 0) parts = [line.slice(0, colon), line.slice(colon + 1)];
    }

    const term = cleanBrackets((parts[0] || '').replace(/^\d+[.)]\s*/, '').trim());
    if (!term || term.length > 120) continue;
    const meaningZh = cleanBrackets((parts[1] || '').trim());
    const example = (parts[2] || '').trim();
    const type = normalizeType(undefined, term);
    items.push({
      term,
      meaningZh,
      example: example || undefined,
      type,
      level: guessLevel(type, term),
    });
  }

  if (items.length && items.every((i) => !i.meaningZh)) {
    warnings.push('只识别到词条，没有释义——建议用「词条 | 中文 | 例句」或 CSV 格式');
  }
  return { name: '', items, warnings, format: 'text', detectedTopics: [] };
}

const CONTAINER = /^(items?|words?|lists?|vocab|vocabulary|data|entries|topics?|decks?|cards?)$/i;
const META = new Set(['name', 'title', 'description', 'version', 'author', 'source', 'topic', 'topiczh', 'deck', 'count']);

function fromJson(node: unknown): ParsedVocab {
  const items: ParsedVocabItem[] = [];
  let name = '';
  const warnings: string[] = [];

  const visit = (value: unknown, inheritedTopic?: string, depth = 0) => {
    if (depth > 6 || value == null) return;
    if (Array.isArray(value)) {
      for (const child of value) visit(child, inheritedTopic, depth + 1);
      return;
    }
    if (typeof value === 'string') {
      const entry = value.trim();
      if (entry.length < 2) return;
      const type = normalizeType(undefined, entry);
      items.push({
        term: entry,
        meaningZh: '',
        type,
        level: guessLevel(type, entry),
        topic: inheritedTopic,
        topicZh: inheritedTopic,
      });
      return;
    }
    if (typeof value !== 'object') return;
    const obj = value as Record<string, unknown>;

    const term = (obj.term || obj.word || obj.phrase || obj.english || obj['单词'] || obj['词组']) as string | undefined;
    if (term) {
      const type = normalizeType(String(obj.type ?? obj.kind ?? ''), String(term));
      const topic = (obj.topic || obj.category || inheritedTopic) as string | undefined;
      items.push({
        term: String(term).trim(),
        phonetic: obj.phonetic ? String(obj.phonetic) : obj.ipa ? String(obj.ipa) : undefined,
        meaningZh: cleanBrackets(String(obj.meaningZh ?? obj.meaning ?? obj['中文'] ?? '')),
        meaningEn: obj.meaningEn ? String(obj.meaningEn) : obj.definition ? String(obj.definition) : undefined,
        example: obj.example ? String(obj.example) : obj.sentence ? String(obj.sentence) : undefined,
        exampleZh: obj.exampleZh ? String(obj.exampleZh) : undefined,
        type,
        level: normalizeLevel(String(obj.level ?? obj.band ?? ''), type, String(term)),
        topic,
        topicZh: obj.topicZh ? String(obj.topicZh) : topic,
      });
      return;
    }

    const ownTopic =
      typeof obj.topic === 'string' ? obj.topic : typeof obj.deck === 'string' ? obj.deck : undefined;
    const baseTopic = ownTopic ?? inheritedTopic;

    for (const [key, child] of Object.entries(obj)) {
      const lower = key.toLowerCase();
      if (META.has(lower)) continue;
      if (lower === 'name' && typeof child === 'string' && !name) name = child;
      const container = CONTAINER.test(key);
      const bucketKey = container ? baseTopic : baseTopic ?? key;
      visit(child, bucketKey, depth + 1);
    }
  };

  visit(node);
  return { name, items, warnings, format: 'json', detectedTopics: collectTopics(items) };
}

function collectTopics(items: ParsedVocabItem[]): string[] {
  return [...new Set(items.map((i) => i.topic).filter(Boolean) as string[])];
}

function dedupe(items: ParsedVocabItem[]): ParsedVocabItem[] {
  const seen = new Set<string>();
  const out: ParsedVocabItem[] = [];
  for (const item of items) {
    const key = `${item.topic ?? ''}|${item.term.toLowerCase().replace(/\s+/g, ' ')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/** Any file: JSON / CSV / TXT / Markdown / HTML / PDF / Word / Excel. */
export async function parseVocabFile(file: File): Promise<ParsedVocab> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const base = file.name.replace(/\.[^.]+$/, '');

  if (ext === 'doc') throw new Error('暂不支持旧版 .doc，请另存为 .docx 后再导入');

  if (ext === 'pdf' || ext === 'docx' || ext === 'xlsx' || ext === 'xls') {
    const { extractDocument } = await import('./document');
    const extracted = await extractDocument(file);
    const parsed = parseVocabText(extracted.text, file.name);
    return {
      ...parsed,
      format: 'document',
      warnings: [...extracted.warnings, ...parsed.warnings],
    };
  }

  const text = decodeFileText(await file.arrayBuffer());

  if (ext === 'html' || ext === 'htm') {
    return { ...parseVocabText(stripHtmlText(text), file.name), format: 'document' };
  }

  if (ext === 'md' || ext === 'markdown') {
    return { ...parseVocabText(text, file.name), format: 'document' };
  }

  const parsed = parseVocabText(text, file.name);
  return { ...parsed, name: parsed.name || base };
}

export function parseVocabText(text: string, fileName = 'imported'): ParsedVocab {
  const name = fileName.replace(/\.[^.]+$/, '');
  const trimmed = text.replace(/^\uFEFF/, '').trim();
  if (!trimmed) {
    return { name, items: [], warnings: ['文件是空的'], format: 'text', detectedTopics: [] };
  }

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = fromJson(JSON.parse(trimmed));
      return { ...parsed, name: parsed.name || name, items: dedupe(parsed.items) };
    } catch (err) {
      return {
        name,
        items: [],
        warnings: [`JSON 解析失败：${(err as Error).message}`],
        format: 'json',
        detectedTopics: [],
      };
    }
  }

  const result = detectTable(trimmed) ? fromTable(trimmed) : fromLines(trimmed.split(/\r?\n/));
  return { ...result, name, items: dedupe(result.items) };
}
