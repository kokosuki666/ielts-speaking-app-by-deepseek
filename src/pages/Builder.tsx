import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../store/useApp';
import { Button, Card, Chip, Empty, Field, Input, Tag } from '../components/ui';
import { Icon } from '../components/Icon';
import { partShort } from '../lib/data';

export default function Builder() {
  const { id } = useParams();
  const papers = useApp((s) => s.papers);
  const questions = useApp((s) => s.questions);
  const createPaper = useApp((s) => s.createPaper);
  const updatePaper = useApp((s) => s.updatePaper);
  const startExam = useApp((s) => s.startExam);
  const notify = useApp((s) => s.notify);
  const navigate = useNavigate();

  const existing = papers.find((p) => p.id === id);
  const [name, setName] = useState(existing?.name ?? `新套卷 · ${new Date().toLocaleDateString('zh-CN')}`);
  const [part1Ids, setPart1Ids] = useState<string[]>(existing?.part1Ids ?? []);
  const [part2Id, setPart2Id] = useState<string | null>(existing?.part2Id ?? null);
  const [part3Ids, setPart3Ids] = useState<string[]>(existing?.part3Ids ?? []);
  const [tab, setTab] = useState<1 | 2 | 3>(1);
  const [search, setSearch] = useState('');

  const pool = useMemo(() => {
    const kw = search.trim().toLowerCase();
    return questions.filter((q) => q.part === tab && (!kw || `${q.question} ${q.topic} ${q.topicZh}`.toLowerCase().includes(kw)));
  }, [questions, tab, search]);

  const total = part1Ids.length + (part2Id ? 1 : 0) + part3Ids.length;

  function save(thenStart = false) {
    const finalName = name.trim() || '未命名套卷';
    if (!total) {
      notify('至少选一道题', 'err');
      return;
    }
    if (existing) {
      updatePaper(existing.id, { name: finalName, part1Ids, part2Id, part3Ids });
      notify('已保存', 'ok');
      if (thenStart) {
        startExam({ ...existing, name: finalName, part1Ids, part2Id, part3Ids });
        navigate('/exam');
      }
    } else {
      const paper = createPaper({ name: finalName, part1Ids, part2Id, part3Ids });
      notify('套卷已创建', 'ok');
      if (thenStart) {
        startExam(paper);
        navigate('/exam');
      } else {
        navigate(`/papers/${paper.id}`, { replace: true });
      }
    }
  }

  const toggle = (qid: string) => {
    if (tab === 1) setPart1Ids((prev) => (prev.includes(qid) ? prev.filter((x) => x !== qid) : [...prev, qid]));
    else if (tab === 3) setPart3Ids((prev) => (prev.includes(qid) ? prev.filter((x) => x !== qid) : [...prev, qid]));
    else setPart2Id((prev) => (prev === qid ? null : qid));
  };

  const isPicked = (qid: string) =>
    tab === 1 ? part1Ids.includes(qid) : tab === 3 ? part3Ids.includes(qid) : part2Id === qid;

  return (
    <div className="page">
      <Card>
        <div className="row" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <Field label="套卷名称">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
          </div>
          <div className="row" style={{ gap: 8, alignSelf: 'flex-end' }}>
            <Button variant="ghost" icon="arrow-left" onClick={() => navigate('/papers')}>返回</Button>
            <Button variant="ghost" onClick={() => save(false)}>保存</Button>
            <Button variant="primary" icon="play" onClick={() => save(true)}>保存并开始</Button>
          </div>
        </div>
        <div className="row" style={{ gap: 8, marginTop: 8 }}>
          <Tag tone="accent">P1 {part1Ids.length}</Tag>
          <Tag>P2 {part2Id ? 1 : 0}</Tag>
          <Tag>P3 {part3Ids.length}</Tag>
          <span className="tiny muted">共 {total} 题</span>
        </div>
      </Card>

      <div className="row" style={{ marginTop: 16, flexWrap: 'wrap' }}>
        <div className="row" style={{ gap: 6 }}>
          {([1, 2, 3] as const).map((p) => (
            <Chip key={p} active={tab === p} onClick={() => setTab(p)}>
              {partShort(p)} · {p === 1 ? '问答' : p === 2 ? '题卡' : '讨论'}
            </Chip>
          ))}
        </div>
        <div className="spacer" />
        <div className="search-wrap">
          <Icon name="search" size={15} />
          <Input placeholder="搜索题目" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <Card style={{ marginTop: 12 }}>
        {pool.length ? (
          <div className="list">
            {pool.slice(0, 200).map((q) => (
              <button key={q.id} className={`list-item list-item--btn ${isPicked(q.id) ? 'selected' : ''}`} onClick={() => toggle(q.id)}>
                <span className={`check ${isPicked(q.id) ? 'on' : ''}`}>{isPicked(q.id) && <Icon name="check" size={12} />}</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="small">{q.question}</div>
                  {q.questionZh && <div className="tiny muted">{q.questionZh}</div>}
                  {q.part === 2 && q.bullets?.length ? <div className="tiny dim" style={{ marginTop: 3 }}>{q.bullets.join(' · ')}</div> : null}
                </div>
                <Tag>{q.topicZh || q.topic}</Tag>
              </button>
            ))}
          </div>
        ) : (
          <Empty icon="library" title="这个 Part 还没有题目" desc="去题库导入或添加题目后再来。" />
        )}
      </Card>
    </div>
  );
}
