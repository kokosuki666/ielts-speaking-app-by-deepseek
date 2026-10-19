import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../store/useApp';
import { Button, Card, Empty, Tag } from '../components/ui';
import { Icon } from '../components/Icon';
import { evaluateExam } from '../lib/evaluate';
import { speak, stopSpeaking, startRecognition, startRecorder, type RecorderHandle } from '../lib/speech';
import { countWords, fmtDuration } from '../lib/format';
import { describeAiError } from '../lib/ai';
import { buildAsrConfig, transcribeAudio } from '../lib/asr';

export default function Exam() {
  const run = useApp((s) => s.examRun);
  const settings = useApp((s) => s.settings);
  const setAnswer = useApp((s) => s.setAnswer);
  const setExamIndex = useApp((s) => s.setExamIndex);
  const finishExam = useApp((s) => s.finishExam);
  const clearExam = useApp((s) => s.clearExam);
  const saveReport = useApp((s) => s.saveReport);
  const notify = useApp((s) => s.notify);
  const navigate = useNavigate();

  const [transcript, setTranscript] = useState('');
  const [phase, setPhase] = useState<'idle' | 'prep' | 'answer'>('idle');
  const [left, setLeft] = useState(0);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [stage, setStage] = useState('');
  const stopRecognition = useRef<(() => void) | null>(null);
  const recorder = useRef<RecorderHandle | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const startedAt = useRef<number>(0);

  const item = run?.items[run.currentIndex];
  const total = run?.items.length ?? 0;
  const answer = item ? run?.answers[item.questionId] : undefined;

  const limit = useMemo(() => {
    if (!item) return 0;
    if (item.part === 1) return settings.exam.part1Seconds;
    if (item.part === 2) return settings.exam.part2Seconds;
    return settings.exam.part3Seconds;
  }, [item, settings.exam]);

  useEffect(() => {
    setTranscript(answer?.transcript ?? '');
    setPhase('idle');
    setLeft(0);
    startedAt.current = 0;
  }, [item?.questionId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (phase === 'idle') return;
    const timer = window.setInterval(() => {
      setLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          if (phase === 'prep') {
            startAnswering();
          } else {
            stopAll();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (item && settings.exam.examinerSpeaks) {
      void speak(item.question);
    }
    return () => stopSpeaking();
  }, [item?.questionId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => stopAll(), []); // eslint-disable-line react-hooks/exhaustive-deps

  function startAnswering() {
    setPhase('answer');
    setLeft(limit);
    startedAt.current = Date.now();
  }

  function startPart() {
    stopAll();
    if (!item) return;
    if (item.part === 2 && settings.exam.prepSeconds > 0) {
      setPhase('prep');
      setLeft(settings.exam.prepSeconds);
    } else {
      startAnswering();
    }
    if (settings.speech.autoTranscribe) void startMic();
  }

  async function startMic() {
    if (recording) return;
    setRecording(true);
    // Chrome's Web Speech API uploads to Google; when a compatible transcription
    // provider is configured we record locally and transcribe on stop instead.
    if (settings.asr.provider === 'browser') {
      const stop = startRecognition({
        onInterim: (text) => setTranscript((prev) => `${prev}${prev && !prev.endsWith(' ') ? ' ' : ''}${text}`),
        onFinal: (text) => {
          if (text) setTranscript((prev) => `${prev}${prev && !prev.endsWith(' ') ? ' ' : ''}${text}`);
        },
        onError: (message) => {
          notify(message, 'err');
          setRecording(false);
        },
        onEnd: () => setRecording(false),
      });
      stopRecognition.current = stop;
    }
    try {
      recorder.current = await startRecorder();
    } catch {
      /* recording is optional */
    }
  }

  function stopMic() {
    stopRecognition.current?.();
    stopRecognition.current = null;
    setRecording(false);
    const rec = recorder.current;
    recorder.current = null;
    return rec?.stop() ?? Promise.resolve(null);
  }

  function stopAll() {
    stopRecognition.current?.();
    stopRecognition.current = null;
    if (recorder.current) {
      void recorder.current.stop();
      recorder.current = null;
    }
    setRecording(false);
    setPhase('idle');
  }

  async function persistCurrent() {
    if (!item) return;
    const duration = startedAt.current ? (Date.now() - startedAt.current) / 1000 : 0;
    let recordingUrl: string | undefined;
    let finalText = transcript.trim();

    if (recorder.current) {
      const result = await stopMic();
      recordingUrl = result?.url;

      // Skip tiny blobs: the user probably typed instead of speaking.
      if (settings.asr.provider === 'openai' && result?.blob && result.blob.size > 1500) {
        setTranscribing(true);
        try {
          const text = await transcribeAudio(result.blob, {
            config: buildAsrConfig(settings),
            asr: settings.asr,
          });
          if (text) {
            finalText = finalText ? `${finalText} ${text}` : text;
            setTranscript(finalText);
          }
        } catch (err) {
          notify((err as Error).message, 'err');
        } finally {
          setTranscribing(false);
        }
      }
    }

    setAnswer({
      questionId: item.questionId,
      part: item.part,
      question: item.question,
      bullets: item.bullets,
      transcript: finalText,
      durationSec: Math.round(duration),
      wordCount: countWords(finalText),
      recordingUrl,
      skipped: !finalText,
    });
  }

  async function go(delta: number) {
    await persistCurrent();
    stopAll();
    if (!run) return;
    const next = run.currentIndex + delta;
    if (next < 0) return;
    if (next >= run.items.length) {
      void finish();
      return;
    }
    setExamIndex(next);
  }

  async function finish() {
    if (!run) return;
    await persistCurrent();
    stopAll();
    finishExam();
    setEvaluating(true);
    setStage('正在整理作答…');
    abortRef.current = new AbortController();
    try {
      const report = await evaluateExam(Object.values(run.answers), {
        paperName: run.paperName,
        paperId: run.paperId,
        targetBand: settings.targetBand,
        ai: settings.ai,
        signal: abortRef.current.signal,
        onStage: setStage,
      });
      saveReport(report);
      notify(report.engine === 'ai' ? 'AI 评分完成' : '已生成离线估算报告', 'ok');
      navigate(`/reports/${report.id}`);
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        notify('已取消评分', 'info');
      } else {
        notify(describeAiError(err), 'err');
      }
      setEvaluating(false);
    }
  }

  if (!run || !run.items.length) {
    return (
      <div className="page">
        <Card>
          <Empty
            icon="exam"
            title="还没有进行中的模考"
            desc="去「套卷」选一套开始，或随机生成一套。"
            action={<Button variant="primary" icon="papers" onClick={() => navigate('/papers')}>去选套卷</Button>}
          />
        </Card>
      </div>
    );
  }

  const progress = ((run.currentIndex + 1) / total) * 100;
  const canRecord = settings.speech.autoTranscribe;

  return (
    <div className="page">
      <div className="exam-top">
        <div>
          <div className="eyebrow">{run.paperName}</div>
          <div className="row" style={{ gap: 6, marginTop: 4 }}>
            <Tag tone="accent">Part {item?.part}</Tag>
            <Tag>{item?.topicZh || item?.topic}</Tag>
            <span className="tiny muted">{run.currentIndex + 1} / {total}</span>
          </div>
        </div>
        <div className="spacer" />
        <div className="row" style={{ gap: 8 }}>
          <Button size="sm" variant="ghost" icon="x" onClick={() => {
            stopAll();
            clearExam();
            navigate('/papers');
          }}>
            放弃
          </Button>
          <Button size="sm" variant="primary" icon="check" loading={evaluating} onClick={() => void finish()}>
            完成并评分
          </Button>
        </div>
      </div>

      <div className="bar" style={{ marginTop: 10 }}>
        <span style={{ width: `${progress}%` }} />
      </div>

      <Card style={{ marginTop: 16 }}>
        <div className="row">
          <div className="eyebrow">{item?.part === 2 ? 'Cue card' : 'Question'}</div>
          <div className="spacer" />
          <button className="btn btn--ghost btn--sm" onClick={() => item && void speak(item.question)}>
            <Icon name="volume" size={15} />
            朗读题目
          </button>
        </div>
        <div className="question-text">{item?.question}</div>
        {item?.questionZh && <div className="small muted" style={{ marginTop: 6 }}>{item.questionZh}</div>}
        {item?.bullets?.length ? (
          <ul className="cue" style={{ marginTop: 12 }}>
            {item.bullets.map((b) => <li key={b}>{b}</li>)}
          </ul>
        ) : null}
      </Card>

      <div className="grid g2" style={{ marginTop: 16, alignItems: 'start' }}>
        <Card>
          <div className="card-hd">
            <div>
              <div className="card-title">作答</div>
              <p className="card-desc">录音或直接输入转写文本，两种都行</p>
            </div>
            <span className={`timer ${left > 0 && left <= 10 ? 'warn' : ''}`}>{fmtDuration(left)}</span>
          </div>

          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {phase === 'idle' ? (
              <Button variant="primary" icon="mic" onClick={() => startPart()}>
                {item?.part === 2 && settings.exam.prepSeconds > 0 ? `开始（${settings.exam.prepSeconds}s 准备）` : '开始作答'}
              </Button>
            ) : (
              <Button variant="ghost" icon="stop" onClick={() => { void persistCurrent(); stopAll(); }}>
                结束这道题
              </Button>
            )}
            {canRecord && (
              <Button size="sm" variant="ghost" icon={recording ? 'volume-off' : 'mic'} onClick={() => (recording ? stopAll() : void startMic())}>
                {recording ? '暂停转写' : '重新开始转写'}
              </Button>
            )}
            <div className="spacer" />
            {transcribing && <span className="tiny muted">正在转写…</span>}
            <span className="tiny muted">{countWords(transcript)} 词</span>
          </div>

          {phase === 'prep' && (
            <div className="card card--flat card--pad-sm" style={{ marginTop: 10, background: 'var(--accent-soft)' }}>
              <div className="small">准备时间：可以在纸上写关键词，{fmtDuration(left)} 后自动开始。</div>
            </div>
          )}

          <textarea
            className="textarea"
            rows={8}
            style={{ marginTop: 10 }}
            placeholder="说出你的答案，转写会出现在这里；也可以直接打字。"
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
          />

          {answer?.recordingUrl && (
            <audio controls src={answer.recordingUrl} style={{ width: '100%', marginTop: 10 }} />
          )}
        </Card>

        <Card>
          <div className="card-title">当前进度</div>
          <div className="list" style={{ marginTop: 8, maxHeight: 320, overflowY: 'auto' }}>
            {run.items.map((it, i) => {
              const done = Boolean(run.answers[it.questionId]?.transcript?.trim());
              return (
                <button
                  key={it.questionId}
                  className={`list-item list-item--btn ${i === run.currentIndex ? 'selected' : ''}`}
                  onClick={() => { void persistCurrent(); stopAll(); setExamIndex(i); }}
                >
                  <span className={`check ${done ? 'on' : ''}`}>{done && <Icon name="check" size={12} />}</span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="tiny muted">Part {it.part} · {it.topicZh || it.topic}</div>
                    <div className="small" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.question}</div>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="row" style={{ marginTop: 12, gap: 8 }}>
            <Button size="sm" variant="ghost" icon="arrow-left" disabled={run.currentIndex === 0} onClick={() => void go(-1)}>上一题</Button>
            <div className="spacer" />
            <Button size="sm" variant="primary" icon="arrow-right" onClick={() => void go(1)}>
              {run.currentIndex + 1 >= total ? '完成' : '下一题'}
            </Button>
          </div>
        </Card>
      </div>

      {evaluating && (
        <Card style={{ marginTop: 16 }}>
          <div className="row" style={{ gap: 10 }}>
            <span className="spinner" />
            <div>
              <div className="small" style={{ fontWeight: 600 }}>{stage || '正在评分…'}</div>
              <div className="tiny muted">AI 会逐句引用你的原话，通常需要 10–30 秒</div>
            </div>
            <div className="spacer" />
            <Button size="sm" variant="ghost" onClick={() => abortRef.current?.abort()}>取消</Button>
          </div>
        </Card>
      )}
    </div>
  );
}
