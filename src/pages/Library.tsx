import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../store/useApp';
import { Button, Card, Chip, Empty, Field, Input, Modal, Seg, Tag, Textarea, useConfirm } from '../components/ui';
import { Icon } from '../components/Icon';
import { partShort } from '../lib/data';
import { relTime } from '../lib/format';
import {
  IMPORT_TEMPLATE_CSV,
  IMPORT_TEMPLATE_JSON,
  parseQuestionFile,
  parseQuestionText,
  stripHtmlText,
  type ParsedBank,
  type ParsedQuestion,
} from '../lib/importBank';
import { fetchPage } from '../lib/fetchUrl';
import { askJson, isConfigured, toConfig, describeAiError } from '../lib/ai';
import { questionsGenPrompt } from '../lib/prompts';
import { downloadText } from '../lib/format';
import type { Part, Question } from '../types';

type SortKey = 'recent' | 'part' | 'topic';

export default function Library() {
  const questions = useApp((s) => s.questions);
  const banks = useApp((s) => s.banks);
  const settings = useApp((s) => s.settings);
  const notify = useApp((s) => s.notify);
  const createPaper = useApp((s) => s.createPaper);
  const deleteQuestions = useApp((s) => s.deleteQuestions);
  const deleteBank = useApp((s) => s.deleteBank);
  const importBank = useApp((s) => s.importBank);
  const navigate = useNavigate();
  const { confirm, node: confirmNode } = useConfirm();

  const [bankId, setBankId] = useState('all');
  const [part, setPart] = useState<'all' | Part>('all');
  const [topic, setTopic] = useState('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('recent');
  const [shown, setShown] = useState(60);
  const [selected, setSelected] = useState<string[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [genOpen, setGenOpen] = useState(false);

  const filtered = useMemo(() => {
    const kw = search.trim().toLowerCase();
    const list = questions.filter((q) => {
      if (bankId !== 'all' && q.bankId !== bankId) return false;
      if (part !== 'all' && q.part !== part) return false;
      if (topic !== 'all' && q.topic !== topic) return false;
      if (kw && !`${q.question} ${q.questionZh ?? ''} ${q.topic} ${q.topicZh} ${q.tags.join(' ')}`.toLowerCase().includes(kw)) return false;
      return true;
    });
    if (sort === 'part') list.sort((a, b) => a.part - b.part || a.topic.localeCompare(b.topic));
    else if (sort === 'topic') list.sort((a, b) => a.topic.localeCompare(b.topic) || a.part - b.part);
    else list.sort((a, b) => b.createdAt - a.createdAt);
    return list;
  }, [questions, bankId, part, topic, search, sort]);

  const topics = useMemo(() => [...new Set(questions.filter((q) => bankId === 'all' || q.bankId === bankId).map((q) => q.topic))], [questions, bankId]);

  useEffect(() => {
    setSelected((prev) => prev.filter((id) => questions.some((q) => q.id === id)));
  }, [questions]);

  useEffect(() => {
    setShown(60);
  }, [bankId, part, topic, search, sort]);

  const allSelected = filtered.length > 0 && filtered.every((q) => selected.includes(q.id));

  function toggleAll() {
    if (allSelected) setSelected((prev) => prev.filter((id) => !filtered.some((q) => q.id === id)));
    else setSelected((prev) => [...new Set([...prev, ...filtered.map((q) => q.id)])]);
  }

  function buildPaper() {
    const picked = questions.filter((q) => selected.includes(q.id));
    const p1 = picked.filter((q) => q.part === 1).map((q) => q.id);
    const p2 = picked.find((q) => q.part === 2)?.id ?? null;
    const p3 = picked.filter((q) => q.part === 3).map((q) => q.id);
    if (!p1.length && !p2 && !p3.length) return;
    const paper = createPaper({ name: `自选套卷 · ${new Date().toLocaleDateString('zh-CN')}`, part1Ids: p1, part2Id: p2, part3Ids: p3 });
    notify(`已创建套卷（${picked.length} 题）`, 'ok');
    setSelected([]);
    navigate(`/papers/${paper.id}`);
  }

  return (
    <div className="page">
      <Card className="fade-up">
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <div style={{ minWidth: 220 }}>
            <div className="card-title">题库管理</div>
            <p className="card-desc">支持 PDF、Word、Excel、JSON、CSV、Markdown、纯文本，也可以直接从网址导入或用 AI 出题。</p>
          </div>
          <div className="spacer" />
          <div className="btn-group">
            <Button size="sm" variant="ghost" icon="download" onClick={() => downloadText('题库模板.csv', IMPORT_TEMPLATE_CSV, 'text/csv;charset=utf-8')}>
              CSV 模板
            </Button>
            <Button size="sm" variant="ghost" icon="download" onClick={() => downloadText('题库模板.json', IMPORT_TEMPLATE_JSON, 'application/json')}>
              JSON 模板
            </Button>
            <Button size="sm" icon="sparkles" onClick={() => setGenOpen(true)}>
              AI 出题
            </Button>
            <Button variant="primary" icon="upload" onClick={() => setImportOpen(true)}>
              导入题库
            </Button>
          </div>
        </div>
      </Card>

      <div className="row" style={{ marginTop: 16, flexWrap: 'wrap' }}>
        <Seg
          value={part}
          onChange={(v) => setPart(v as 'all' | Part)}
          options={[
            { value: 'all', label: '全部' },
            { value: 1, label: 'Part 1' },
            { value: 2, label: 'Part 2' },
            { value: 3, label: 'Part 3' },
          ]}
        />
        <div className="spacer" />
        <div className="row" style={{ gap: 8 }}>
          <div className="search-wrap">
            <Icon name="search" size={15} />
            <Input placeholder="搜索题目、话题或标签" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="select" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="recent">最近添加</option>
            <option value="part">按 Part</option>
            <option value="topic">按话题</option>
          </select>
        </div>
      </div>

      <div className="chip-row" style={{ marginTop: 12 }}>
        <Chip active={bankId === 'all'} onClick={() => setBankId('all')} count={questions.length}>全部题库</Chip>
        {banks.map((b) => (
          <Chip key={b.id} active={bankId === b.id} onClick={() => setBankId(b.id)} count={b.questionCount}>
            {b.name}
          </Chip>
        ))}
      </div>

      {topics.length > 1 && (
        <div className="chip-row" style={{ marginTop: 8 }}>
          <Chip active={topic === 'all'} onClick={() => setTopic('all')}>全部话题</Chip>
          {topics.slice(0, 24).map((t) => (
            <Chip key={t} active={topic === t} onClick={() => setTopic(t)}>
              {t}
            </Chip>
          ))}
        </div>
      )}

      <Card style={{ marginTop: 16 }}>
        <div className="row" style={{ marginBottom: 10 }}>
          <span className="small muted">{filtered.length} 道题</span>
          <div className="spacer" />
          <Button size="sm" variant="ghost" onClick={toggleAll}>
            {allSelected ? '取消全选' : '全选当前'}
          </Button>
        </div>

        {filtered.length ? (
          <div className="list">
            {filtered.slice(0, shown).map((q) => (
              <QuestionRow
                key={q.id}
                q={q}
                checked={selected.includes(q.id)}
                onCheck={() => setSelected((prev) => (prev.includes(q.id) ? prev.filter((x) => x !== q.id) : [...prev, q.id]))}
                onDelete={() => {
                  void confirm(`删除这道题？\n${q.question}`).then((ok) => {
                    if (ok) {
                      deleteQuestions([q.id]);
                      notify('已删除', 'ok');
                    }
                  });
                }}
              />
            ))}
            {filtered.length > shown && (
              <div className="center" style={{ padding: '10px 0' }}>
                <Button size="sm" variant="ghost" onClick={() => setShown((n) => n + 60)}>
                  加载更多（{filtered.length - shown}）
                </Button>
              </div>
            )}
          </div>
        ) : (
          <Empty icon="library" title="没有匹配的题目" desc="换个筛选条件，或导入新的题库。" />
        )}
      </Card>

      {selected.length > 0 && (
        <div className="selbar">
          <span>已选 {selected.length} 题</span>
          <div className="spacer" />
          <Button size="sm" variant="ghost" onClick={() => setSelected([])}>清空</Button>
          <Button size="sm" variant="primary" icon="arrow-right" onClick={buildPaper}>用所选组卷</Button>
        </div>
      )}

      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        topics={topics}
        onDone={(bank) => {
          notify(`已导入「${bank.name}」${bank.questionCount} 题`, 'ok');
          setImportOpen(false);
          setBankId(bank.id);
        }}
      />

      <GenerateModal
        open={genOpen}
        onClose={() => setGenOpen(false)}
        topics={topics}
        existing={questions}
        onDone={(items, name) => {
          const bank = importBank(name, items);
          notify(`已生成「${bank.name}」${items.length} 题`, 'ok');
          setGenOpen(false);
          setBankId(bank.id);
        }}
      />

      {confirmNode}
    </div>
  );
}

function QuestionRow({ q, checked, onCheck, onDelete }: { q: Question; checked: boolean; onCheck: () => void; onDelete: () => void }) {
  return (
    <div className="list-item">
      <button className={`check ${checked ? 'on' : ''}`} aria-label={checked ? '取消选择' : '选择'} onClick={onCheck}>
        {checked && <Icon name="check" size={12} />}
      </button>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="small" style={{ fontWeight: 550 }}>{q.question}</div>
        {q.questionZh && <div className="tiny muted" style={{ marginTop: 2 }}>{q.questionZh}</div>}
        {q.part === 2 && q.bullets?.length ? (
          <div className="tiny dim" style={{ marginTop: 4 }}>{q.bullets.join(' · ')}</div>
        ) : null}
      </div>
      <div className="row" style={{ gap: 6 }}>
        <Tag tone="accent">{partShort(q.part)}</Tag>
        <Tag>{q.topicZh || q.topic}</Tag>
        <button className="btn btn--ghost btn--icon" aria-label="删除" onClick={onDelete}>
          <Icon name="trash" size={15} />
        </button>
      </div>
    </div>
  );
}

function ImportModal({
  open,
  onClose,
  topics,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  topics: string[];
  onDone: (bank: ReturnType<typeof useApp.getState>['banks'][number]) => void;
}) {
  const importBank = useApp((s) => s.importBank);
  const notify = useApp((s) => s.notify);
  const [tab, setTab] = useState<'file' | 'paste' | 'url'>('file');
  const [busy, setBusy] = useState(false);
  const [parsed, setParsed] = useState<ParsedBank | null>(null);
  const [name, setName] = useState('');
  const [paste, setPaste] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setParsed(null);
      setError('');
      setBusy(false);
      setPaste('');
      setUrl('');
    }
  }, [open]);

  async function handleFile(file: File) {
    setBusy(true);
    setError('');
    try {
      const result = await parseQuestionFile(file);
      if (!result.questions.length) throw new Error(result.warnings[0] || '没有识别到题目');
      setParsed(result);
      setName(result.name);
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
      const { parseDocumentText } = await import('../lib/parseDocument');
      const result = parseDocumentText(text, page.finalUrl.split('/').pop() || '网页题库');
      if (!result.questions.length) throw new Error('这个网页里没有识别到题目');
      setParsed(result);
      setName(result.name);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="导入题库"
      subtitle="文件在本地解析，不会上传；扫描版 PDF 需要先 OCR"
      wide
      footer={
        <>
          <div className="spacer" />
          <Button variant="ghost" onClick={() => { setParsed(null); onClose(); }}>取消</Button>
          <Button
            variant="primary"
            disabled={!parsed || !parsed.questions.length}
            onClick={() => {
              if (!parsed) return;
              onDone(importBank(name.trim() || parsed.name, parsed.questions));
            }}
          >
            确认导入{parsed ? `（${parsed.questions.length}）` : ''}
          </Button>
        </>
      }
    >
      <div className="stack">
        <Seg
          value={tab}
          onChange={(v) => { setTab(v); setParsed(null); setError(''); }}
          options={[
            { value: 'file', label: '文件' },
            { value: 'paste', label: '粘贴' },
            { value: 'url', label: '网址' },
          ]}
        />

        {tab === 'file' && (
          <>
            <div
              className={`drop ${busy ? 'active' : ''}`}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files[0];
                if (file) void handleFile(file);
              }}
            >
              <div className="empty-icon" style={{ margin: '0 auto 10px' }}>
                <Icon name={busy ? 'refresh' : 'upload'} size={22} />
              </div>
              <div style={{ fontWeight: 600 }}>{busy ? '正在解析…' : '拖入文件，或点击选择'}</div>
              <div className="tiny muted" style={{ marginTop: 4 }}>PDF · Word(.docx) · Excel · JSON · CSV · TXT · Markdown · HTML</div>
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
              rows={8}
              placeholder={'每行一题，或粘贴 CSV：\npart,topic,question\n1,Hometown,Where is your hometown?'}
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
            />
            <div className="row">
              <div className="spacer" />
              <Button size="sm" icon="wand" onClick={() => {
                const result = parseQuestionText(paste, '粘贴的题库');
                if (!result.questions.length) {
                  setError('没有识别到题目');
                  return;
                }
                setParsed(result);
                setName(result.name);
              }}>
                解析
              </Button>
            </div>
          </>
        )}

        {tab === 'url' && (
          <>
            <Field label="网页地址" hint="只抓取这一页正文，不会遍历网站；需要本地服务运行">
              <Input placeholder="https://example.com/ielts-speaking-topics" value={url} onChange={(e) => setUrl(e.target.value)} />
            </Field>
            <div className="row">
              <div className="spacer" />
              <Button size="sm" icon="download" loading={busy} onClick={() => void handleUrl()}>抓取网页</Button>
            </div>
          </>
        )}

        {error && <div className="card card--flat" style={{ background: 'var(--bad-soft)' }}><div className="small">{error}</div></div>}

        {parsed && (
          <>
            <Field label="题库名称">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：2026 当季补充" />
            </Field>
            <div className="row" style={{ gap: 8 }}>
              <Tag tone="ok">{parsed.questions.length} 题</Tag>
              <Tag>{new Set(parsed.questions.map((q) => q.topic)).size} 个话题</Tag>
              <Tag tone="accent">{parsed.format}</Tag>
            </div>
            {parsed.warnings.length > 0 && (
              <div className="card card--flat card--pad-sm">
                {parsed.warnings.slice(0, 3).map((w) => (
                  <div key={w} className="tiny muted">· {w}</div>
                ))}
              </div>
            )}
            <div className="stack-sm" style={{ maxHeight: 240, overflowY: 'auto' }}>
              {parsed.questions.slice(0, 8).map((q, i) => (
                <div key={i} className="card card--flat card--pad-sm">
                  <div className="row" style={{ gap: 6 }}>
                    <Tag tone="accent">{partShort(q.part)}</Tag>
                    <Tag>{q.topic}</Tag>
                  </div>
                  <div className="small" style={{ marginTop: 4 }}>{q.question}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {!parsed && <div className="hint">导入后可以在右侧筛选与勾选，直接组卷。</div>}
      </div>
    </Modal>
  );
}

function GenerateModal({
  open,
  onClose,
  topics,
  existing,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  topics: string[];
  existing: Question[];
  onDone: (items: ParsedQuestion[], name: string) => void;
}) {
  const settings = useApp((s) => s.settings);
  const [topic, setTopic] = useState('');
  const [part, setPart] = useState<Part>(1);
  const [count, setCount] = useState(6);
  const [difficulty, setDifficulty] = useState<1 | 2 | 3>(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [items, setItems] = useState<ParsedQuestion[] | null>(null);

  useEffect(() => {
    if (!open) {
      setItems(null);
      setError('');
      setBusy(false);
    }
  }, [open]);

  async function generate() {
    const clean = topic.trim();
    if (!clean) return setError('请先填写话题');
    if (!isConfigured(settings.ai)) return setError('请先在「设置 → AI 模型」里配置模型与 Key');
    setBusy(true);
    setError('');
    setItems(null);
    try {
      const prompt = questionsGenPrompt({
        topic: clean,
        part,
        count,
        difficulty,
        existing: existing.filter((q) => q.topic === clean && q.part === part).map((q) => q.question),
      });
      const raw = await askJson<{ questions?: unknown[] }>({
        config: toConfig(settings.ai),
        system: prompt.system,
        user: prompt.user,
        temperature: 0.85,
      });
      const list = Array.isArray(raw.questions) ? raw.questions : [];
      const parsed = list
        .map((entry) => {
          const o = (entry ?? {}) as Record<string, unknown>;
          const question = String(o.question ?? '').trim();
          if (!question) return null;
          const bullets = Array.isArray(o.bullets) ? o.bullets.map(String).filter(Boolean) : [];
          return {
            part,
            topic: clean,
            topicZh: clean,
            question,
            questionZh: typeof o.questionZh === 'string' ? o.questionZh : undefined,
            bullets: part === 2 ? bullets : undefined,
            tags: Array.isArray(o.tags) ? o.tags.map(String).slice(0, 3) : ['AI 生成'],
            difficulty,
          } as ParsedQuestion;
        })
        .filter((q): q is ParsedQuestion => Boolean(q))
        .slice(0, 30);
      if (!parsed.length) throw new Error('AI 没有返回可用题目');
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
      title="AI 出题"
      subtitle="按话题生成新的雅思风格题目，预览后加入题库"
      footer={
        <>
          <div className="spacer" />
          <Button variant="ghost" onClick={onClose}>取消</Button>
          {items ? (
            <>
              <Button variant="ghost" icon="refresh" loading={busy} onClick={() => void generate()}>重新生成</Button>
              <Button variant="primary" icon="check" onClick={() => onDone(items, `AI 出题 · ${topic.trim()}`)}>
                加入题库（{items.length}）
              </Button>
            </>
          ) : (
            <Button variant="primary" icon="sparkles" loading={busy} onClick={() => void generate()}>生成</Button>
          )}
        </>
      }
    >
      <div className="stack">
        <div className="grid g2">
          <Field label="话题">
            <Input list="gen-topics" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Hometown / A person you admire" />
            <datalist id="gen-topics">{topics.map((t) => <option key={t} value={t} />)}</datalist>
          </Field>
          <Field label="Part">
            <Seg value={part} onChange={(v) => setPart(v as Part)} options={[{ value: 1, label: 'Part 1' }, { value: 2, label: 'Part 2' }, { value: 3, label: 'Part 3' }]} />
          </Field>
        </div>
        <div className="grid g2">
          <Field label={`数量：${count}`}>
            <input className="range" type="range" min={1} max={part === 2 ? 6 : 12} value={count} onChange={(e) => setCount(Number(e.target.value))} />
          </Field>
          <Field label="难度">
            <Seg value={difficulty} onChange={(v) => setDifficulty(v as 1 | 2 | 3)} options={[{ value: 1, label: '基础' }, { value: 2, label: '进阶' }, { value: 3, label: '抽象' }]} />
          </Field>
        </div>
        {error && <div className="card card--flat" style={{ background: 'var(--bad-soft)' }}><div className="small">{error}</div></div>}
        {busy && <div className="row" style={{ gap: 8 }}><span className="spinner" /><span className="small muted">正在生成…</span></div>}
        {items && (
          <div className="stack-sm" style={{ maxHeight: 300, overflowY: 'auto' }}>
            {items.map((item, i) => (
              <div key={i} className="card card--flat card--pad-sm">
                <div className="row" style={{ gap: 6 }}><Tag tone="accent">P{item.part}</Tag><Tag>{item.topic}</Tag></div>
                <div className="small" style={{ marginTop: 4 }}>{item.question}</div>
                {item.questionZh && <div className="tiny muted">{item.questionZh}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
