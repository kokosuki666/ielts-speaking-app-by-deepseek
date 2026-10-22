import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../store/useApp';
import { Button, Card, Chip, Empty, Field, Input, Modal, Seg, Tag, Textarea, useConfirm } from '../components/ui';
import { Icon } from '../components/Icon';
import { speak, prewarmSpeech } from '../lib/speech';
import { isDue, nextDueLabel } from '../lib/srs';
import { parseVocabFile, parseVocabText, VOCAB_LEVELS, VOCAB_TYPES, type ParsedVocabItem } from '../lib/importVocab';
import { fetchPage } from '../lib/fetchUrl';
import { stripHtmlText } from '../lib/importBank';
import { askJson, describeAiError, isConfigured, toConfig } from '../lib/ai';
import { vocabPrompt } from '../lib/prompts';
import type { VocabLevel, VocabType } from '../types';

const TYPE_LABEL: Record<VocabType, string> = {
  word: '单词',
  collocation: '搭配',
  idiom: '习语',
  phrase: '短语',
  discourse: '话语标记',
};

const SESSION_SIZE = 20;

function isToday(ts?: number): boolean {
  if (!ts) return false;
  return new Date(ts).toDateString() === new Date().toDateString();
}

export default function Vocab() {
  const vocab = useApp((s) => s.vocab);
  const progress = useApp((s) => s.progress);
  const questions = useApp((s) => s.questions);
  const reviewVocab = useApp((s) => s.reviewVocab);
  const deleteVocabTopic = useApp((s) => s.deleteVocabTopic);
  const notify = useApp((s) => s.notify);
  const { confirm, node } = useConfirm();

  const [topic, setTopic] = useState('all');
  const [mode, setMode] = useState<'review' | 'spell' | 'browse'>('review');
  const [session, setSession] = useState<string[] | null>(null);
  const [index, setIndex] = useState(0);
  const [spellIndex, setSpellIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [answer, setAnswer] = useState('');
  const [checked, setChecked] = useState<null | boolean>(null);
  const [search, setSearch] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  const decks = useMemo(() => {
    const map = new Map<string, { topic: string; topicZh: string; total: number; due: number; custom: boolean }>();
    for (const v of vocab) {
      const entry = map.get(v.topic) ?? { topic: v.topic, topicZh: v.topicZh, total: 0, due: 0, custom: v.source !== 'builtin' };
      entry.total += 1;
      if (isDue(progress[v.id])) entry.due += 1;
      entry.custom = entry.custom || v.source !== 'builtin';
      map.set(v.topic, entry);
    }
    return [...map.values()];
  }, [vocab, progress]);

  const scope = useMemo(() => {
    const kw = search.trim().toLowerCase();
    return vocab.filter((v) => {
      if (topic !== 'all' && v.topic !== topic) return false;
      if (mode === 'browse' && kw && !`${v.term} ${v.meaningZh} ${v.example}`.toLowerCase().includes(kw)) return false;
      return true;
    });
  }, [vocab, topic, mode, search]);

  const dueList = useMemo(() => scope.filter((v) => isDue(progress[v.id])), [scope, progress]);
  const mastered = vocab.filter((v) => (progress[v.id]?.box ?? 0) >= 4).length;
  const todayReviewed = Object.values(progress).filter((p) => isToday(p.lastSeen)).length;
  const dueTotal = vocab.filter((v) => isDue(progress[v.id])).length;

  const current = session ? vocab.find((v) => v.id === session[index]) : null;
  // Spelling mode has its own cursor: it must work without starting a review session.
  const spellPool = dueList.length ? dueList : scope;
  const spellCard = spellPool.length ? spellPool[spellIndex % spellPool.length] : null;
  const recent = (dueList.length ? dueList : scope).slice(0, 6);

  useEffect(() => {
    setSession(null);
    setIndex(0);
    setSpellIndex(0);
    setFlipped(false);
    setAnswer('');
    setChecked(null);
  }, [topic, mode]);

  useEffect(() => {
    const card = mode === 'spell' ? spellCard : current;
    if (card) void prewarmSpeech(card.term);
  }, [mode, current?.id, spellCard?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function startSession(shuffle = false) {
    const pool = dueList.length ? dueList : scope;
    if (!pool.length) {
      notify('这个范围没有词卡', 'err');
      return;
    }
    const picked = [...pool];
    if (shuffle) {
      for (let i = picked.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [picked[i], picked[j]] = [picked[j], picked[i]];
      }
    }
    setSession(picked.slice(0, SESSION_SIZE).map((v) => v.id));
    setIndex(0);
    setFlipped(false);
  }

  function grade(quality: 'again' | 'hard' | 'good') {
    if (!current) return;
    reviewVocab(current.id, quality);
    if (quality === 'again') {
      setFlipped(false);
      return;
    }
    if (session && index + 1 < session.length) {
      setIndex(index + 1);
      setFlipped(false);
    } else {
      setSession(null);
      notify(`本轮完成：${session?.length ?? 0} 张`, 'ok');
    }
  }

  function nextCard(delta = 1) {
    if (!session) return;
    setIndex((prev) => (prev + delta + session.length) % session.length);
    setFlipped(false);
  }

  function checkSpelling() {
    if (!spellCard) return;
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z' ]/g, '').replace(/\s+/g, ' ').trim();
    const ok = normalize(answer) === normalize(spellCard.term);
    setChecked(ok);
    reviewVocab(spellCard.id, ok ? 'good' : 'again');
  }

  return (
    <div className="page">
      <Card className="fade-up">
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <div className="hide-xs" style={{ marginRight: 6 }}>
            <div className="ring" style={{ width: 92, height: 92 }}>
              <svg viewBox="0 0 92 92" width={92} height={92}>
                <circle cx={46} cy={46} r={40} fill="none" stroke="var(--line)" strokeWidth={7} />
                <circle
                  cx={46}
                  cy={46}
                  r={40}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth={7}
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 40}
                  strokeDashoffset={2 * Math.PI * 40 * (1 - Math.min(1, vocab.length ? mastered / vocab.length : 0))}
                  transform="rotate(-90 46 46)"
                />
              </svg>
              <div className="ring-val" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span style={{ fontSize: 22, fontWeight: 650 }}>{mastered}</span>
                <span className="tiny dim" style={{ fontSize: 9, letterSpacing: '.08em' }}>MASTERED</span>
              </div>
            </div>
          </div>
          <div style={{ minWidth: 200 }}>
            <div className="card-title">话题词库</div>
            <p className="card-desc">
              共 {vocab.length} 张词卡 · 已掌握 {mastered} 张 · {decks.length} 个话题。复习使用间隔重复，答对后间隔自动拉长。
            </p>
            <div className="row" style={{ gap: 6, marginTop: 6 }}>
              <Tag tone="warn">{dueTotal} 张待复习</Tag>
              <Tag tone="ok">今日已复习 {todayReviewed}</Tag>
            </div>
          </div>
          <div className="spacer" />
          <div className="btn-group">
            <Seg
              value={mode}
              onChange={(v) => setMode(v as typeof mode)}
              options={[
                { value: 'review', label: '卡片复习' },
                { value: 'spell', label: '拼写自测' },
                { value: 'browse', label: '浏览词库' },
              ]}
            />
            <Button size="sm" icon="upload" onClick={() => setImportOpen(true)}>导入词单</Button>
            <Button size="sm" icon="sparkles" onClick={() => setAiOpen(true)}>AI 生成话题词</Button>
          </div>
        </div>
      </Card>

      <div className="chip-row" style={{ marginTop: 14 }}>
        <Chip active={topic === 'all'} onClick={() => setTopic('all')} count={`· ${vocab.length}`}>全部</Chip>
        {decks.map((d) => (
          <Chip key={d.topic} active={topic === d.topic} onClick={() => setTopic(d.topic)} count={`· ${d.total}`}>
            {d.topicZh || d.topic}
          </Chip>
        ))}
      </div>

      {topic !== 'all' && decks.find((d) => d.topic === topic)?.custom && (
        <div className="row" style={{ marginTop: 8 }}>
          <span className="tiny muted">当前词单：{decks.find((d) => d.topic === topic)?.topicZh || topic}</span>
          <div className="spacer" />
          <Button
            size="sm"
            variant="ghost"
            icon="trash"
            onClick={() => {
              void confirm(`删除词单「${topic}」及其进度？`).then((ok) => {
                if (ok) {
                  deleteVocabTopic(topic);
                  setTopic('all');
                  notify('已删除词单', 'ok');
                }
              });
            }}
          >
            删除词单
          </Button>
        </div>
      )}

      {mode === 'browse' ? (
        <Card style={{ marginTop: 14 }}>
          <div className="search-wrap" style={{ maxWidth: 320 }}>
            <Icon name="search" size={15} />
            <Input placeholder="搜索词条或释义" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="list" style={{ marginTop: 10, maxHeight: 560, overflowY: 'auto' }}>
            {scope.map((v) => (
              <div key={v.id} className="list-item">
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="row" style={{ gap: 8 }}>
                    <span className="small" style={{ fontWeight: 600 }}>{v.term}</span>
                    {v.phonetic && <span className="tiny dim mono">{v.phonetic}</span>}
                    <Tag tone="accent">{TYPE_LABEL[v.type]}</Tag>
                  </div>
                  <div className="tiny muted">{v.meaningZh}</div>
                  <div className="tiny dim">{v.example}</div>
                </div>
                <button className="btn btn--ghost btn--icon" aria-label="朗读" onClick={() => void speak(`${v.term}. ${v.example}`)}>
                  <Icon name="volume" size={15} />
                </button>
              </div>
            ))}
          </div>
        </Card>
      ) : mode === 'review' && !session ? (
        <Card style={{ marginTop: 14 }}>
          <div className="row">
            <div>
              <div className="card-title" style={{ fontSize: 17 }}>{dueTotal} 张词卡到期</div>
              <p className="card-desc">翻卡 → 回忆释义 → 用例句开口复述一遍，然后按记忆程度打分。</p>
            </div>
            <div className="spacer" />
            <Button variant="primary" size="lg" icon="play" onClick={() => startSession(false)}>
              开始复习 {Math.min(SESSION_SIZE, dueList.length || scope.length)} 张
            </Button>
            <Button variant="ghost" icon="shuffle" onClick={() => startSession(true)}>打乱顺序</Button>
          </div>
          <div className="divider" />
          <div className="grid g3">
            <div className="stat">
              <span className="stat-label">本范围词卡</span>
              <span className="stat-value">{scope.length}</span>
              <span className="stat-delta muted">{decks.filter((d) => d.total > 0).length} 个话题</span>
            </div>
            <div className="stat">
              <span className="stat-label">已掌握</span>
              <span className="stat-value">{mastered}</span>
              <span className="stat-delta muted">连续答对 5 轮以上</span>
            </div>
            <div className="stat">
              <span className="stat-label">今日已复习</span>
              <span className="stat-value">{todayReviewed}</span>
              <span className="stat-delta muted">保持每日复习节奏</span>
            </div>
          </div>
          <div className="divider" />
          <div className="row">
            <div className="small" style={{ fontWeight: 600 }}>本范围近期词条</div>
            <div className="spacer" />
            <span className="tiny dim">点卡片听发音</span>
          </div>
          <div className="grid g2" style={{ marginTop: 10 }}>
            {recent.map((v) => (
              <button key={v.id} className="card card--flat card--pad-sm" onClick={() => void speak(`${v.term}. ${v.example}`)}>
                <div className="row">
                  <span className="small" style={{ fontWeight: 600 }}>{v.term}</span>
                  <div className="spacer" />
                  <Tag tone="accent">{TYPE_LABEL[v.type]}</Tag>
                </div>
                <div className="tiny muted" style={{ marginTop: 3 }}>{v.meaningZh}</div>
              </button>
            ))}
          </div>
        </Card>
      ) : mode === 'review' && session ? (
        <div className="grid g2" style={{ marginTop: 14, alignItems: 'start' }}>
          <Card>
            <div className="deck-bar">
              <span className="tiny muted">{index + 1} / {session.length}</span>
              <div className="spacer" />
              <Tag tone="accent">{TYPE_LABEL[current!.type]}</Tag>
            </div>
            <div className={`flip ${flipped ? 'flipped' : ''}`} onClick={() => setFlipped((f) => !f)}>
              <div className="flip-inner">
                <div className="face">
                  <div className="word">{current!.term}</div>
                  {current!.phonetic && <div className="phonetic mono">{current!.phonetic}</div>}
                  <div className="tiny muted" style={{ marginTop: 12 }}>点击卡片查看释义</div>
                </div>
                <div className="face face--back">
                  <div className="small" style={{ fontWeight: 600 }}>{current!.meaningZh}</div>
                  {current!.meaningEn && <div className="tiny muted" style={{ marginTop: 4 }}>{current!.meaningEn}</div>}
                  <div className="example" style={{ marginTop: 10 }}>{current!.example}</div>
                  {current!.exampleZh && <div className="tiny dim" style={{ marginTop: 4 }}>{current!.exampleZh}</div>}
                </div>
              </div>
            </div>
            <div className="row" style={{ marginTop: 12, gap: 8 }}>
              <Button variant="ghost" icon="volume" onClick={() => void speak(`${current!.term}. ${current!.example}`)}>朗读</Button>
              <div className="spacer" />
              <Button size="sm" variant="ghost" onClick={() => nextCard(-1)}>上一个</Button>
              <Button size="sm" variant="ghost" onClick={() => nextCard(1)}>下一个</Button>
              <Button size="sm" variant="ghost" onClick={() => setSession(null)}>结束</Button>
            </div>
          </Card>
          <Card>
            <div className="card-title">复习评分</div>
            <p className="card-desc">按记忆程度选择，间隔会按 Leitner 自动调整</p>
            <div className="stack" style={{ marginTop: 10 }}>
              <Button variant="danger" block onClick={() => grade('again')}>没想起来 · 10 分钟后再来</Button>
              <Button variant="ghost" block onClick={() => grade('hard')}>有点模糊 · 明天</Button>
              <Button variant="primary" block onClick={() => grade('good')}>记住了 · 拉长间隔</Button>
            </div>
            <div className="tiny muted" style={{ marginTop: 12 }}>
              {progress[current!.id] ? `下次复习：${nextDueLabel(progress[current!.id].dueAt)}` : '这张卡还没有复习记录'}
            </div>
            <div className="row" style={{ marginTop: 12, gap: 6 }}>
              <Tag>盒 {progress[current!.id]?.box ?? 0} / 6</Tag>
              <Tag tone="ok">对 {progress[current!.id]?.correct ?? 0}</Tag>
              <Tag tone="bad">错 {progress[current!.id]?.wrong ?? 0}</Tag>
            </div>
          </Card>
        </div>
      ) : (
        <Card style={{ marginTop: 14 }}>
          <div className="deck-bar">
            <span className="tiny muted">拼写自测 · 本范围 {scope.length} 张</span>
            <div className="spacer" />
            <Tag tone="accent">{spellCard ? TYPE_LABEL[spellCard.type] : '—'}</Tag>
          </div>
          {spellCard ? (
            <>
              <div className="small muted" style={{ marginTop: 10 }}>{spellCard.meaningZh}</div>
              {spellCard.exampleZh && <div className="tiny dim">{spellCard.exampleZh}</div>}
              <Input
                style={{ marginTop: 12 }}
                placeholder="写出英文词条"
                value={answer}
                onChange={(e) => { setAnswer(e.target.value); setChecked(null); }}
                onKeyDown={(e) => e.key === 'Enter' && checkSpelling()}
              />
              <div className="row" style={{ marginTop: 10, gap: 8 }}>
                <Button variant="primary" onClick={checkSpelling}>检查</Button>
                <Button variant="ghost" onClick={() => { setChecked(false); setFlipped(true); }}>看答案</Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setSpellIndex((n) => (spellPool.length ? (n + 1) % spellPool.length : 0));
                    setAnswer('');
                    setChecked(null);
                    setFlipped(false);
                  }}
                >
                  下一张
                </Button>
              </div>
              {checked !== null && (
                <div className="card card--flat card--pad-sm" style={{ marginTop: 10, background: checked ? 'var(--ok-soft)' : 'var(--bad-soft)' }}>
                  <div className="small">{checked ? '正确！' : `正确答案：${spellCard.term}`}</div>
                  <div className="tiny muted" style={{ marginTop: 2 }}>{spellCard.example}</div>
                </div>
              )}
            </>
          ) : (
            <Empty icon="vocab" title="这个范围没有词卡" desc="换个词单，或导入自己的词单。" />
          )}
        </Card>
      )}

      <VocabImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onDone={(items, deck) => {
          const added = useApp.getState().addVocabItems(
            items.map((item) => ({
              topic: item.topic?.trim() || deck,
              topicZh: item.topicZh?.trim() || deck,
              term: item.term,
              phonetic: item.phonetic,
              meaningZh: item.meaningZh,
              meaningEn: item.meaningEn,
              example: item.example ?? '',
              exampleZh: item.exampleZh,
              type: item.type,
              level: item.level,
              source: 'import' as const,
            })),
          );
          notify(added ? `已导入 ${added} 个词条` : '这些词条已经存在', added ? 'ok' : 'info');
          setImportOpen(false);
          if (items[0]?.topic) setTopic(items[0].topic);
        }}
      />

      <AiVocabModal
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        topics={[
          ...new Map(
            [
              ...questions.map((q) => ({ topic: q.topic, topicZh: q.topicZh })),
              ...vocab.map((v) => ({ topic: v.topic, topicZh: v.topicZh })),
            ].map((t) => [t.topic, t]),
          ).values(),
        ]}
        onDone={(added, topicName) => {
          notify(added ? `已生成 ${added} 个词条` : '没有新增词条', added ? 'ok' : 'info');
          setAiOpen(false);
          setTopic(topicName);
        }}
      />

      {node}
    </div>
  );
}

/* ------------------------------- AI 生成话题词 ------------------------------ */

function AiVocabModal({
  open,
  onClose,
  topics,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  topics: { topic: string; topicZh: string }[];
  onDone: (added: number, topic: string) => void;
}) {
  const settings = useApp((s) => s.settings);
  const vocab = useApp((s) => s.vocab);
  const addVocabItems = useApp((s) => s.addVocabItems);
  const notify = useApp((s) => s.notify);
  const [topicName, setTopicName] = useState(topics[0]?.topic ?? 'Hometown');
  const [count, setCount] = useState(10);
  const [level, setLevel] = useState<VocabLevel>('band7');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [items, setItems] = useState<ParsedVocabItem[] | null>(null);

  useEffect(() => {
    if (!open) {
      setBusy(false);
      setError('');
      setItems(null);
    }
  }, [open]);

  const meta = topics.find((t) => t.topic === topicName);

  async function generate() {
    if (!isConfigured(settings.ai)) {
      setError('需要先在「设置 → AI 模型」里配置模型与 Key');
      return;
    }
    setBusy(true);
    setError('');
    setItems(null);
    try {
      const existing = vocab.filter((v) => v.topic === topicName).map((v) => v.term);
      const prompt = vocabPrompt({ topic: topicName, topicZh: meta?.topicZh ?? topicName, count, level, existing });
      const raw = await askJson<{ items?: unknown[] }>({
        config: toConfig(settings.ai),
        system: prompt.system,
        user: prompt.user,
        temperature: 0.7,
      });
      const list = Array.isArray(raw.items) ? raw.items : [];
      const parsed: ParsedVocabItem[] = list
        .map((entry) => {
          const o = (entry ?? {}) as Record<string, unknown>;
          const term = String(o.term ?? '').trim();
          if (!term) return null;
          const type = (['word', 'collocation', 'idiom', 'phrase', 'discourse'].includes(String(o.type))
            ? String(o.type)
            : 'phrase') as VocabType;
          const lv = (['band6', 'band7', 'band8'].includes(String(o.level)) ? String(o.level) : level) as VocabLevel;
          return {
            term,
            phonetic: typeof o.phonetic === 'string' ? o.phonetic : undefined,
            meaningZh: String(o.meaningZh ?? ''),
            meaningEn: typeof o.meaningEn === 'string' ? o.meaningEn : undefined,
            example: String(o.example ?? ''),
            exampleZh: typeof o.exampleZh === 'string' ? o.exampleZh : undefined,
            type,
            level: lv,
          } as ParsedVocabItem;
        })
        .filter((v): v is ParsedVocabItem => Boolean(v))
        .slice(0, 24);
      if (!parsed.length) throw new Error('AI 没有返回可用词条');
      setItems(parsed);
    } catch (err) {
      setError(describeAiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="AI 生成话题词"
      subtitle="基于题库话题，生成口语化、可直接使用的表达"
      footer={
        <>
          <div className="spacer" />
          <Button variant="ghost" onClick={onClose}>取消</Button>
          {items ? (
            <>
              <Button variant="ghost" icon="refresh" loading={busy} onClick={() => void generate()}>重新生成</Button>
              <Button
                variant="primary"
                icon="check"
                onClick={() => {
                  const added = addVocabItems(
                    items.map((item) => ({
                      topic: topicName,
                      topicZh: meta?.topicZh ?? topicName,
                      term: item.term,
                      phonetic: item.phonetic,
                      meaningZh: item.meaningZh,
                      meaningEn: item.meaningEn,
                      example: item.example ?? '',
                      exampleZh: item.exampleZh,
                      type: item.type,
                      level: item.level,
                      source: 'ai' as const,
                    })),
                  );
                  onDone(added, topicName);
                }}
              >
                加入词库（{items.length}）
              </Button>
            </>
          ) : (
            <Button variant="primary" icon="sparkles" loading={busy} onClick={() => void generate()}>
              生成
            </Button>
          )}
        </>
      }
    >
      <div className="stack">
        <Field label="话题" hint="来自题库与已有词单">
          <select className="select" value={topicName} onChange={(e) => setTopicName(e.target.value)}>
            {topics.map((t) => (
              <option key={t.topic} value={t.topic}>{t.topic}{t.topicZh && t.topicZh !== t.topic ? ` · ${t.topicZh}` : ''}</option>
            ))}
          </select>
        </Field>
        <div className="grid g2">
          <Field label={`数量：${count}`}>
            <input className="range" type="range" min={6} max={20} step={2} value={count} onChange={(e) => setCount(Number(e.target.value))} />
          </Field>
          <Field label="难度">
            <Seg
              value={level}
              onChange={(v) => setLevel(v as VocabLevel)}
              options={[
                { value: 'band6', label: '6 分' },
                { value: 'band7', label: '7 分' },
                { value: 'band8', label: '8 分' },
              ]}
            />
          </Field>
        </div>
        {error && <div className="card card--flat" style={{ background: 'var(--bad-soft)' }}><div className="small">{error}</div></div>}
        {busy && <div className="row" style={{ gap: 8 }}><span className="spinner" /><span className="small muted">正在生成…</span></div>}
        {items && (
          <div className="stack-sm" style={{ maxHeight: 300, overflowY: 'auto' }}>
            {items.map((it, i) => (
              <div key={i} className="card card--flat card--pad-sm">
                <div className="row">
                  <span className="small" style={{ fontWeight: 600 }}>{it.term}</span>
                  <div className="spacer" />
                  <Tag tone="accent">{TYPE_LABEL[it.type]}</Tag>
                </div>
                <div className="tiny muted">{it.meaningZh}</div>
                {it.example && <div className="tiny dim">{it.example}</div>}
              </div>
            ))}
          </div>
        )}
        {!items && !busy && (
          <div className="hint">已有 {vocab.filter((v) => v.topic === topicName).length} 条该话题词，生成时会自动避开重复。</div>
        )}
      </div>
    </Modal>
  );
}

/* -------------------------------- 导入词单 -------------------------------- */

function VocabImportModal({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: (items: ParsedVocabItem[], deck: string) => void;
}) {
  const [tab, setTab] = useState<'file' | 'paste' | 'url' | 'manual'>('file');
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<ParsedVocabItem[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [deck, setDeck] = useState('我的词单');
  const [paste, setPaste] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const [term, setTerm] = useState('');
  const [meaning, setMeaning] = useState('');
  const [example, setExample] = useState('');
  const [phonetic, setPhonetic] = useState('');
  const [type, setType] = useState<VocabType>('collocation');
  const [level, setLevel] = useState<VocabLevel>('band7');
  const [manual, setManual] = useState<ParsedVocabItem[]>([]);

  useEffect(() => {
    if (!open) {
      setItems(null);
      setWarnings([]);
      setError('');
      setManual([]);
      setPaste('');
      setUrl('');
    }
  }, [open]);

  async function handleFile(file: File) {
    setBusy(true);
    setError('');
    try {
      const result = await parseVocabFile(file);
      if (!result.items.length) throw new Error(result.warnings[0] || '没有识别到词条');
      setItems(result.items);
      setWarnings(result.warnings);
      setDeck(result.name || '我的词单');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleUrl() {
    if (!url.trim()) return;
    setBusy(true);
    setError('');
    try {
      const page = await fetchPage(url);
      const text = page.isHtml ? stripHtmlText(page.text) : page.text;
      const result = parseVocabText(text, page.finalUrl.split('/').pop() || '网页词单');
      if (!result.items.length) throw new Error('这个网页里没有识别到词条');
      setItems(result.items);
      setWarnings(result.warnings);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const merged = items ?? manual;

  const addManual = () => {
    if (!term.trim()) return;
    setManual((prev) => [
      ...prev,
      {
        term: term.trim(),
        meaningZh: meaning.trim(),
        example: example.trim() || undefined,
        phonetic: phonetic.trim() || undefined,
        type,
        level,
        topic: deck,
      },
    ]);
    setTerm('');
    setMeaning('');
    setExample('');
    setPhonetic('');
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="导入词单"
      subtitle="文件 / 粘贴 / 网址 / 手动添加，导入后是一个独立词单"
      wide
      footer={
        <>
          <span className="tiny muted">{merged.length ? `${merged.length} 个词条` : '还没有词条'}</span>
          <div className="spacer" />
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button variant="primary" disabled={!merged.length} onClick={() => onDone(merged, deck.trim() || '我的词单')}>
            确认导入
          </Button>
        </>
      }
    >
      <div className="stack">
        <Seg
          value={tab}
          onChange={(v) => setTab(v)}
          options={[
            { value: 'file', label: '文件' },
            { value: 'paste', label: '粘贴' },
            { value: 'url', label: '网址' },
            { value: 'manual', label: '手动添加' },
          ]}
        />

        {tab === 'file' && (
          <>
            <div className="drop" onClick={() => fileRef.current?.click()}>
              <div className="empty-icon" style={{ margin: '0 auto 10px' }}><Icon name={busy ? 'refresh' : 'upload'} size={22} /></div>
              <div style={{ fontWeight: 600 }}>{busy ? '正在解析…' : '拖入词单文件，或点击选择'}</div>
              <div className="tiny muted" style={{ marginTop: 4 }}>PDF · Word · Excel · CSV · JSON · TXT · Markdown · HTML</div>
            </div>
            <input
              ref={fileRef}
              type="file"
              hidden
              accept=".pdf,.docx,.xlsx,.xls,.json,.csv,.tsv,.txt,.md,.markdown,.html,.htm"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
                e.target.value = '';
              }}
            />
          </>
        )}

        {tab === 'paste' && (
          <>
            <Textarea
              rows={7}
              placeholder={'serendipity - 意外发现珍奇事物的运气\nhit the nail on the head - 一针见血\ngrab a bite | 随便吃点 | Let us grab a bite before the film.'}
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
            />
            <div className="row">
              <div className="spacer" />
              <Button size="sm" icon="wand" onClick={() => {
                const result = parseVocabText(paste, '粘贴的词单');
                if (!result.items.length) return setError('没有识别到词条');
                setItems(result.items);
                setWarnings(result.warnings);
                setDeck('粘贴的词单');
              }}>
                解析
              </Button>
            </div>
          </>
        )}

        {tab === 'url' && (
          <>
            <Field label="网页地址" hint="抓取单页正文并识别词条">
              <Input placeholder="https://example.com/vocabulary" value={url} onChange={(e) => setUrl(e.target.value)} />
            </Field>
            <div className="row">
              <div className="spacer" />
              <Button size="sm" icon="download" loading={busy} onClick={() => void handleUrl()}>抓取网页</Button>
            </div>
          </>
        )}

        {tab === 'manual' && (
          <div className="stack">
            <div className="grid g2">
              <Field label="词条"><Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="hit the nail on the head" /></Field>
              <Field label="中文释义"><Input value={meaning} onChange={(e) => setMeaning(e.target.value)} placeholder="一针见血" /></Field>
            </div>
            <Field label="例句"><Input value={example} onChange={(e) => setExample(e.target.value)} placeholder="Your answer hit the nail on the head." /></Field>
            <div className="grid g2">
              <Field label="音标"><Input value={phonetic} onChange={(e) => setPhonetic(e.target.value)} placeholder="/.../" /></Field>
              <Field label="类型">
                <select className="select" value={type} onChange={(e) => setType(e.target.value as VocabType)}>
                  {VOCAB_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </Field>
            </div>
            <div className="row">
              <select className="select" value={level} onChange={(e) => setLevel(e.target.value as VocabLevel)}>
                {VOCAB_LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
              <div className="spacer" />
              <Button size="sm" icon="plus" onClick={addManual}>添加词条</Button>
            </div>
            {manual.length > 0 && (
              <div className="stack-sm">
                {manual.map((m, i) => (
                  <div key={i} className="card card--flat card--pad-sm">
                    <div className="row">
                      <span className="small" style={{ fontWeight: 600 }}>{m.term}</span>
                      <span className="tiny muted">{m.meaningZh}</span>
                      <div className="spacer" />
                      <button className="btn btn--ghost btn--icon" aria-label="移除" onClick={() => setManual((prev) => prev.filter((_, j) => j !== i))}>
                        <Icon name="x" size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <Field label="词单名称">
          <Input value={deck} onChange={(e) => setDeck(e.target.value)} placeholder="我的词单" />
        </Field>

        {error && <div className="card card--flat" style={{ background: 'var(--bad-soft)' }}><div className="small">{error}</div></div>}
        {warnings.length > 0 && (
          <div className="card card--flat card--pad-sm">
            {warnings.slice(0, 3).map((w) => <div key={w} className="tiny muted">· {w}</div>)}
          </div>
        )}

        {merged.length > 0 && (
          <div className="stack-sm" style={{ maxHeight: 220, overflowY: 'auto' }}>
            {merged.slice(0, 10).map((m, i) => (
              <div key={i} className="card card--flat card--pad-sm">
                <div className="row">
                  <span className="small" style={{ fontWeight: 600 }}>{m.term}</span>
                  <div className="spacer" />
                  <Tag tone="accent">{TYPE_LABEL[m.type]}</Tag>
                  <Tag>{m.level.replace('band', '')} 分</Tag>
                </div>
                <div className="tiny muted">{m.meaningZh || '（无释义）'}</div>
                {m.example && <div className="tiny dim">{m.example}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
