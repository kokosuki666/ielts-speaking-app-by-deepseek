import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../store/useApp';
import { Button, Card, Chip, Empty, Field, Input, Modal, Seg, Tag, Textarea, useConfirm } from '../components/ui';
import { Icon } from '../components/Icon';
import { speak, prewarmSpeech } from '../lib/speech';
import { isDue, nextDueLabel } from '../lib/srs';
import { parseVocabFile, parseVocabText, VOCAB_LEVELS, VOCAB_TYPES, type ParsedVocabItem } from '../lib/importVocab';
import { fetchPage } from '../lib/fetchUrl';
import { stripHtmlText } from '../lib/importBank';
import { vocabTypeLabel } from '../lib/prompts';
import type { VocabItem, VocabLevel, VocabType } from '../types';

const TYPE_LABEL: Record<VocabType, string> = {
  word: '单词',
  collocation: '搭配',
  idiom: '习语',
  phrase: '短语',
  discourse: '话语标记',
};

export default function Vocab() {
  const vocab = useApp((s) => s.vocab);
  const progress = useApp((s) => s.progress);
  const reviewVocab = useApp((s) => s.reviewVocab);
  const deleteVocabTopic = useApp((s) => s.deleteVocabTopic);
  const notify = useApp((s) => s.notify);
  const { confirm, node } = useConfirm();

  const [topic, setTopic] = useState('all');
  const [mode, setMode] = useState<'card' | 'spell' | 'browse'>('card');
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [answer, setAnswer] = useState('');
  const [checked, setChecked] = useState<null | boolean>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [search, setSearch] = useState('');

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

  const list = useMemo(() => {
    const kw = search.trim().toLowerCase();
    return vocab.filter((v) => {
      if (topic !== 'all' && v.topic !== topic) return false;
      if (kw && !`${v.term} ${v.meaningZh} ${v.example}`.toLowerCase().includes(kw)) return false;
      return true;
    });
  }, [vocab, topic, search]);

  const dueList = useMemo(() => list.filter((v) => isDue(progress[v.id])), [list, progress]);
  const studyList = mode === 'card' || mode === 'spell' ? (dueList.length ? dueList : list) : list;
  const current = studyList[Math.min(index, Math.max(0, studyList.length - 1))];

  const mastered = vocab.filter((v) => (progress[v.id]?.box ?? 0) >= 4).length;
  const dueTotal = vocab.filter((v) => isDue(progress[v.id])).length;

  useEffect(() => {
    setIndex(0);
    setFlipped(false);
    setAnswer('');
    setChecked(null);
  }, [topic, mode]);

  useEffect(() => {
    if (current) void prewarmSpeech(current.term);
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function next(delta = 1) {
    setFlipped(false);
    setAnswer('');
    setChecked(null);
    setIndex((prev) => (studyList.length ? (prev + delta + studyList.length) % studyList.length : 0));
  }

  function grade(quality: 'again' | 'hard' | 'good') {
    if (!current) return;
    reviewVocab(current.id, quality);
    if (quality !== 'again') next();
    else setFlipped(false);
  }

  function checkSpelling() {
    if (!current) return;
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z' ]/g, '').replace(/\s+/g, ' ').trim();
    const ok = normalize(answer) === normalize(current.term);
    setChecked(ok);
    reviewVocab(current.id, ok ? 'good' : 'again');
  }

  return (
    <div className="page">
      <Card className="fade-up">
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <div style={{ minWidth: 220 }}>
            <div className="card-title">背诵</div>
            <p className="card-desc">
              {vocab.length} 张词卡 · 待复习 {dueTotal} · 已掌握 {mastered}
            </p>
          </div>
          <div className="spacer" />
          <div className="btn-group">
            <Seg
              value={mode}
              onChange={(v) => setMode(v as typeof mode)}
              options={[
                { value: 'card', label: '卡片' },
                { value: 'spell', label: '拼写' },
                { value: 'browse', label: '浏览' },
              ]}
            />
            <Button icon="upload" onClick={() => setImportOpen(true)}>导入词单</Button>
          </div>
        </div>
      </Card>

      <div className="chip-row" style={{ marginTop: 14 }}>
        <Chip active={topic === 'all'} onClick={() => setTopic('all')} count={vocab.length}>全部</Chip>
        {decks.map((d) => (
          <Chip key={d.topic} active={topic === d.topic} onClick={() => setTopic(d.topic)} count={d.total}>
            {d.topicZh || d.topic}
          </Chip>
        ))}
      </div>

      {topic !== 'all' && (
        <div className="row" style={{ marginTop: 8 }}>
          <span className="tiny muted">当前词单：{decks.find((d) => d.topic === topic)?.topicZh || topic}</span>
          <div className="spacer" />
          {decks.find((d) => d.topic === topic)?.custom && (
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
          )}
        </div>
      )}

      {mode === 'browse' ? (
        <Card style={{ marginTop: 14 }}>
          <div className="search-wrap" style={{ maxWidth: 320 }}>
            <Icon name="search" size={15} />
            <Input placeholder="搜索词条或释义" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="list" style={{ marginTop: 10, maxHeight: 560, overflowY: 'auto' }}>
            {list.map((v) => (
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
      ) : !studyList.length ? (
        <Card style={{ marginTop: 14 }}>
          <Empty icon="vocab" title="这个范围没有词卡" desc="换个词单，或导入自己的词单。" action={<Button variant="primary" icon="upload" onClick={() => setImportOpen(true)}>导入词单</Button>} />
        </Card>
      ) : mode === 'card' ? (
        <div className="grid g2" style={{ marginTop: 14, alignItems: 'start' }}>
          <Card>
            <div className="deck-bar">
              <span className="tiny muted">{index + 1} / {studyList.length}</span>
              <div className="spacer" />
              <Tag>{dueList.length ? '待复习' : '全部'}</Tag>
              <Tag tone="accent">{TYPE_LABEL[current.type]}</Tag>
            </div>

            <div className={`flip ${flipped ? 'flipped' : ''}`} onClick={() => setFlipped((f) => !f)}>
              <div className="flip-inner">
                <div className="face">
                  <div className="word">{current.term}</div>
                  {current.phonetic && <div className="phonetic mono">{current.phonetic}</div>}
                  <div className="tiny muted" style={{ marginTop: 12 }}>点击卡片查看释义</div>
                </div>
                <div className="face face--back">
                  <div className="small" style={{ fontWeight: 600 }}>{current.meaningZh}</div>
                  {current.meaningEn && <div className="tiny muted" style={{ marginTop: 4 }}>{current.meaningEn}</div>}
                  <div className="example" style={{ marginTop: 10 }}>{current.example}</div>
                  {current.exampleZh && <div className="tiny dim" style={{ marginTop: 4 }}>{current.exampleZh}</div>}
                </div>
              </div>
            </div>

            <div className="row" style={{ marginTop: 12, gap: 8 }}>
              <Button variant="ghost" icon="volume" onClick={() => void speak(`${current.term}. ${current.example}`)}>朗读</Button>
              <div className="spacer" />
              <Button size="sm" variant="ghost" onClick={() => next(-1)}>上一个</Button>
              <Button size="sm" variant="ghost" onClick={() => next(1)}>下一个</Button>
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
              {progress[current.id] ? `下次复习：${nextDueLabel(progress[current.id].dueAt)}` : '这张卡还没有复习记录'}
            </div>
            <div className="row" style={{ marginTop: 12, gap: 6 }}>
              <Tag>盒 {progress[current.id]?.box ?? 0} / 6</Tag>
              <Tag tone="ok">对 {progress[current.id]?.correct ?? 0}</Tag>
              <Tag tone="bad">错 {progress[current.id]?.wrong ?? 0}</Tag>
            </div>
          </Card>
        </div>
      ) : (
        <Card style={{ marginTop: 14 }}>
          <div className="deck-bar">
            <span className="tiny muted">{index + 1} / {studyList.length}</span>
            <div className="spacer" />
            <Tag tone="accent">{TYPE_LABEL[current.type]}</Tag>
          </div>
          <div className="small muted" style={{ marginTop: 10 }}>{current.meaningZh}</div>
          {current.exampleZh && <div className="tiny dim">{current.exampleZh}</div>}
          <Input
            style={{ marginTop: 12 }}
            placeholder="写出英文词条"
            value={answer}
            onChange={(e) => { setAnswer(e.target.value); setChecked(null); }}
            onKeyDown={(e) => e.key === 'Enter' && checkSpelling()}
          />
          <div className="row" style={{ marginTop: 10, gap: 8 }}>
            <Button variant="primary" onClick={checkSpelling}>检查</Button>
            <Button variant="ghost" onClick={() => { setChecked(true); setFlipped(true); }}>看答案</Button>
            <div className="spacer" />
            <Button size="sm" variant="ghost" onClick={() => next(1)}>跳过</Button>
          </div>
          {checked !== null && (
            <div className="card card--flat card--pad-sm" style={{ marginTop: 10, background: checked ? 'var(--ok-soft)' : 'var(--bad-soft)' }}>
              <div className="small">{checked ? '正确！' : `正确答案：${current.term}`}</div>
              <div className="tiny muted" style={{ marginTop: 2 }}>{current.example}</div>
            </div>
          )}
        </Card>
      )}

      <VocabImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onDone={(items, deck) => {
          const addVocabItems = useApp.getState().addVocabItems;
          const added = addVocabItems(
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

      {node}
    </div>
  );
}

function VocabImportModal({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: (items: ParsedVocabItem[], deck: string) => void;
}) {
  const notify = useApp((s) => s.notify);
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
