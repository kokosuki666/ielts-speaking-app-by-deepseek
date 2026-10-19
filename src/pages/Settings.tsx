import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../store/useApp';
import { Button, Card, Field, Input, Seg, Switch, Tag } from '../components/ui';
import { Icon } from '../components/Icon';
import { describeAiError, isLocalBaseUrl, keyDiagnostics, sanitizeApiKey, testConnection, toConfig } from '../lib/ai';
import { speak, configureTts, loadVoices, ttsRuntime, TTS_VOICES_EVENT } from '../lib/speech';
import { downloadJSON } from '../lib/format';
import { ACCENTS, DEFAULT_APPEARANCE, THEMES, themeById } from '../lib/appearance';
import type { Appearance, Settings as SettingsShape } from '../types';

const GLASS_PRESETS: { name: string; value: Partial<Appearance> }[] = [
  { name: '液态玻璃', value: { alpha: 58, blur: 26, saturate: 170, border: 100, radius: 22 } },
  { name: '毛玻璃', value: { alpha: 38, blur: 34, saturate: 140, border: 70, radius: 20 } },
  { name: '水晶', value: { alpha: 24, blur: 12, saturate: 200, border: 0, radius: 18 } },
  { name: '浓玻璃', value: { alpha: 82, blur: 40, saturate: 160, border: 120, radius: 24 } },
  { name: '亚克力', value: { alpha: 66, blur: 18, saturate: 180, border: 40, radius: 16 } },
];

const PRESETS = [
  { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { label: 'SiliconFlow', baseUrl: 'https://api.siliconflow.cn/v1', model: 'deepseek-ai/DeepSeek-V3' },
  { label: '本机 Ollama', baseUrl: 'http://127.0.0.1:11434/v1', model: 'qwen2.5:7b' },
];

const EDGE_VOICES = [
  { id: 'en-GB-SoniaNeural', label: 'Sonia · 英式女声' },
  { id: 'en-GB-RyanNeural', label: 'Ryan · 英式男声' },
  { id: 'en-GB-LibbyNeural', label: 'Libby · 英式女声（轻快）' },
  { id: 'en-GB-ThomasNeural', label: 'Thomas · 英式男声（沉稳）' },
  { id: 'en-US-AriaNeural', label: 'Aria · 美式女声' },
  { id: 'en-US-GuyNeural', label: 'Guy · 美式男声' },
  { id: 'en-US-JennyNeural', label: 'Jenny · 美式女声（自然）' },
  { id: 'en-AU-NatashaNeural', label: 'Natasha · 澳式女声' },
  { id: 'en-IE-ConnorNeural', label: 'Connor · 爱尔兰男声' },
];

export default function Settings() {
  const settings = useApp((s) => s.settings);
  const patchSettings = useApp((s) => s.patchSettings);
  const notify = useApp((s) => s.notify);
  const exportData = useApp((s) => s.exportData);
  const importData = useApp((s) => s.importData);
  const resetAll = useApp((s) => s.resetAll);

  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [speechTest, setSpeechTest] = useState('');
  const [browserVoices, setBrowserVoices] = useState<ReturnType<typeof loadVoices>>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const diag = useMemo(() => keyDiagnostics(settings.ai.apiKey), [settings.ai.apiKey]);

  useEffect(() => {
    const load = () => setBrowserVoices(loadVoices());
    load();
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.onvoiceschanged = load;
    window.addEventListener(TTS_VOICES_EVENT, load);
    return () => {
      if (typeof speechSynthesis !== 'undefined') speechSynthesis.onvoiceschanged = null;
      window.removeEventListener(TTS_VOICES_EVENT, load);
    };
  }, []);

  // Any change to the AI config invalidates the previous test result.
  useEffect(() => {
    setTestResult(null);
  }, [settings.ai.baseUrl, settings.ai.apiKey, settings.ai.model, settings.ai.useServerDefault]);

  async function runTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const text = await testConnection(toConfig(settings.ai));
      setTestResult({ ok: true, text: `连接成功：${text.slice(0, 80)}` });
    } catch (err) {
      setTestResult({ ok: false, text: describeAiError(err) });
    } finally {
      setTesting(false);
    }
  }

  const applyPreset = (preset: (typeof PRESETS)[number]) => {
    patchSettings({ ai: { baseUrl: preset.baseUrl, model: preset.model } });
  };

  return (
    <div className="page">
      <Card className="fade-up">
        <div className="row">
          <span className="avatar avatar--violet"><Icon name="sparkles" size={18} /></span>
          <div>
            <div className="card-title">外观 · 主题背景与毛玻璃</div>
            <p className="card-desc">所有调整即时生效并自动保存，随时可以换回来。</p>
          </div>
          <div className="spacer" />
          <Button
            size="sm"
            variant="primary"
            icon="sparkles"
            onClick={() => patchSettings({ appearance: { ...settings.appearance, ...GLASS_PRESETS[0].value, glassButtons: true } })}
          >
            一键毛玻璃
          </Button>
          <Button
            size="sm"
            icon="shuffle"
            onClick={() => {
              const theme = THEMES[Math.floor(Math.random() * THEMES.length)];
              patchSettings({
                appearance: {
                  ...settings.appearance,
                  themeId: theme.id,
                  accent: ACCENTS[Math.floor(Math.random() * ACCENTS.length)],
                  alpha: 30 + Math.round(Math.random() * 45),
                  blur: 10 + Math.round(Math.random() * 30),
                },
                theme: theme.dark ? 'dark' : 'light',
              });
            }}
          >
            随机搭配
          </Button>
          <Button size="sm" variant="ghost" icon="refresh" onClick={() => patchSettings({ appearance: DEFAULT_APPEARANCE })}>
            恢复默认
          </Button>
        </div>
        <div className="divider" />

        <div className="appearance-grid">
          <div className="stack">
            <div className="row">
              <span className="small" style={{ fontWeight: 600 }}>主题背景</span>
              <span className="tiny dim">10 套 · 自动匹配深浅色</span>
              <div className="spacer" />
            </div>

            <div className="bg-grid">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  className={`bg-tile ${settings.appearance.themeId === t.id ? 'active' : ''}`}
                  onClick={() =>
                    patchSettings({
                      appearance: { ...settings.appearance, themeId: t.id, accent: t.accent },
                      theme: t.dark ? 'dark' : 'light',
                    })
                  }
                >
                  <span className="bg-thumb" style={{ backgroundImage: t.swatch }}>
                    <span className="bg-mini" />
                  </span>
                  <span className="bg-name">
                    {t.name}
                    {t.dark && <i className="bg-dark" />}
                  </span>
                </button>
              ))}
            </div>

            <div className="row" style={{ marginTop: 6 }}>
              <span className="small" style={{ fontWeight: 600 }}>强调色</span>
              <div className="spacer" />
              <span className="tiny dim">{settings.appearance.accent}</span>
            </div>
            <div className="swatches">
              {ACCENTS.map((c) => (
                <button
                  key={c}
                  className={`swatch ${settings.appearance.accent.toLowerCase() === c.toLowerCase() ? 'active' : ''}`}
                  style={{ background: c }}
                  aria-label={c}
                  onClick={() => patchSettings({ appearance: { ...settings.appearance, accent: c } })}
                />
              ))}
            </div>

            <div className="ap-preview" aria-hidden="true">
              <div className="ap-scene" style={{ background: themeById(settings.appearance.themeId).swatch }} />
              <div className="ap-card">
                <div className="row" style={{ gap: 7 }}>
                  <span className="ap-orb" />
                  <div style={{ minWidth: 0 }}>
                    <div className="small" style={{ fontWeight: 650 }}>Speaking Studio</div>
                    <div className="tiny dim">实时预览 · 拖动右侧滑块</div>
                  </div>
                  <div className="spacer" />
                  <span className="chip chip--on" style={{ fontSize: 10, padding: '3px 7px' }}>{settings.targetBand.toFixed(1)}</span>
                </div>
                <div className="bar" style={{ height: 6 }}><i style={{ width: '68%' }} /></div>
                <div className="row" style={{ gap: 6 }}>
                  <span className="btn btn--primary btn--sm">开始模考</span>
                  <span className="btn btn--sm">复习词卡</span>
                </div>
              </div>
            </div>
            <div className="tiny dim">当前背景：{themeById(settings.appearance.themeId).name}，切换背景会自动匹配深浅色与强调色。</div>
          </div>

          <div className="stack">
            <div className="row">
              <span className="small" style={{ fontWeight: 600 }}>玻璃质感</span>
              <div className="spacer" />
              <span className="tiny dim">预设</span>
            </div>
            <div className="chip-row">
              {GLASS_PRESETS.map((p) => (
                <button key={p.name} className="chip" onClick={() => patchSettings({ appearance: { ...settings.appearance, ...p.value } })}>
                  {p.name}
                </button>
              ))}
            </div>

            <Field label={`玻璃不透明度 · ${settings.appearance.alpha}%`} hint="越低越透，低于 30% 时按钮会自动保底可读">
              <input className="range" type="range" min={12} max={96} value={settings.appearance.alpha} onChange={(e) => patchSettings({ appearance: { ...settings.appearance, alpha: Number(e.target.value) } })} />
            </Field>
            <Field label={`背景模糊 · ${settings.appearance.blur}px`}>
              <input className="range" type="range" min={0} max={60} value={settings.appearance.blur} onChange={(e) => patchSettings({ appearance: { ...settings.appearance, blur: Number(e.target.value) } })} />
            </Field>
            <Field label={`背景饱和度 · ${settings.appearance.saturate}%`}>
              <input className="range" type="range" min={80} max={240} value={settings.appearance.saturate} onChange={(e) => patchSettings({ appearance: { ...settings.appearance, saturate: Number(e.target.value) } })} />
            </Field>
            <Field label={`边框高光 · ${settings.appearance.border}%`}>
              <input className="range" type="range" min={0} max={120} value={settings.appearance.border} onChange={(e) => patchSettings({ appearance: { ...settings.appearance, border: Number(e.target.value) } })} />
            </Field>
            <Field label={`圆角 · ${settings.appearance.radius}px`}>
              <input className="range" type="range" min={8} max={36} value={settings.appearance.radius} onChange={(e) => patchSettings({ appearance: { ...settings.appearance, radius: Number(e.target.value) } })} />
            </Field>

            <div className="divider" />
            <div className="stack-sm">
              <label className="row">
                <div>
                  <div className="small" style={{ fontWeight: 600 }}>毛玻璃按钮</div>
                  <div className="tiny muted">按钮、导航、标签统一使用磨砂质感</div>
                </div>
                <div className="spacer" />
                <Switch checked={settings.appearance.glassButtons} onChange={(v) => patchSettings({ appearance: { ...settings.appearance, glassButtons: v } })} />
              </label>
              <label className="row">
                <div>
                  <div className="small" style={{ fontWeight: 600 }}>胶片颗粒</div>
                  <div className="tiny muted">叠一层细颗粒，减少渐变塑料感</div>
                </div>
                <div className="spacer" />
                <Switch checked={settings.appearance.grain} onChange={(v) => patchSettings({ appearance: { ...settings.appearance, grain: v } })} />
              </label>
              <label className="row">
                <div>
                  <div className="small" style={{ fontWeight: 600 }}>背景缓动</div>
                  <div className="tiny muted">关闭后光斑静止，更省电</div>
                </div>
                <div className="spacer" />
                <Switch checked={settings.appearance.motion} onChange={(v) => patchSettings({ appearance: { ...settings.appearance, motion: v } })} />
              </label>
            </div>
          </div>
        </div>
      </Card>

      <Card className="fade-up">
        <div className="row">
          <span className="avatar avatar--teal"><Icon name="key" size={18} /></span>
          <div>
            <div className="card-title">AI 模型</div>
            <p className="card-desc">任何 OpenAI 兼容接口：DeepSeek、OpenAI、SiliconFlow、Ollama…</p>
          </div>
          <div className="spacer" />
          <Tag tone={settings.ai.useServerDefault ? 'warn' : 'ok'}>
            {settings.ai.useServerDefault ? '使用服务端密钥' : '使用浏览器保存的 Key'}
          </Tag>
        </div>

        <div className="chip-row" style={{ marginTop: 12 }}>
          {PRESETS.map((p) => (
            <button
              key={p.label}
              className={`chip ${settings.ai.baseUrl === p.baseUrl ? 'chip--on' : ''}`}
              onClick={() => applyPreset(p)}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="stack" style={{ marginTop: 14 }}>
          <Field label="Base URL" hint="通常以 /v1 结尾；代理会自动请求 /chat/completions">
            <Input value={settings.ai.baseUrl} onChange={(e) => patchSettings({ ai: { baseUrl: e.target.value } })} />
          </Field>

          <Field
            label={
              <span className="row" style={{ gap: 8 }}>
                API Key
                <span className="tiny muted">已填入 {diag.length} 个字符</span>
                {diag.looksValid && <Tag tone="ok">格式正常</Tag>}
              </span>
            }
            hint={
              diag.issues.length
                ? diag.issues.join('；')
                : isLocalBaseUrl(settings.ai.baseUrl)
                  ? '本地模型可以留空'
                  : '只保存在本机浏览器；DeepSeek Key 形如 sk- 开头共 35 位'
            }
          >
            <div className="row" style={{ gap: 8 }}>
              <Input
                type={showKey ? 'text' : 'password'}
                value={settings.ai.apiKey}
                onChange={(e) => patchSettings({ ai: { apiKey: sanitizeApiKey(e.target.value), useServerDefault: false } })}
                placeholder="sk-..."
                autoComplete="off"
                spellCheck={false}
              />
              <Button size="sm" variant="ghost" icon={showKey ? 'eye-off' : 'eye'} onClick={() => setShowKey((v) => !v)}>
                {showKey ? '隐藏' : '显示'}
              </Button>
            </div>
          </Field>

          <div className="grid g2">
            <Field label="模型">
              <Input value={settings.ai.model} onChange={(e) => patchSettings({ ai: { model: e.target.value } })} placeholder="deepseek-chat" />
            </Field>
            <Field label={`温度 · ${settings.ai.temperature.toFixed(1)}`} hint="评分建议 0.3–0.5，对话建议 0.7–0.9">
              <input
                className="range"
                type="range"
                min={0}
                max={1}
                step={0.1}
                value={settings.ai.temperature}
                onChange={(e) => patchSettings({ ai: { temperature: Number(e.target.value) } })}
              />
            </Field>
          </div>

          <div className="row">
            <div>
              <div className="small" style={{ fontWeight: 600 }}>服务端密钥</div>
              <div className="tiny muted">使用服务器 .env 里的 Key（适合桌面版/团队共用）</div>
            </div>
            <div className="spacer" />
            <Switch checked={settings.ai.useServerDefault} onChange={(v) => patchSettings({ ai: { useServerDefault: v } })} />
          </div>

          <div className="row" style={{ gap: 8 }}>
            <Button variant="primary" icon="sparkles" loading={testing} onClick={() => void runTest()}>
              测试连接
            </Button>
            {testResult && (
              <span className={`small ${testResult.ok ? '' : 'danger'}`} style={{ color: testResult.ok ? 'var(--ok)' : 'var(--bad)' }}>
                {testResult.ok ? '✓ ' : '✗ '}
                {testResult.text}
              </span>
            )}
          </div>

          {testResult && !testResult.ok && (
            <div className="hint">
              常见原因：Key 属于其他平台、复制不完整（DeepSeek 为 35 位）、已过期或账户欠费。可在平台重新生成后再试。
            </div>
          )}
        </div>
      </Card>

      <Card style={{ marginTop: 16 }}>
        <div className="card-title">语音</div>
        <p className="card-desc">Edge 神经语音由本地服务合成，接近真人；系统语音作为兜底</p>

        <div className="stack" style={{ marginTop: 12 }}>
          <Field label="引擎">
            <Seg
              value={settings.speech.provider}
              onChange={(v) => {
                patchSettings({ speech: { provider: v } });
                configureTts({ ...settings.speech, provider: v });
              }}
              options={[
                { value: 'edge', label: 'Edge 神经语音' },
                { value: 'openai', label: 'OpenAI 兼容 TTS' },
                { value: 'browser', label: '系统语音' },
              ]}
            />
          </Field>

          {settings.speech.provider !== 'browser' && (
            <Field label="发音人" hint="Edge 语音偶尔会被限流，失败会自动回退到系统语音">
              <select className="select" value={settings.speech.cloudVoice} onChange={(e) => patchSettings({ speech: { cloudVoice: e.target.value } })}>
                {EDGE_VOICES.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
              </select>
            </Field>
          )}

          {settings.speech.provider === 'browser' && (
            <Field label="系统发音人" hint={`检测到 ${browserVoices.length} 个系统语音`}>
              <select className="select" value={settings.speech.voiceURI} onChange={(e) => patchSettings({ speech: { voiceURI: e.target.value } })}>
                <option value="">自动选择（优先本地英音）</option>
                {browserVoices.filter((v) => /^en/i.test(v.lang)).map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>{v.name} · {v.lang}</option>
                ))}
              </select>
            </Field>
          )}

          <Field label={`语速 · ${settings.speech.rate.toFixed(2)}x`}>
            <input className="range" type="range" min={0.7} max={1.2} step={0.05} value={settings.speech.rate} onChange={(e) => patchSettings({ speech: { rate: Number(e.target.value) } })} />
          </Field>

          <div className="row">
            <div>
              <div className="small" style={{ fontWeight: 600 }}>自动朗读 AI 回复</div>
              <div className="tiny muted">对话与模考题目会自动播放</div>
            </div>
            <div className="spacer" />
            <Switch checked={settings.speech.autoSpeak} onChange={(v) => patchSettings({ speech: { autoSpeak: v } })} />
          </div>

          <div className="row">
            <div>
              <div className="small" style={{ fontWeight: 600 }}>自动语音转写</div>
              <div className="tiny muted">用浏览器识别麦克风，需 Chrome / Edge 并允许麦克风</div>
            </div>
            <div className="spacer" />
            <Switch checked={settings.speech.autoTranscribe} onChange={(v) => patchSettings({ speech: { autoTranscribe: v } })} />
          </div>

          <div className="row" style={{ gap: 8 }}>
            <Button
              size="sm"
              icon="volume"
              onClick={async () => {
                setSpeechTest('正在合成…');
                try {
                  await speak('This is a quick check of your speaking voice. It should sound natural and clear.');
                  const rt = ttsRuntime();
                  setSpeechTest(`已播放（${rt.provider === 'browser' ? '系统语音' : rt.cloudVoice}）`);
                } catch (err) {
                  setSpeechTest((err as Error).message);
                }
              }}
            >
              测试语音
            </Button>
            {speechTest && <span className="tiny muted">{speechTest}</span>}
          </div>
        </div>
      </Card>

      <Card style={{ marginTop: 16 }}>
        <div className="card-title">考试节奏</div>
        <p className="card-desc">按真实考试设置每题时长</p>
        <div className="grid g2" style={{ marginTop: 10 }}>
          <Field label={`Part 1 每题 ${settings.exam.part1Seconds}s`}>
            <input className="range" type="range" min={60} max={240} step={15} value={settings.exam.part1Seconds} onChange={(e) => patchSettings({ exam: { part1Seconds: Number(e.target.value) } })} />
          </Field>
          <Field label={`Part 2 准备 ${settings.exam.prepSeconds}s`}>
            <input className="range" type="range" min={0} max={120} step={15} value={settings.exam.prepSeconds} onChange={(e) => patchSettings({ exam: { prepSeconds: Number(e.target.value) } })} />
          </Field>
          <Field label={`Part 2 陈述 ${settings.exam.part2Seconds}s`}>
            <input className="range" type="range" min={60} max={180} step={15} value={settings.exam.part2Seconds} onChange={(e) => patchSettings({ exam: { part2Seconds: Number(e.target.value) } })} />
          </Field>
          <Field label={`Part 3 每题 ${settings.exam.part3Seconds}s`}>
            <input className="range" type="range" min={60} max={300} step={15} value={settings.exam.part3Seconds} onChange={(e) => patchSettings({ exam: { part3Seconds: Number(e.target.value) } })} />
          </Field>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <div>
            <div className="small" style={{ fontWeight: 600 }}>考官自动读题</div>
            <div className="tiny muted">进入每题时自动朗读题干</div>
          </div>
          <div className="spacer" />
          <Switch checked={settings.exam.examinerSpeaks} onChange={(v) => patchSettings({ exam: { examinerSpeaks: v } })} />
        </div>
      </Card>

      <Card style={{ marginTop: 16 }}>
        <div className="card-title">目标与偏好</div>
        <div className="stack" style={{ marginTop: 10 }}>
          <Field label={`目标分数 · ${settings.targetBand.toFixed(1)}`} hint="报告会按这个分数计算差距与计划">
            <input className="range" type="range" min={4} max={9} step={0.5} value={settings.targetBand} onChange={(e) => patchSettings({ targetBand: Number(e.target.value) })} />
          </Field>
          <Field label="每日目标词卡数">
            <input className="range" type="range" min={5} max={60} step={5} value={settings.dailyGoal} onChange={(e) => patchSettings({ dailyGoal: Number(e.target.value) })} />
          </Field>
          <Field label="主题">
            <Seg value={settings.theme} onChange={(v) => patchSettings({ theme: v as SettingsShape['theme'] })} options={[{ value: 'light', label: '浅色' }, { value: 'dark', label: '深色' }]} />
          </Field>
        </div>
      </Card>

      <Card style={{ marginTop: 16 }}>
        <div className="card-title">数据</div>
        <p className="card-desc">全部数据保存在本机浏览器；换设备时用导出/导入迁移</p>
        <div className="row" style={{ marginTop: 10, gap: 8, flexWrap: 'wrap' }}>
          <Button icon="download" onClick={() => downloadJSON(`ielts-studio-${new Date().toISOString().slice(0, 10)}.json`, exportData())}>导出全部数据</Button>
          <Button icon="upload" onClick={() => fileRef.current?.click()}>导入备份</Button>
          <input
            ref={fileRef}
            type="file"
            hidden
            accept="application/json,.json"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              try {
                const data = JSON.parse(await file.text());
                if (importData(data)) notify('已恢复备份', 'ok');
                else notify('文件格式不正确', 'err');
              } catch (err) {
                notify(`导入失败：${(err as Error).message}`, 'err');
              }
            }}
          />
          <div className="spacer" />
          <Button
            variant="danger"
            icon="trash"
            onClick={() => {
              if (!window.confirm('清空所有题库、套卷、报告与进度？此操作不可撤销。')) return;
              resetAll();
              notify('已恢复初始状态', 'ok');
            }}
          >
            清空数据
          </Button>
        </div>
      </Card>

      <div className="tiny dim" style={{ marginTop: 20, textAlign: 'center' }}>
        IELTS Speaking Studio · v1.4.0 · 本地优先，数据不出设备
        <span className="dot" />
        <Icon name="info" size={12} style={{ verticalAlign: '-2px' }} /> 评分仅供练习参考
      </div>
    </div>
  );
}
