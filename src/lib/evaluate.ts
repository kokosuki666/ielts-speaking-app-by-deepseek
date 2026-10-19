import type {
  CriterionScore,
  CriteriaKey,
  ExamAnswer,
  ExamReport,
  PlanWeek,
  PriorityItem,
  SampleUpgrade,
  VocabSuggestion,
} from '../types';
import { CRITERIA, overallFrom, roundBand } from './band';
import { askJson, describeAiError, isConfigured, toConfig, type AiConfig } from './ai';
import { examinerPrompt } from './prompts';
import { localEvaluate } from './localScore';
import { countWords } from './format';

interface RawCriterion {
  band?: unknown;
  summary?: unknown;
  strengths?: unknown;
  weaknesses?: unknown;
  evidence?: unknown;
}

interface RawReport {
  overall?: unknown;
  criteria?: Record<string, RawCriterion>;
  overview?: unknown;
  priorities?: unknown;
  sampleUpgrades?: unknown;
  vocabSuggestions?: unknown;
  plan?: unknown;
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v.trim() : fallback;
}

function strList(v: unknown, max = 6): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => str(x)).filter(Boolean).slice(0, max);
}

function band(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? roundBand(Math.max(0, Math.min(9, n))) : 0;
}

function normalizeCriterion(raw: RawCriterion | undefined, key: CriteriaKey): CriterionScore {
  const evidence = Array.isArray(raw?.evidence)
    ? raw!.evidence
        .map((e) => {
          const o = (e ?? {}) as Record<string, unknown>;
          return {
            quote: str(o.quote),
            comment: str(o.comment),
            upgrade: str(o.upgrade) || undefined,
          };
        })
        .filter((e) => e.quote || e.comment)
        .slice(0, 5)
    : [];
  return {
    band: band(raw?.band),
    summary: str(raw?.summary, '暂无总评'),
    strengths: strList(raw?.strengths, 5),
    weaknesses: strList(raw?.weaknesses, 5),
    evidence,
  };
}

function normalize(report: RawReport, answers: ExamAnswer[], opts: { paperName: string; paperId?: string; targetBand: number; notes?: string }): ExamReport {
  const criteria = Object.fromEntries(
    CRITERIA.map((c) => [c.key, normalizeCriterion(report.criteria?.[c.key], c.key)]),
  ) as Record<CriteriaKey, CriterionScore>;

  const computed = overallFrom(criteria);
  const declared = band(report.overall);
  const overall = Math.abs(declared - computed) <= 0.5 && declared > 0 ? declared : computed;

  const priorities: PriorityItem[] = Array.isArray(report.priorities)
    ? report.priorities
        .map((p) => {
          const o = (p ?? {}) as Record<string, unknown>;
          return { title: str(o.title), why: str(o.why), actions: strList(o.actions, 4) };
        })
        .filter((p) => p.title)
        .slice(0, 3)
    : [];
  while (priorities.length < 3) {
    priorities.push({ title: '保持稳定输出', why: '持续练习以巩固当前水平。', actions: ['每天完成 1 套 Part 1 + Part 3。'] });
  }

  const sampleUpgrades: SampleUpgrade[] = Array.isArray(report.sampleUpgrades)
    ? report.sampleUpgrades
        .map((s) => {
          const o = (s ?? {}) as Record<string, unknown>;
          return { question: str(o.question), answer: str(o.answer), keyPhrases: strList(o.keyPhrases, 8) };
        })
        .filter((s) => s.answer)
        .slice(0, 3)
    : [];

  const vocabSuggestions: VocabSuggestion[] = Array.isArray(report.vocabSuggestions)
    ? report.vocabSuggestions
        .map((v) => {
          const o = (v ?? {}) as Record<string, unknown>;
          const type = str(o.type, 'phrase');
          return {
            term: str(o.term),
            meaningZh: str(o.meaningZh),
            example: str(o.example),
            type: (['word', 'collocation', 'idiom', 'phrase', 'discourse'].includes(type) ? type : 'phrase') as VocabSuggestion['type'],
          };
        })
        .filter((v) => v.term)
        .slice(0, 12)
    : [];

  const rawPlan = (report.plan ?? {}) as Record<string, unknown>;
  const weeks: PlanWeek[] = Array.isArray(rawPlan.weeks)
    ? rawPlan.weeks
        .map((w, i) => {
          const o = (w ?? {}) as Record<string, unknown>;
          return {
            week: Number(o.week) || i + 1,
            focus: str(o.focus, '综合训练'),
            tasks: strList(o.tasks, 4),
          };
        })
        .slice(0, 10)
    : [];

  return {
    id: `r_${Date.now().toString(36)}`,
    paperId: opts.paperId,
    paperName: opts.paperName,
    createdAt: Date.now(),
    overall,
    criteria,
    overview: str(report.overview, ''),
    priorities: priorities.slice(0, 3),
    sampleUpgrades,
    vocabSuggestions,
    plan: weeks.length
      ? {
          targetBand: roundBand(Number(rawPlan.targetBand) || opts.targetBand),
          gap: Math.max(0, roundBand(Number(rawPlan.gap) || opts.targetBand - overall)),
          verdict: str(rawPlan.verdict, ''),
          weeks,
        }
      : undefined,
    targetBand: opts.targetBand,
    engine: 'ai',
    answers,
    notes: opts.notes,
  };
}

export async function evaluateExam(
  answers: ExamAnswer[],
  opts: {
    paperName: string;
    paperId?: string;
    targetBand: number;
    notes?: string;
    ai: Parameters<typeof isConfigured>[0] & { temperature: number };
    signal?: AbortSignal;
    onStage?: (stage: string) => void;
  },
): Promise<ExamReport> {
  const fallback = (reason?: string) => {
    const report = localEvaluate(answers, opts);
    if (reason) report.notes = [opts.notes, `AI 评分未完成：${reason}`].filter(Boolean).join('\n');
    return report;
  };

  if (!isConfigured(opts.ai)) return fallback('未配置 AI 模型，已使用离线估算');

  const config: AiConfig = toConfig(opts.ai);
  const prompt = examinerPrompt({ targetBand: opts.targetBand, paperName: opts.paperName, notes: opts.notes });

  const transcript = answers
    .map((a) => {
      const head = `【Part ${a.part}】${a.part === 2 ? 'Cue card' : 'Question'}：${a.question}`;
      const bullets = a.bullets?.length ? `\n提示点：${a.bullets.join(' / ')}` : '';
      const body = a.skipped
        ? '\n（考生跳过了这道题）'
        : `\n作答（${a.durationSec} 秒，${countWords(a.transcript)} 词）：\n${a.transcript}`;
      return `${head}${bullets}${body}`;
    })
    .join('\n\n');

  opts.onStage?.('正在按四项标准逐句分析…');

  try {
    const raw = await askJson<RawReport>({
      config,
      system: prompt.system,
      user: `${prompt.user}\n\n完整作答记录：\n${transcript}`,
      temperature: Math.min(0.4, config.temperature),
      signal: opts.signal,
    });
    return normalize(raw, answers, opts);
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    return fallback(describeAiError(err));
  }
}
