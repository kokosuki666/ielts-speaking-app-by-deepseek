import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../store/useApp';
import { Button, Card, Empty, Field, Input, Modal, Seg, Tag } from '../components/ui';
import { Icon } from '../components/Icon';
import { askJson, describeAiError, isConfigured, toConfig } from '../lib/ai';
import { buildAsrConfig, transcribeAudio } from '../lib/asr';
import { chatPrompt, chatSummaryPrompt } from '../lib/prompts';
import { recognitionSupported, speak, startRecognition, startRecorder, stopSpeaking, type RecorderHandle } from '../lib/speech';
import { relTime } from '../lib/format';
import { uid } from '../lib/id';
import type { ChatMessage, ChatSession, ChatSummary } from '../types';

const PRESETS = [
  { emoji: '☕', topic: 'Coffee shop chat', topicZh: '咖啡店闲聊', scenario: '周末下午在街角咖啡店，和刚认识的朋友聊天' },
  { emoji: '🚂', topic: 'Weekend trip', topicZh: '周末旅行', scenario: '你在计划一个周末短途旅行，和同伴讨论目的地' },
  { emoji: '🎬', topic: 'Films & TV', topicZh: '电影电视', scenario: '聊最近看过的电影或剧集，互相推荐' },
  { emoji: '💼', topic: 'Work & career', topicZh: '工作与职业', scenario: '聊工作内容、职业规划和通勤' },
  { emoji: '🍜', topic: 'Food', topicZh: '美食', scenario: '讨论常去的餐厅、家乡菜和做饭习惯' },
  { emoji: '📱', topic: 'Technology', topicZh: '科技', scenario: '聊手机、AI 工具和新科技对生活的影响' },
];

const OPENERS = [
  'How has your week been so far?',
  'I have been meaning to ask you…',
  'What do you usually do at weekends?',
  'That reminds me of something.',
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
        <Card className="fade-up">
          <div className="row">
            <div>
              <div className="card-title">AI 对话</div>
              <p className="card-desc">像和真人聊天一样练口语；结束时自动复盘、提炼话题词与更地道的说法。</p>
            </div>
            <div className="spacer" />
            <Button icon="plus" onClick={() => setNewOpen(true)}>自定义话题</Button>
          </div>
          <div className="divider" />
          <div className="grid g3">
            {PRESETS.map((p) => (
              <button
                key={p.topic}
                className="card card--hover"
                style={{ textAlign: 'left' }}
                onClick={() => {
                  const session = createChat({ topic: p.topic, topicZh: p.topicZh, scenario: p.scenario, mode: 'casual' });
                  setActiveId(session.id);
                }}
              >
                <div className="row">
                  <span style={{ fontSize: 22 }}>{p.emoji}</span>
                  <div className="spacer" />
                  <Tag>开始聊</Tag>
                </div>
                <div className="small" style={{ fontWeight: 600, marginTop: 8 }}>{p.topicZh}</div>
                <div className="tiny dim">{p.topic}</div>
                <div className="tiny muted" style={{ marginTop: 4 }}>{p.scenario}</div>
              </button>
            ))}
          </div>
          <div className="divider" />
          <div className="row">
            <div>
              <div className="small" style={{ fontWeight: 600 }}>考官模式</div>
              <div className="tiny muted">按 Part 1 → Part 2 → Part 3 的梯度提问，不打断、不评价</div>
            </div>
            <div className="spacer" />
            <Button
              size="sm"
              icon="mic"
              onClick={() => {
                const session = createChat({
                  topic: 'IELTS Speaking Test',
                  topicZh: '全真考官模式',
                  scenario: '按雅思口语 Part 1 → Part 2 → Part 3 提问',
                  mode: 'ielts',
                });
                setActiveId(session.id);
              }}
            >
              开始模考对话
            </Button>
          </div>
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
  const [recording, setRecording] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const recorderRef = useRef<RecorderHandle | null>(null);
  const stopRecognitionRef = useRef<(() => void) | null>(null);
  const started = useRef(false);
  const patchSettings = useApp((s) => s.patchSettings);

  const messages = session.messages;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, draft]);

  useEffect(
    () => () => {
      stopRecognitionRef.current?.();
      void recorderRef.current?.cancel();
    },
    [],
  );

  /** Voice input: browser speech recognition, or record + cloud transcription. */
  async function toggleMic() {
    if (voiceBusy) return;
    if (
      !recording &&
      settings.asr.provider === 'openai' &&
      !settings.asr.baseUrl.trim() &&
      /deepseek/i.test(settings.ai.baseUrl)
    ) {
      notify('DeepSeek 没有转写接口：请在 设置 → 语音识别 点「SiliconFlow」，填上硅基流动的 Key 再试', 'err');
      return;
    }

    if (recording) {
      stopRecognitionRef.current?.();
      stopRecognitionRef.current = null;
      setRecording(false);
      const handle = recorderRef.current;
      recorderRef.current = null;
      if (!handle) return;
      setVoiceBusy(true);
      try {
        const out = await handle.stop();
        if (!out?.blob) throw new Error('没有录到声音');
        const text = await transcribeAudio(out.blob, { config: buildAsrConfig(settings), asr: settings.asr });
        if (!text) throw new Error('没有识别到语音，再说一次试试');
        setInput((prev) => `${prev}${prev && !prev.endsWith(' ') ? ' ' : ''}${text}`);
        if (settings.speech.autoTranscribe) void send(text);
      } catch (err) {
        const message = (err as Error).message || '语音转写失败';
        const hint = /404/.test(message)
          ? '。请在设置 → 语音识别点「SiliconFlow」（Base URL https://api.siliconflow.cn/v1，模型 FunAudioLLM/SenseVoiceSmall）'
          : /401|403/.test(message)
            ? '。请检查语音识别的 API Key'
            : '';
        notify(`${message}${hint}`, 'err');
      } finally {
        setVoiceBusy(false);
      }
      return;
    }

    if (settings.asr.provider === 'browser') {
      if (!recognitionSupported()) {
        notify('当前浏览器不支持语音识别，请到设置里配置云端转写', 'err');
        return;
      }
      setRecording(true);
      stopRecognitionRef.current = startRecognition({
        onFinal: (text) => {
          if (!text) return;
          setInput((prev) => `${prev}${prev && !prev.endsWith(' ') ? ' ' : ''}${text}`);
        },
        onError: (message) => {
          notify(message, 'err');
          setRecording(false);
        },
        onEnd: () => setRecording(false),
      });
      return;
    }

    try {
      recorderRef.current = await startRecorder();
      setRecording(true);
    } catch {
      notify('无法访问麦克风，请检查系统权限', 'err');
    }
  }

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
        <button
          className={`chip ${settings.speech.autoSpeak ? 'chip--on' : ''}`}
          title="AI 回复后自动朗读"
          onClick={() => patchSettings({ speech: { ...settings.speech, autoSpeak: !settings.speech.autoSpeak } })}
        >
          <Icon name="volume" size={13} /> 自动朗读
        </button>
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

      {messages.length === 0 && !streaming && (
        <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          <span className="tiny dim">不知道说什么？试试：</span>
          {OPENERS.map((line) => (
            <button key={line} className="chip" onClick={() => void send(line)}>{line}</button>
          ))}
        </div>
      )}

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
        <Button
          variant={recording ? 'danger' : 'ghost'}
          icon={recording ? 'stop' : 'mic'}
          loading={voiceBusy}
          title={settings.asr.provider === 'browser' ? '语音输入：用浏览器识别英文' : '语音输入：录音后走云端转写'}
          onClick={() => void toggleMic()}
        >
          {voiceBusy ? '转写中' : recording ? '停止' : '语音'}
        </Button>
        {streaming ? (
          <Button variant="ghost" icon="stop" onClick={() => abortRef.current?.abort()}>停止</Button>
        ) : (
          <Button variant="primary" icon="arrow-right" onClick={() => void send(input)}>发送</Button>
        )}
      </div>
      {recording && <div className="tiny muted" style={{ padding: '6px 4px 0' }}>正在听…说完点「停止」，文字会填进输入框。</div>}
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
