import type {
  CriterionScore,
  CriteriaKey,
  ExamAnswer,
  ExamReport,
  PriorityItem,
  PlanWeek,
} from '../types';
import { overallFrom, roundBand, fmtBand } from './band';
import { analyzeText, truncate, type TextMetrics } from './text';
import { countWords } from './format';

/** A transparent, deterministic estimate used when no AI provider is configured. */
export function localEvaluate(
  answers: ExamAnswer[],
  opts: { paperName: string; targetBand: number; paperId?: string; notes?: string },
): ExamReport {
  const answered = answers.filter((a) => countWords(a.transcript) >= 12 && !a.skipped);
  // Typed answers have no real duration; assume a natural 130 wpm instead of
  // letting a zero duration produce an absurd speech rate.
  const effectiveDuration = (a: ExamAnswer) => {
    const words = countWords(a.transcript);
    return a.durationSec > 3 ? a.durationSec : Math.max(6, words / 2.2);
  };
  const clips = answered.map((a) => ({
    answer: a,
    metrics: analyzeText(a.transcript, effectiveDuration(a)),
  }));

  const joinMetrics = (): TextMetrics => {
    const text = answered.map((a) => a.transcript).join(' ');
    const dur = answered.reduce((s, a) => s + effectiveDuration(a), 0);
    return analyzeText(text, dur);
  };
  const all = joinMetrics();
  const avgWords = clips.length ? clips.reduce((s, c) => s + c.metrics.words, 0) / clips.length : 0;
  const wpm = all.wpm || 0;

  /* ------------------------------ Fluency ------------------------------- */
  let f = 3.9;
  f += wpm >= 150 ? 1.0 : wpm >= 125 ? 1.1 : wpm >= 100 ? 0.9 : wpm >= 80 ? 0.5 : wpm > 0 ? 0.1 : 0;
  f += all.fillerRatio < 0.008 ? 1.1 : all.fillerRatio < 0.02 ? 0.85 : all.fillerRatio < 0.04 ? 0.4 : all.fillerRatio < 0.07 ? 0.05 : -0.5;
  f += all.connectives.length >= 6 ? 0.9 : all.connectives.length >= 4 ? 0.7 : all.connectives.length >= 2 ? 0.45 : all.connectives.length >= 1 ? 0.2 : -0.2;
  f += avgWords >= 90 ? 0.7 : avgWords >= 60 ? 0.5 : avgWords >= 35 ? 0.2 : -0.3;
  f -= Math.min(0.6, all.repetition.length * 0.25);

  /* ------------------------------ Lexical ------------------------------- */
  let l = 3.6;
  l += all.ttr >= 0.6 ? 1.1 : all.ttr >= 0.5 ? 0.85 : all.ttr >= 0.38 ? 0.5 : 0.1;
  l += Math.min(1.3, all.bandPhrases.length * 0.28);
  l += all.advancedRatio >= 0.3 ? 0.9 : all.advancedRatio >= 0.2 ? 0.6 : all.advancedRatio >= 0.12 ? 0.3 : 0.1;
  l += all.avgWordLength >= 5.1 ? 0.5 : all.avgWordLength >= 4.7 ? 0.3 : 0.1;
  l += all.uniqueWords >= 200 ? 0.6 : all.uniqueWords >= 140 ? 0.4 : all.uniqueWords >= 90 ? 0.15 : 0;

  /* ------------------------------ Grammar ------------------------------- */
  const per100 = all.words ? (all.complexMarkers / all.words) * 100 : 0;
  const longRatio = all.sentences ? all.longSentences / all.sentences : 0;
  let g = 4.0;
  g += per100 >= 7 ? 1.2 : per100 >= 5 ? 1.0 : per100 >= 3.2 ? 0.7 : per100 >= 1.8 ? 0.4 : 0.05;
  g += longRatio >= 0.4 ? 0.8 : longRatio >= 0.22 ? 0.55 : longRatio >= 0.1 ? 0.25 : 0;
  g += all.avgSentence >= 18 ? 0.7 : all.avgSentence >= 13 ? 0.5 : all.avgSentence >= 9 ? 0.2 : -0.35;
  g += all.words > 300 ? 0.4 : all.words > 180 ? 0.2 : 0;

  const clampBand = (x: number) => Math.max(3.5, Math.min(8.5, roundBand(x)));
  const fb = clampBand(f);
  const lb = clampBand(l);
  const gb = clampBand(g);
  const pb = clampBand(Math.min(fb, gb) - (all.words < 120 ? 0.5 : 0));

  /* ----------------------------- Evidence ------------------------------- */
  const weakest = [...clips].sort((a, b) => a.metrics.words - b.metrics.words)[0];
  const fillerQuote = clips
    .flatMap((c) => c.metrics.fillerHits.map((h) => ({ answer: c.answer, hit: h })))
    .sort((a, b) => b.hit.count - a.hit.count)[0];

  const fluencyEvidence = [];
  if (fillerQuote) {
    const quote = findQuote(fillerQuote.answer.transcript, fillerQuote.hit.word);
    fluencyEvidence.push({
      quote,
      comment: `「${fillerQuote.hit.word}」出现 ${fillerQuote.hit.count} 次，属于填充式停顿，会拉低流利度评分。`,
      upgrade: '换成自然的思考连接词：Well, / I suppose / The thing is, 然后用完整句继续。',
    });
  }
  if (all.repetition.length) {
    fluencyEvidence.push({
      quote: all.repetition[0].phrase,
      comment: `同一表达重复 ${all.repetition[0].count} 次，说明展开时缺少新的信息点。`,
      upgrade: '每次重复前先加一层新信息：原因 → 例子 → 对比。',
    });
  }
  if (weakest && weakest.metrics.words < 45) {
    fluencyEvidence.push({
      quote: truncate(weakest.answer.transcript || '（该题作答过短）', 90),
      comment: `这道题只说了 ${weakest.metrics.words} 个词，Part ${weakest.answer.part} 建议至少 ${
        weakest.answer.part === 2 ? '150' : '55'
      } 个词。`,
      upgrade: '用「观点 + 原因 + 例子 + 回扣」四步展开，先把长度撑起来。',
    });
  }
  if (!fluencyEvidence.length) {
    fluencyEvidence.push({
      quote: truncate(answered[0]?.transcript ?? '（未检测到有效作答）', 90),
      comment: '整体节奏平稳，没有明显填充词堆积。',
      upgrade: '继续用 because / which means / that’s why 拉长逻辑链。',
    });
  }

  const lexicalEvidence = [];
  if (all.bandPhrases.length) {
    lexicalEvidence.push({
      quote: all.bandPhrases.slice(0, 3).join(' · '),
      comment: `检测到 ${all.bandPhrases.length} 个高分表达，方向正确。`,
      upgrade: '再补 2 个同义替换，避免同一词组反复出现。',
    });
  } else {
    lexicalEvidence.push({
      quote: truncate(answered[0]?.transcript ?? '', 90),
      comment: '几乎没有检测到习语或地道搭配，词汇偏“安全区”。',
      upgrade: '把 good / nice / very 换成 rewarding / appealing / incredibly，并主动用 2 个话题习语。',
    });
  }
  if (all.ttr < 0.45) {
    lexicalEvidence.push({
      quote: `词汇多样性 ${(all.ttr * 100).toFixed(0)}%`,
      comment: '实词重复率偏高，说明同一批词反复使用。',
      upgrade: '每个话题准备 8 个高频词 + 4 个同义替换，答题时强制换词。',
    });
  }

  const grammarEvidence = [];
  grammarEvidence.push({
    quote: `每 100 词复杂从句标记 ${per100.toFixed(1)} 个 · 平均句长 ${all.avgSentence.toFixed(1)} 词`,
    comment:
      per100 >= 4
        ? '从句使用频率不错，复杂句结构基本成立。'
        : '复杂句偏少，回答以简单句并列为主。',
    upgrade: '每题至少插入一个 which / that 定语从句和一个 if / although 状语从句。',
  });
  if (longRatio < 0.2) {
    grammarEvidence.push({
      quote: '多数句子短于 16 词',
      comment: '句子长度集中在短句，语法范围展示不足。',
      upgrade: '练习「一个主句 + 一个从句 + 一个例子」的三段式长句。',
    });
  }

  const pronunciationEvidence = [
    {
      quote: `语速 ${Math.round(wpm)} 词/分钟，平均词长 ${all.avgWordLength.toFixed(2)}`,
      comment: '离线引擎只能从文本与时长推断发音，结果仅供参考。',
      upgrade: '录音回放，重点检查 -ed / -s 结尾、th 音与重音位置；建议用 AI 考官模式复核。',
    },
  ];

  const criteria: Record<CriteriaKey, CriterionScore> = {
    fluency: {
      band: fb,
      summary:
        fb >= 7
          ? '表达基本不停顿，能持续展开话题，逻辑连接自然。'
          : fb >= 6
            ? '能较完整地表达，但存在重复、填充词与偶发的逻辑跳跃。'
            : '表达常被打断，依赖自我重复维持，展开深度不足。',
      strengths: [
        wpm >= 110 ? `语速 ${Math.round(wpm)} 词/分钟，接近自然交流节奏` : '愿意主动开口，态度积极',
        all.connectives.length ? `使用了 ${all.connectives.length} 个连接表达` : '句子之间能保持基本顺序',
      ],
      weaknesses: [
        all.fillerRatio > 0.03 ? `填充词占比 ${(all.fillerRatio * 100).toFixed(1)}%` : '长回答时信息点容易用尽',
        avgWords < 55 ? `平均每题仅 ${Math.round(avgWords)} 词，展开不足` : '个别话题会中途改口',
      ],
      evidence: fluencyEvidence,
    },
    lexical: {
      band: lb,
      summary:
        lb >= 7
          ? '词汇有一定宽度，能用到地道搭配，少量选词不当。'
          : lb >= 6
            ? '词汇够用但偏基础，同义替换有限。'
            : '词汇集中在高频基础词，遇到抽象话题明显吃力。',
      strengths: all.bandPhrases.length
        ? [`检测到地道表达：${all.bandPhrases.slice(0, 4).join('、')}`]
        : ['基础词汇使用准确，没有明显误用'],
      weaknesses: [
        all.ttr < 0.5 ? '实词重复率高，缺少同义替换' : '部分搭配不够地道',
        all.bandPhrases.length < 4 ? '习语与话题词储备不足' : '少数表达风格不统一',
      ],
      evidence: lexicalEvidence,
    },
    grammar: {
      band: gb,
      summary:
        gb >= 7
          ? '复杂句式使用自如，多数句子无错。'
          : gb >= 6
            ? '简单句与复杂句混用，错误不影响理解。'
            : '以简单句为主，复杂句尝试时错误较多。',
      strengths: [
        per100 >= 3 ? `复杂从句密度 ${per100.toFixed(1)}/100 词` : '基本句型稳定',
        longRatio >= 0.2 ? `长句比例 ${(longRatio * 100).toFixed(0)}%` : '句子结构清晰易理解',
      ],
      weaknesses: [
        per100 < 3 ? '定语从句与状语从句使用偏少' : '时态切换时偶有混乱',
        longRatio < 0.2 ? '句子偏短，语法范围展示不够' : '个别句子存在主谓不一致',
      ],
      evidence: grammarEvidence,
    },
    pronunciation: {
      band: pb,
      summary:
        '离线引擎无法真正评估音素，此处由语速、连贯度与时长推断，建议配置 AI 考官后复核。',
      strengths: ['语流连贯，长句没有明显断裂'],
      weaknesses: ['重音与语调变化无法从文本判断'],
      evidence: pronunciationEvidence,
    },
  };

  const overall = overallFrom(criteria);

  /* ----------------------------- Priorities ----------------------------- */
  const ranked = (Object.keys(criteria) as CriteriaKey[])
    .filter((k) => k !== 'pronunciation')
    .sort((a, b) => criteria[a].band - criteria[b].band);
  const priorityMap: Record<CriteriaKey, PriorityItem> = {
    fluency: {
      title: '把答案“撑长”并去掉填充词',
      why: '流利度是四项中最容易在 2–3 周内提升的维度，也是最影响听感的维度。',
      actions: [
        '每道 Part 1 题固定录 3 遍：30 秒 → 45 秒 → 60 秒。',
        '用「观点—原因—例子—回扣」框架，写完关键词再开口。',
        '把 um / you know 全部替换为 Well, / I suppose, / The thing is,。',
      ],
    },
    lexical: {
      title: '建立话题词组库并强制替换',
      why: '重复使用基础词会让考官认为词汇资源有限，直接影响 LR 分数。',
      actions: [
        '每天精背 10 个话题搭配，必须能用在自己的例子里。',
        '答题时刻意做 1 次同义替换（good → rewarding / worthwhile）。',
        '准备 3 个可跨话题迁移的习语，用在 Part 2 结尾。',
      ],
    },
    grammar: {
      title: '每 2 句插入一个复杂结构',
      why: 'GRA 6 → 7 的关键不是“没有错误”，而是能主动展示复杂句式。',
      actions: [
        '针对同一道题，分别用定语从句、让步状语从句、虚拟语气各改写一次。',
        '录音转写后标出所有简单句，挑一半合并成复合句。',
        '重点练习 that / which / if / although / the reason why 五个连接。',
      ],
    },
    pronunciation: {
      title: '录音回放，修重音与尾音',
      why: '发音项需要音频反馈，文本层面只能给出间接推断。',
      actions: ['每段录音跟读原声 3 次，注意重读与停顿。', '标记 -ed / -s / th 的高频错点。'],
    },
  };

  const priorities = [priorityMap[ranked[0]], priorityMap[ranked[1]], priorityMap[ranked[2]]];

  /* -------------------------------- Plan -------------------------------- */
  const gap = Math.max(0, roundBand(opts.targetBand) - overall);
  const weekCount = gap <= 0.5 ? 2 : gap <= 1 ? 4 : gap <= 1.5 ? 6 : 8;
  const focusCycle: CriteriaKey[] = [ranked[0], ranked[1], ranked[2], 'fluency', 'lexical', 'grammar', 'pronunciation', 'fluency'];
  const weeks: PlanWeek[] = Array.from({ length: weekCount }, (_, i) => {
    const focus = focusCycle[i % focusCycle.length];
    const meta = priorityMap[focus];
    return {
      week: i + 1,
      focus: meta.title,
      tasks: [
        meta.actions[(i + 0) % meta.actions.length],
        meta.actions[(i + 1) % meta.actions.length],
        i % 2 === 0 ? '完成 2 套完整模拟，并把报告里的高频错点做成词卡。' : '重录上周最差的两道题，对比进步。',
      ],
    };
  });

  return {
    id: `r_${Date.now().toString(36)}`,
    paperId: opts.paperId,
    paperName: opts.paperName,
    createdAt: Date.now(),
    overall,
    criteria,
    overview: `本次共作答 ${answered.length}/${answers.length} 道题，累计 ${all.words} 个英文词。离线引擎给出约 ${fmtBand(
      overall,
    )} 分（参考区间 ±0.5）——这是一个偏保守的下限估计，依据是语速 ${Math.round(wpm)} 词/分钟、填充词比例 ${(
      all.fillerRatio * 100
    ).toFixed(1)}%、复杂从句密度 ${per100.toFixed(1)}/100 词。配置 AI 考官后可获得逐句证据与范文升级。`,
    priorities,
    sampleUpgrades: [],
    vocabSuggestions: [],
    plan: {
      targetBand: roundBand(opts.targetBand),
      gap,
      verdict:
        gap <= 0
          ? '已经达到目标区间，下一步是稳定性训练。'
          : `距离目标 ${fmtBand(gap)} 分，按下面 ${weekCount} 周计划执行，重点补足 ${metaName(ranked[0])}。`,
      weeks,
    },
    targetBand: roundBand(opts.targetBand),
    engine: 'local',
    answers,
    notes: opts.notes,
  };
}

function metaName(k: CriteriaKey): string {
  return { fluency: '流利度', lexical: '词汇', grammar: '语法', pronunciation: '发音' }[k];
}

function findQuote(transcript: string, needle: string): string {
  const idx = transcript.toLowerCase().indexOf(needle);
  if (idx < 0) return truncate(transcript, 90);
  const start = Math.max(0, idx - 45);
  const end = Math.min(transcript.length, idx + needle.length + 45);
  return `${start > 0 ? '…' : ''}${transcript.slice(start, end).trim()}${end < transcript.length ? '…' : ''}`;
}
