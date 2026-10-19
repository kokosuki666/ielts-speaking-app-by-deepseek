import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../store/useApp';
import { Button, Card, Tag } from '../components/ui';
import { Icon } from '../components/Icon';
import { bandTone, fmtBand } from '../lib/band';
import { relTime } from '../lib/format';
import { isDue } from '../lib/srs';

export default function Home() {
  const questions = useApp((s) => s.questions);
  const papers = useApp((s) => s.papers);
  const reports = useApp((s) => s.reports);
  const vocab = useApp((s) => s.vocab);
  const progress = useApp((s) => s.progress);
  const settings = useApp((s) => s.settings);
  const examRun = useApp((s) => s.examRun);
  const navigate = useNavigate();

  const latest = reports[0];
  const answered = useMemo(
    () => reports.reduce((n, r) => n + r.answers.filter((a) => a.transcript?.trim()).length, 0),
    [reports],
  );
  const dueCount = useMemo(() => vocab.filter((v) => isDue(progress[v.id])).length, [vocab, progress]);

  const streak = useMemo(() => {
    const days = new Set(reports.map((r) => new Date(r.createdAt).toDateString()));
    let count = 0;
    const cursor = new Date();
    while (days.has(cursor.toDateString())) {
      count += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return count;
  }, [reports]);

  const heat = useMemo(() => {
    const days = new Map<string, number>();
    reports.forEach((r) => {
      const key = new Date(r.createdAt).toDateString();
      days.set(key, (days.get(key) ?? 0) + 1);
    });
    return Array.from({ length: 12 }, (_, w) =>
      Array.from({ length: 7 }, (_, d) => {
        const date = new Date();
        date.setDate(date.getDate() - (83 - (w * 7 + (6 - d))));
        return { key: date.toDateString(), count: days.get(date.toDateString()) ?? 0 };
      }),
    );
  }, [reports]);

  return (
    <div className="page">
      <section className="hero fade-up" style={{ ['--i' as string]: 0 }}>
        <div className="hero-grid">
          <div>
            <div className="eyebrow">IELTS SPEAKING STUDIO</div>
            <h1 className="display" style={{ marginTop: 10 }}>
              把每一次开口，
              <br />
              都练成 <span className="gradient-text">目标分</span>。
            </h1>
            <p className="lead" style={{ marginTop: 14 }}>
              本地题库 → 自由组卷 → 限时模考 → AI 考官按官方四项标准打分。
              再把薄弱点变成可背诵的话题词，形成完整的口语训练闭环。
            </p>
            <div className="hero-actions">
              <Button
                variant="primary"
                size="lg"
                icon="mic"
                onClick={() => (examRun && !examRun.finished ? navigate('/exam') : navigate('/papers'))}
              >
                {examRun && !examRun.finished ? '继续模拟考试' : '开始模拟考试'}
              </Button>
              <Button size="lg" icon="chat" onClick={() => navigate('/chat')}>和 AI 聊聊</Button>
              <Button variant="ghost" size="lg" icon="upload" onClick={() => navigate('/library')}>导入题库</Button>
            </div>
          </div>

          <Card className="card--tint">
            <div className="ring" style={{ width: 148, height: 148 }}>
              <svg viewBox="0 0 148 148" width={148} height={148}>
                <circle cx={74} cy={74} r={66} fill="none" stroke="var(--line)" strokeWidth={9} />
                <circle
                  cx={74}
                  cy={74}
                  r={66}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth={9}
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 66}
                  strokeDashoffset={2 * Math.PI * 66 * (1 - Math.min(1, (latest?.overall ?? 0) / 9))}
                  transform="rotate(-90 74 74)"
                />
              </svg>
              <div className="ring-val" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span style={{ fontSize: 30, fontWeight: 650 }}>{latest ? fmtBand(latest.overall) : '—'}</span>
                <span className="tiny dim">LATEST</span>
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="tiny muted">目标 {fmtBand(settings.targetBand)}</div>
              <div className="small" style={{ fontWeight: 650, marginTop: 2 }}>
                {latest ? `${latest.paperName}` : '还没有模考记录'}
              </div>
              <div className="tiny dim" style={{ marginTop: 4 }}>
                {latest ? `${relTime(latest.createdAt)} · ${latest.engine === 'ai' ? 'AI 评分' : '离线估算'}` : '从一套完整模考开始建立基线'}
              </div>
              <div className="bar" style={{ marginTop: 10 }}>
                <i style={{ width: `${Math.min(100, ((latest?.overall ?? 0) / Math.max(1, settings.targetBand)) * 100)}%` }} />
              </div>
            </div>
          </Card>
        </div>
      </section>

      <section className="grid g4 fade-up" style={{ ['--i' as string]: 1 }}>
        <div className="stat">
          <span className="stat-label">题库题目</span>
          <span className="stat-value">{questions.length}</span>
          <span className="stat-delta muted">覆盖 {new Set(questions.map((q) => q.topic)).size} 个话题</span>
        </div>
        <div className="stat">
          <span className="stat-label">已练题目</span>
          <span className="stat-value">{answered}</span>
          <span className="stat-delta muted">来自 {reports.length} 次模考</span>
        </div>
        <div className="stat">
          <span className="stat-label">待复习词卡</span>
          <span className="stat-value">{dueCount}</span>
          <span className="stat-delta muted">共 {vocab.length} 张</span>
        </div>
        <div className="stat">
          <span className="stat-label">连续练习</span>
          <span className="stat-value">
            {streak}
            <span className="small muted"> 天</span>
          </span>
          <span className="stat-delta muted">今天 {reports.some((r) => new Date(r.createdAt).toDateString() === new Date().toDateString()) ? '已练' : '未练'}</span>
        </div>
      </section>

      <section className="split fade-up" style={{ ['--i' as string]: 2 }}>
        <div className="stack">
          <div className="row">
            <div>
              <div className="card-title">继续练习</div>
              <p className="card-desc">三条路径，覆盖从输入到输出的完整链路</p>
            </div>
            <div className="spacer" />
            <Link to="/papers" className="small muted">管理套卷 →</Link>
          </div>
          <div className="grid g3">
            <button className="card card--hover" onClick={() => navigate('/papers')}>
              <div className="row">
                <span className="avatar avatar--violet"><Icon name="layers" size={18} /></span>
                <div className="spacer" />
                <span className="tag">{papers.length} 套</span>
              </div>
              <div className="card-title" style={{ marginTop: 10, fontSize: 15 }}>组一套卷</div>
              <div className="tiny muted" style={{ marginTop: 4 }}>
                按 Part / 话题筛选题目，一键生成 12–14 分钟的完整模考。
              </div>
            </button>
            <button className="card card--hover" onClick={() => navigate('/chat')}>
              <div className="row">
                <span className="avatar avatar--teal"><Icon name="chat" size={18} /></span>
                <div className="spacer" />
                <span className="tag">随时</span>
              </div>
              <div className="card-title" style={{ marginTop: 10, fontSize: 15 }}>日常对话</div>
              <div className="tiny muted" style={{ marginTop: 4 }}>
                和 AI 随意聊天，结束后自动提炼话题词与更地道的说法。
              </div>
            </button>
            <button className="card card--hover" onClick={() => navigate('/vocab')}>
              <div className="row">
                <span className="avatar avatar--warn"><Icon name="vocab" size={18} /></span>
                <div className="spacer" />
                <span className="tag tag--warn">{dueCount} 张待复习</span>
              </div>
              <div className="card-title" style={{ marginTop: 10, fontSize: 15 }}>话题背诵</div>
              <div className="tiny muted" style={{ marginTop: 4 }}>
                来自题库话题的精准词块 + 间隔重复，让高分表达真正说出口。
              </div>
            </button>
          </div>
        </div>

        <div className="stack">
          <div className="row">
            <div>
              <div className="card-title">最近成绩</div>
              <p className="card-desc">按四项均值的官方规则计算</p>
            </div>
            <div className="spacer" />
            <Link to="/reports" className="small muted">全部 →</Link>
          </div>

          <Card>
            {latest ? (
              <div className="stack-sm">
                {reports.slice(0, 3).map((r) => (
                  <Link key={r.id} to={`/reports/${r.id}`} className="list-item list-item--btn">
                    <div style={{ minWidth: 0 }}>
                      <div className="small" style={{ fontWeight: 600 }}>{r.paperName}</div>
                      <div className="tiny muted">{relTime(r.createdAt)}</div>
                    </div>
                    <div className="spacer" />
                    <span className={`band-pill band--${bandTone(r.overall)}`}>{fmtBand(r.overall)}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="empty">
                <div className="empty-icon"><Icon name="chart" size={22} /></div>
                <div>还没有成绩记录</div>
                <div className="small muted" style={{ marginTop: 6 }}>
                  完成一次模考，AI 考官会给出四项分数与提分路径。
                </div>
              </div>
            )}
          </Card>

          <Card className="card--tint">
            <div className="row">
              <span className="avatar"><Icon name="vocab" size={18} /></span>
              <div style={{ minWidth: 0 }}>
                <div className="small" style={{ fontWeight: 650 }}>{dueCount} 张词卡到期</div>
                <div className="tiny muted">每天 5 分钟，把被动词汇变成主动表达。</div>
              </div>
            </div>
            <Button variant="primary" block icon="play" style={{ marginTop: 10 }} onClick={() => navigate('/vocab')}>
              开始复习
            </Button>
          </Card>
        </div>
      </section>

      <section className="split fade-up" style={{ ['--i' as string]: 3 }}>
        <div className="card">
          <div className="row">
            <div>
              <div className="card-title">练习热力图</div>
              <p className="card-desc">最近 12 周，每个格子是一天</p>
            </div>
            <div className="spacer" />
            <Tag tone="ok">{reports.length} 次练习</Tag>
          </div>
          <div className="heat-weeks" style={{ marginTop: 12 }}>
            {heat.map((week, wi) => (
              <div key={wi} className="heat-col">
                {week.map((d) => (
                  <i key={d.key} className="heat-swatch" data-lvl={d.count ? Math.min(3, d.count) : 0} title={`${d.key} · ${d.count} 次`} />
                ))}
              </div>
            ))}
          </div>
          <div className="row" style={{ marginTop: 10, gap: 6 }}>
            <span className="tiny dim">少</span>
            <i className="heat-swatch" data-lvl={0} />
            <i className="heat-swatch" data-lvl={1} />
            <i className="heat-swatch" data-lvl={2} />
            <i className="heat-swatch" data-lvl={3} />
            <span className="tiny dim">多</span>
            <div className="spacer" />
            <span className="tiny dim">目标 {fmtBand(settings.targetBand)}</span>
          </div>
        </div>

        <div className="card">
          <div className="row">
            <div>
              <div className="card-title">下一步建议</div>
              <p className="card-desc">基于当前数据自动给出</p>
            </div>
          </div>
          <div className="stack-sm" style={{ marginTop: 10 }}>
            <div className="small muted">
              {!reports.length
                ? '还没有基准分：先做一套完整模考，再决定练什么。'
                : dueCount > 8
                  ? `有 ${dueCount} 张词卡到期，先复习 10 分钟再练新题。`
                  : '状态不错：用一套 Part 2 + Part 3 的高难度套卷冲一下稳定性。'}
            </div>
            <Button size="sm" variant="ghost" icon="arrow-right" onClick={() => navigate(dueCount > 8 ? '/vocab' : '/papers')}>
              开始
            </Button>
          </div>
        </div>
      </section>

      <section className="fade-up" style={{ ['--i' as string]: 4 }}>
        <div className="card card--flat">
          <Icon name="info" size={16} />
          <span className="small muted">所有数据保存在本机浏览器；评分结果仅供练习参考。</span>
          <div className="spacer" />
          <Link to="/settings" className="btn btn--sm">设置</Link>
        </div>
      </section>
    </div>
  );
}
