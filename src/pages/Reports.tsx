import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../store/useApp';
import { Button, Card, Empty, Ring, Tag, useConfirm } from '../components/ui';
import { Icon } from '../components/Icon';
import { CRITERIA, bandTone, fmtBand, tagTone } from '../lib/band';
import { fmtDate, relTime } from '../lib/format';
import { speak } from '../lib/speech';
import type { CriteriaKey, ExamReport } from '../types';

export default function Reports() {
  const { id } = useParams();
  const reports = useApp((s) => s.reports);
  const report = reports.find((r) => r.id === id);
  const navigate = useNavigate();

  if (id) {
    return report ? (
      <ReportDetail report={report} onBack={() => navigate('/reports')} />
    ) : (
      <div className="page">
        <Card>
          <Empty icon="chart" title="报告不存在" desc="可能已被删除。" action={<Button onClick={() => navigate('/reports')}>返回列表</Button>} />
        </Card>
      </div>
    );
  }

  return (
    <div className="page">
      <Card>
        <div className="row">
          <div>
            <div className="card-title">成绩报告</div>
            <p className="card-desc">按雅思官方四项标准评分，含逐句证据与训练计划</p>
          </div>
          <div className="spacer" />
          <Button variant="ghost" icon="play" onClick={() => navigate('/papers')}>再考一次</Button>
        </div>
      </Card>

      {reports.length ? (
        <div className="stack" style={{ marginTop: 16 }}>
          {reports.map((r) => (
            <Card key={r.id} className="card--hover">
              <div className="row">
                <div style={{ minWidth: 0 }}>
                  <div className="card-title" style={{ fontSize: 16 }}>{r.paperName}</div>
                  <div className="tiny muted">
                    {fmtDate(r.createdAt)} · {r.engine === 'ai' ? 'AI 评分' : '离线估算'} · 目标 {fmtBand(r.targetBand)}
                  </div>
                </div>
                <div className="spacer" />
                <div className="row" style={{ gap: 6 }}>
                  {CRITERIA.map((c) => (
                    <span key={c.key} className="tiny muted">{c.short} {fmtBand(r.criteria[c.key]?.band)}</span>
                  ))}
                </div>
                <span className={`band-pill band--${bandTone(r.overall)}`}>{fmtBand(r.overall)}</span>
              </div>
              <div className="small muted" style={{ marginTop: 8 }}>
                {r.overview.slice(0, 120)}{r.overview.length > 120 ? '…' : ''}
              </div>
              <div className="row" style={{ marginTop: 10 }}>
                <Link to={`/reports/${r.id}`} className="btn btn--ghost btn--sm">
                  查看详情 <Icon name="arrow-right" size={14} />
                </Link>
                <span className="spacer" />
                <span className="tiny dim">{relTime(r.createdAt)}</span>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card style={{ marginTop: 16 }}>
          <Empty icon="chart" title="还没有报告" desc="完成一次模考后，这里会显示四项分数、证据与计划。" action={<Button variant="primary" icon="play" onClick={() => navigate('/papers')}>开始模考</Button>} />
        </Card>
      )}
    </div>
  );
}

function ReportDetail({ report, onBack }: { report: ExamReport; onBack: () => void }) {
  const addVocabItems = useApp((s) => s.addVocabItems);
  const notify = useApp((s) => s.notify);
  const deleteReport = useApp((s) => s.deleteReport);
  const navigate = useNavigate();
  const { confirm, node } = useConfirm();
  const [openKey, setOpenKey] = useState<CriteriaKey | null>('fluency');

  const gap = useMemo(() => Math.max(0, report.targetBand - report.overall), [report]);

  return (
    <div className="page">
      <div className="row no-print">
        <Button variant="ghost" icon="arrow-left" onClick={onBack}>返回</Button>
        <div className="spacer" />
        <Button variant="ghost" icon="download" onClick={() => window.print()}>打印 / 存 PDF</Button>
        <Button
          variant="ghost"
          icon="trash"
          onClick={() => {
            void confirm('删除这份报告？').then((ok) => {
              if (ok) {
                deleteReport(report.id);
                notify('已删除', 'ok');
                navigate('/reports');
              }
            });
          }}
        >
          删除
        </Button>
      </div>

      <Card style={{ marginTop: 12 }}>
        <div className="report-head">
          <div>
            <div className="eyebrow">{report.engine === 'ai' ? 'AI Examiner Report' : 'Offline Estimate'}</div>
            <h2 style={{ margin: '6px 0 4px', fontSize: 24 }}>{report.paperName}</h2>
            <div className="tiny muted">{fmtDate(report.createdAt)} · 目标 {fmtBand(report.targetBand)}</div>
            <div className="row" style={{ gap: 6, marginTop: 10 }}>
              <Tag tone={tagTone(report.overall)}>总分 {fmtBand(report.overall)}</Tag>
              {gap > 0 ? <Tag tone="warn">还差 {fmtBand(gap)}</Tag> : <Tag tone="ok">已达标</Tag>}
              {report.engine === 'local' && <Tag>离线估算 ±0.5</Tag>}
            </div>
          </div>
          <div className="spacer" />
          <Ring value={report.overall} max={9} label={fmtBand(report.overall)} sub="Overall" />
        </div>

        <p className="small" style={{ marginTop: 14, lineHeight: 1.75 }}>{report.overview}</p>
        {report.notes && <div className="hint" style={{ marginTop: 8 }}>{report.notes}</div>}
      </Card>

      <div className="grid g2" style={{ marginTop: 16 }}>
        {CRITERIA.map((c) => {
          const score = report.criteria[c.key];
          const open = openKey === c.key;
          return (
            <Card key={c.key} className="crit-card">
              <button className="crit-head" onClick={() => setOpenKey(open ? null : c.key)}>
                <div>
                  <div className="crit-name">{c.zh}</div>
                  <div className="crit-en">{c.en}</div>
                </div>
                <div className="spacer" />
                <span className={`band-pill band--${bandTone(score.band)}`}>{fmtBand(score.band)}</span>
                <Icon name={open ? 'chevron-down' : 'chevron-right'} size={16} />
              </button>
              <p className="small" style={{ marginTop: 8 }}>{score.summary}</p>
              {open && (
                <div className="stack-sm" style={{ marginTop: 10 }}>
                  <div className="grid g2" style={{ gap: 8 }}>
                    <div>
                      <div className="tiny" style={{ fontWeight: 600 }}>做得好的</div>
                      {score.strengths.map((s, i) => <div key={i} className="tiny muted">· {s}</div>)}
                    </div>
                    <div>
                      <div className="tiny" style={{ fontWeight: 600 }}>需要改的</div>
                      {score.weaknesses.map((s, i) => <div key={i} className="tiny muted">· {s}</div>)}
                    </div>
                  </div>
                  {score.evidence.map((e, i) => (
                    <div key={i} className="evidence">
                      <div className="quote-mark">“</div>
                      <div className="small" style={{ fontStyle: 'italic' }}>{e.quote}</div>
                      <div className="tiny muted" style={{ marginTop: 4 }}>{e.comment}</div>
                      {e.upgrade && <div className="tiny" style={{ marginTop: 4 }}>改法：{e.upgrade}</div>}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <Card style={{ marginTop: 16 }}>
        <div className="card-title">三个优先改进项</div>
        <div className="stack" style={{ marginTop: 10 }}>
          {report.priorities.map((p, i) => (
            <div key={i} className="list-item" style={{ alignItems: 'flex-start' }}>
              <span className="kbd">{i + 1}</span>
              <div>
                <div className="small" style={{ fontWeight: 600 }}>{p.title}</div>
                <div className="tiny muted" style={{ marginTop: 2 }}>{p.why}</div>
                <ul className="tiny" style={{ margin: '6px 0 0 16px', padding: 0 }}>
                  {p.actions.map((a, j) => <li key={j}>{a}</li>)}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {report.sampleUpgrades.length > 0 && (
        <Card style={{ marginTop: 16 }}>
          <div className="card-title">目标分示范</div>
          <p className="card-desc">可以直接朗读跟读，注意连接词与重音</p>
          <div className="stack" style={{ marginTop: 10 }}>
            {report.sampleUpgrades.map((s, i) => (
              <div key={i} className="card card--flat card--pad-sm">
                <div className="row">
                  <div className="tiny muted">{s.question}</div>
                  <div className="spacer" />
                  <Button size="sm" variant="ghost" icon="volume" onClick={() => void speak(s.answer)}>朗读</Button>
                </div>
                <p className="small" style={{ marginTop: 6, lineHeight: 1.7 }}>{s.answer}</p>
                <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  {s.keyPhrases.map((p) => <Tag key={p} tone="accent">{p}</Tag>)}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {report.vocabSuggestions.length > 0 && (
        <Card style={{ marginTop: 16 }}>
          <div className="row">
            <div>
              <div className="card-title">这次最该背的表达</div>
              <p className="card-desc">来自你的作答与话题，一键加入背诵</p>
            </div>
            <div className="spacer" />
            <Button
              size="sm"
              variant="primary"
              icon="plus"
              onClick={() => {
                const added = addVocabItems(
                  report.vocabSuggestions.map((v) => ({
                    topic: `报告 · ${report.paperName}`,
                    topicZh: '模考复盘',
                    term: v.term,
                    meaningZh: v.meaningZh,
                    example: v.example,
                    type: v.type,
                    level: 'band7' as const,
                    source: 'ai' as const,
                  })),
                );
                notify(added ? `已加入 ${added} 张词卡` : '这些表达已经在词库里了', added ? 'ok' : 'info');
              }}
            >
              全部加入背诵
            </Button>
          </div>
          <div className="grid g2" style={{ marginTop: 10 }}>
            {report.vocabSuggestions.map((v) => (
              <div key={v.term} className="card card--flat card--pad-sm">
                <div className="row">
                  <div className="small" style={{ fontWeight: 600 }}>{v.term}</div>
                  <div className="spacer" />
                  <button className="btn btn--ghost btn--icon" aria-label="朗读" onClick={() => void speak(`${v.term}. ${v.example}`)}>
                    <Icon name="volume" size={15} />
                  </button>
                </div>
                <div className="tiny muted">{v.meaningZh}</div>
                <div className="tiny dim" style={{ marginTop: 2 }}>{v.example}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {report.plan && (
        <Card style={{ marginTop: 16 }}>
          <div className="card-title">提分计划</div>
          <p className="card-desc">{report.plan.verdict}</p>
          <div className="stack-sm" style={{ marginTop: 8 }}>
            {report.plan.weeks.map((w) => (
              <div key={w.week} className="list-item" style={{ alignItems: 'flex-start' }}>
                <span className="kbd">W{w.week}</span>
                <div>
                  <div className="small" style={{ fontWeight: 600 }}>{w.focus}</div>
                  <ul className="tiny muted" style={{ margin: '4px 0 0 16px', padding: 0 }}>
                    {w.tasks.map((t, i) => <li key={i}>{t}</li>)}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card style={{ marginTop: 16 }}>
        <div className="card-title">作答记录</div>
        <div className="stack-sm" style={{ marginTop: 8 }}>
          {report.answers.map((a) => (
            <details key={a.questionId} className="card card--flat card--pad-sm">
              <summary className="small" style={{ cursor: 'pointer' }}>
                Part {a.part} · {a.question}
              </summary>
              <p className="small muted" style={{ marginTop: 8, lineHeight: 1.7 }}>
                {a.transcript || '（未作答）'}
              </p>
              <div className="tiny dim" style={{ marginTop: 6 }}>{a.durationSec}s · {a.wordCount} 词</div>
              {a.recordingUrl && <audio controls src={a.recordingUrl} style={{ width: '100%', marginTop: 8 }} />}
            </details>
          ))}
        </div>
      </Card>

      {node}
    </div>
  );
}
