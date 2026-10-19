import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../store/useApp';
import { Button, Card, Empty, Field, Input, Modal, Seg, Tag } from '../components/ui';
import { Icon } from '../components/Icon';
import { askJson, describeAiError, isConfigured, toConfig } from '../lib/ai';
import { chatPrompt, chatSummaryPrompt } from '../lib/prompts';
import { speak, stopSpeaking } from '../lib/speech';
import { relTime } from '../lib/format';
import { uid } from '../lib/id';
import type { ChatMessage, ChatSession, ChatSummary } from '../types';

const PRESETS = [
  { topic: 'Coffee shop chat', topicZh: '咖啡店闲聊', scenario: '周末下午在街角咖啡店，和刚认识的朋友聊天' },
  { topic: 'Weekend trip', topicZh: '周末旅行', scenario: '你在计划一个周末短途旅行，和同伴讨论目的地' },
  { topic: 'Films & TV', topicZh: '电影电视', scenario: '聊最近看过的电影或剧集，互相推荐' },
  { topic: 'Work & career', topicZh: '工作与职业', scenario: '聊工作内容、职业规划和通勤' },
  { topic: 'Food', topicZh: '美食', scenario: '讨论常去的餐厅、家乡菜和做饭习惯' },
  { topic: 'Technology', topicZh: '科技', scenario: '聊手机、AI 工具和新科技对生活的影响' },
];

export default function Chat() {
  const chats = useApp((s) => s.chats);
  const settings = useApp((s) => s.settings);
  const createChat = useApp((s) => s.createChat);
  const updateChat = useApp((s) => s.updateChat);
  const deleteChat = useApp((s) => s.deleteChat);
  const notify = useApp((s) => s.notify);
  const [activeId, setActiveId] = useState<string | null>(chats[0]?.id ?? null);
  const [newOpen, setNewOpen] = useState(false);

  const active = chats.find((c) => c.id === activeId) ?? null;

  if (!active) {
    return (
      <div className="page">
        <Card>
          <Empty
            icon="chat"
            title="开始一段自由对话"
            desc="AI 会像朋友一样和你聊天，结束时自动整理可用的口语表达。"
            action={<Button variant="primary" icon="plus" onClick={() => setNewOpen(true)}>新建对话</Button>}
          />
        </Card>
        <NewChatModal
          open={newOpen}
          onClose={() => setNewOpen(false)}
          onCreate={(draft) => {
            const session = createChat(draft);
            setActiveId(session.id);
            setNewOpen(false);
          }}
        />
      </div>
    );
  }

  return (
    <div className="page">
      <div className="chat-shell">
        <aside className="chat-side">
          <Button variant="primary" icon="plus" block onClick={() => setNewOpen(true)}>新建对话</Button>
          <div className="list" style={{ marginTop: 10 }}>
            {chats.map((c) => (
              <button key={c.id} className={`list-item list-item--btn ${c.id === activeId ? 'selected' : ''}`} onClick={() => setActiveId(c.id)}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="small" style={{ fontWeight: 550, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.topicZh || c.topic}
                  </div>
                  <div className="tiny muted">{c.messages.length} 条 · {relTime(c.updatedAt)}</div>
                </div>
                <span
                  className="btn btn--ghost btn--icon"
                  role="button"
                  tabIndex={0}
                  aria-label="删除对话"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteChat(c.id);
                    if (activeId === c.id) setActiveId(null);
                  }}
                >
                  <Icon name="trash" size={14} />
                </span>
              </button>
            ))}
          </div>
        </aside>

        <ChatRoom
          key={active.id}
          session={active}
          onUpdate={(patch) => updateChat(active.id, patch)}
          configured={isConfigured(settings.ai)}
          settings={settings}
          notify={notify}
        />
      </div>

      <NewChatModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onCreate={(draft) => {
          const session = createChat(draft);
          setActiveId(session.id);
          setNewOpen(false);
        }}
      />
    </div>
  );
}

function ChatRoom({
  session,
  onUpdate,
  configured,
  settings,
  notify,
}: {
  session: ChatSession;
  onUpdate: (patch: Partial<ChatSession>) => void;
  configured: boolean;
  settings: ReturnType<typeof useApp.getState>['settings'];
  notify: (text: string, tone?: 'ok' | 'err' | 'info') => void;
}) {
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [draft, setDraft] = useState('');
  const [summaryBusy, setSummaryBusy] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const started = useRef(false);

  const messages = session.messages;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, draft]);

  useEffect(() => {
    if (started.current || messages.length) return;
    started.current = true;
    void send('', true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function send(text: string, opener = false) {
    if (!configured) {
      setError('需要先在「设置 → AI 模型」里配置模型与 Key');
      return;
    }
    if (streaming) return;
    if (!opener && !text.trim()) return;

    const userMsg: ChatMessage | null = opener
      ? null
      : { id: uid('m'), role: 'user', content: text.trim(), at: Date.now() };

    const history = [...messages, ...(userMsg ? [userMsg] : [])];
    onUpdate({ messages: history });
    setInput('');
    setStreaming(true);
    setError('');
    setDraft('');

    const prompt = chatPrompt({ topic: session.topic, scenario: session.scenario, mode: session.mode, userLevel: 'band 6.5' });
    abortRef.current = new AbortController();
    let acc = '';

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: toConfig(settings.ai),
          messages: [
            { role: 'system', content: prompt.system },
            { role: 'user', content: prompt.user },
            ...history.map((m) => ({ role: m.role, content: m.content })),
          ],
          stream: true,
          temperature: settings.ai.temperature,
        }),
        signal: abortRef.current.signal,
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || data.error || `请求失败（${res.status}）`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setDraft(acc);
      }
      const reply: ChatMessage = { id: uid('m'), role: 'assistant', content: acc.trim(), at: Date.now() };
      onUpdate({ messages: [...history, reply] });
      setDraft('');
      if (settings.speech.autoSpeak && acc.trim()) void speak(acc.trim());
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        notify('已停止生成', 'info');
      } else {
        setError(describeAiError(err));
      }
      setDraft('');
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  async function summarize() {
    if (!configured) {
      setError('需要 AI 才能生成复盘');
      return;
    }
    setSummaryBusy(true);
    setError('');
    try {
      const transcript = messages.map((m) => `${m.role === 'user' ? 'Candidate' : 'Examiner'}: ${m.content}`).join('\n');
      const prompt = chatSummaryPrompt({ topic: session.topic, transcript });
      const raw = await askJson<ChatSummary>({
        config: toConfig(settings.ai),
        system: prompt.system,
        user: prompt.user,
        temperature: 0.4,
      });
      onUpdate({ summary: raw });
      notify('复盘已生成', 'ok');
    } catch (err) {
      setError(describeAiError(err));
    } finally {
      setSummaryBusy(false);
    }
  }

  return (
    <section className="chat-main">
      <div className="row" style={{ padding: '4px 2px 10px' }}>
        <div>
          <div className="card-title" style={{ fontSize: 16 }}>{session.topicZh || session.topic}</div>
          <div className="tiny muted">{session.mode === 'ielts' ? '考官模式' : '闲聊模式'} · {session.scenario}</div>
        </div>
        <div className="spacer" />
        <Button size="sm" variant="ghost" icon="sparkles" loading={summaryBusy} onClick={() => void summarize()}>生成复盘</Button>
      </div>

      <div className="chat-log">
        {messages.map((m) => (
          <div key={m.id} className={`msg ${m.role === 'user' ? 'msg--user' : 'msg--ai'}`}>
            <div className="msg-avatar">{m.role === 'user' ? '你' : 'AI'}</div>
            <div>
              <div className="bubble">{m.content}</div>
              {m.role === 'assistant' && (
                <button className="btn btn--ghost btn--sm" style={{ marginTop: 4 }} onClick={() => void speak(m.content)}>
                  <Icon name="volume" size={14} />
                  朗读
                </button>
              )}
            </div>
          </div>
        ))}
        {draft && (
          <div className="msg msg--ai">
            <div className="msg-avatar">AI</div>
            <div className="bubble typing">{draft}</div>
          </div>
        )}
        {streaming && !draft && <div className="tiny muted">正在思考…</div>}
        <div ref={bottomRef} />
      </div>

      {error && (
        <div className="card card--flat" style={{ background: 'var(--bad-soft)', marginTop: 8 }}>
          <div className="small">{error}</div>
        </div>
      )}

      {session.summary && <SummaryCard summary={session.summary} />}

      <div className="chat-input">
        <input
          className="input"
          placeholder="用英文回复，Enter 发送"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
        />
        {streaming ? (
          <Button variant="ghost" icon="stop" onClick={() => abortRef.current?.abort()}>停止</Button>
        ) : (
          <Button variant="primary" icon="arrow-right" onClick={() => void send(input)}>发送</Button>
        )}
      </div>
    </section>
  );
}

function SummaryCard({ summary }: { summary: ChatSummary }) {
  const addVocabItems = useApp((s) => s.addVocabItems);
  const notify = useApp((s) => s.notify);
  return (
    <Card style={{ marginTop: 12 }}>
      <div className="card-title">{summary.title || '本次复盘'}</div>
      <p className="small muted" style={{ marginTop: 4 }}>{summary.overall}</p>

      {summary.highlights.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div className="tiny" style={{ fontWeight: 600 }}>说得好的</div>
          {summary.highlights.map((h, i) => <div key={i} className="tiny muted">· {h}</div>)}
        </div>
      )}

      {summary.corrections.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div className="tiny" style={{ fontWeight: 600 }}>可以更地道</div>
          {summary.corrections.map((c, i) => (
            <div key={i} className="tiny muted" style={{ marginTop: 4 }}>
              <span style={{ textDecoration: 'line-through' }}>{c.said}</span> → <strong>{c.better}</strong>（{c.why}）
            </div>
          ))}
        </div>
      )}

      {summary.vocab.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="row">
            <div className="tiny" style={{ fontWeight: 600 }}>这次用得到的表达</div>
            <div className="spacer" />
            <Button
              size="sm"
              variant="ghost"
              icon="plus"
              onClick={() => {
                const added = addVocabItems(
                  summary.vocab.map((v) => ({
                    topic: '对话复盘',
                    topicZh: '对话复盘',
                    term: v.term,
                    meaningZh: v.meaningZh,
                    example: v.example,
                    type: v.type,
                    level: 'band7' as const,
                    source: 'chat' as const,
                  })),
                );
                notify(added ? `已加入 ${added} 张词卡` : '已经在词库里了', added ? 'ok' : 'info');
              }}
            >
              加入背诵
            </Button>
          </div>
          <div className="grid g2" style={{ marginTop: 8 }}>
            {summary.vocab.map((v) => (
              <div key={v.term} className="card card--flat card--pad-sm">
                <div className="row">
                  <div className="small" style={{ fontWeight: 600 }}>{v.term}</div>
                  <div className="spacer" />
                  <button className="btn btn--ghost btn--icon" aria-label="朗读" onClick={() => void speak(`${v.term}. ${v.example}`)}>
                    <Icon name="volume" size={14} />
                  </button>
                </div>
                <div className="tiny muted">{v.meaningZh}</div>
                <div className="tiny dim">{v.example}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function NewChatModal({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (draft: { topic: string; topicZh: string; scenario: string; mode: 'casual' | 'ielts' }) => void;
}) {
  const [preset, setPreset] = useState(0);
  const [mode, setMode] = useState<'casual' | 'ielts'>('casual');
  const [custom, setCustom] = useState('');

  const chosen = PRESETS[preset];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="新建对话"
      subtitle="选一个场景，或者自己写一个话题"
      footer={
        <>
          <div className="spacer" />
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button
            variant="primary"
            icon="chat"
            onClick={() =>
              onCreate({
                topic: custom.trim() || chosen.topic,
                topicZh: custom.trim() || chosen.topicZh,
                scenario: chosen.scenario,
                mode,
              })
            }
          >
            开始
          </Button>
        </>
      }
    >
      <div className="stack">
        <div className="scenario-grid">
          {PRESETS.map((p, i) => (
            <button key={p.topic} className={`scenario-card ${i === preset ? 'selected' : ''}`} onClick={() => setPreset(i)}>
              <div className="small" style={{ fontWeight: 600 }}>{p.topicZh}</div>
              <div className="tiny muted">{p.topic}</div>
            </button>
          ))}
        </div>
        <Field label="或自定义话题">
          <Input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="例如：A skill you want to learn" />
        </Field>
        <Field label="模式" hint="考官模式会按 Part 1 → Part 3 提问">
          <Seg value={mode} onChange={(v) => setMode(v as 'casual' | 'ielts')} options={[{ value: 'casual', label: '闲聊' }, { value: 'ielts', label: '考官模式' }]} />
        </Field>
      </div>
    </Modal>
  );
}
