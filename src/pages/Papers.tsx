import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../store/useApp';
import { Button, Card, Field, Input, Modal, Seg, Tag, Empty, useConfirm } from '../components/ui';
import { Icon } from '../components/Icon';
import { fmtDate, fmtMinutes, pick, relTime } from '../lib/format';
import type { Paper } from '../types';

export default function Papers() {
  const papers = useApp((s) => s.papers);
  const questions = useApp((s) => s.questions);
  const createPaper = useApp((s) => s.createPaper);
  const deletePaper = useApp((s) => s.deletePaper);
  const startExam = useApp((s) => s.startExam);
  const notify = useApp((s) => s.notify);
  const navigate = useNavigate();
  const { confirm, node } = useConfirm();
  const [genOpen, setGenOpen] = useState(false);

  const estimated = (paper: Paper) =>
    (paper.part1Ids.length ? 3 * 60 : 0) +
    (paper.part2Id ? 60 + 120 : 0) +
    paper.part3Ids.length * 90;

  return (
    <div className="page">
      <Card className="fade-up">
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <div style={{ minWidth: 220 }}>
            <div className="card-title">套卷</div>
            <p className="card-desc">一套完整的 Part 1 + Part 2 + Part 3。可以手选题目，也可以随机生成。</p>
          </div>
          <div className="spacer" />
          <div className="btn-group">
            <Button icon="shuffle" onClick={() => setGenOpen(true)}>随机生成</Button>
            <Button variant="primary" icon="plus" onClick={() => navigate('/papers/new')}>手动组卷</Button>
          </div>
        </div>
      </Card>

      {papers.length ? (
        <div className="grid g2" style={{ marginTop: 16 }}>
          {papers.map((paper) => {
            const p2 = questions.find((q) => q.id === paper.part2Id);
            return (
              <Card key={paper.id} className="card--hover">
                <div className="row">
                  <div style={{ minWidth: 0 }}>
                    <div className="card-title" style={{ fontSize: 16 }}>{paper.name}</div>
                    <div className="tiny muted" style={{ marginTop: 2 }}>
                      {fmtDate(paper.updatedAt)} 更新 · 预计 {fmtMinutes(estimated(paper))}
                    </div>
                  </div>
                  <div className="spacer" />
                  <Tag tone="accent">P1 {paper.part1Ids.length}</Tag>
                  <Tag>P2 {p2 ? 1 : 0}</Tag>
                  <Tag>P3 {paper.part3Ids.length}</Tag>
                </div>

                {p2 && <div className="small muted" style={{ marginTop: 10 }}>题卡：{p2.question}</div>}

                <div className="row" style={{ marginTop: 14, gap: 8 }}>
                  <Button
                    size="sm"
                    variant="primary"
                    icon="play"
                    onClick={() => {
                      if (!paper.part1Ids.length && !paper.part2Id && !paper.part3Ids.length) {
                        notify('这套卷还没有题目', 'err');
                        return;
                      }
                      startExam(paper);
                      navigate('/exam');
                    }}
                  >
                    开始
                  </Button>
                  <Button size="sm" variant="ghost" icon="edit" onClick={() => navigate(`/papers/${paper.id}`)}>编辑</Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon="copy"
                    onClick={() => {
                      const copy = createPaper({
                        name: `${paper.name}（副本）`,
                        part1Ids: [...paper.part1Ids],
                        part2Id: paper.part2Id,
                        part3Ids: [...paper.part3Ids],
                        note: paper.note,
                      });
                      notify(`已复制为「${copy.name}」`, 'ok');
                    }}
                  >
                    复制
                  </Button>
                  <div className="spacer" />
                  <button
                    className="btn btn--ghost btn--icon"
                    aria-label="删除"
                    onClick={() => {
                      void confirm(`删除「${paper.name}」？`).then((ok) => {
                        if (ok) {
                          deletePaper(paper.id);
                          notify('已删除', 'ok');
                        }
                      });
                    }}
                  >
                    <Icon name="trash" size={15} />
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card style={{ marginTop: 16 }}>
          <Empty
            icon="papers"
            title="还没有套卷"
            desc="用内置题库随机生成一套，或从题库里手动勾选。"
            action={<Button variant="primary" icon="shuffle" onClick={() => setGenOpen(true)}>随机生成一套</Button>}
          />
        </Card>
      )}

      <RandomModal open={genOpen} onClose={() => setGenOpen(false)} onCreated={(id) => navigate(`/papers/${id}`)} />
      {node}
    </div>
  );
}

function RandomModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const questions = useApp((s) => s.questions);
  const createPaper = useApp((s) => s.createPaper);
  const notify = useApp((s) => s.notify);
  const [name, setName] = useState('');
  const [p1, setP1] = useState(4);
  const [p3, setP3] = useState(4);
  const [scope, setScope] = useState<'all' | 'topic'>('all');
  const [topic, setTopic] = useState('');
  const [withP2, setWithP2] = useState(true);

  const topics = useMemo(() => [...new Set(questions.map((q) => q.topic))], [questions]);

  function generate() {
    const pool = scope === 'topic' && topic ? questions.filter((q) => q.topic === topic) : questions;
    const p1Pool = pool.filter((q) => q.part === 1);
    const p2Pool = pool.filter((q) => q.part === 2);
    const p3Pool = pool.filter((q) => q.part === 3);
    const part1 = pick(p1Pool, Math.min(p1, p1Pool.length)).map((q) => q.id);
    const part3 = pick(p3Pool, Math.min(p3, p3Pool.length)).map((q) => q.id);
    const part2 = withP2 ? pick(p2Pool, 1)[0]?.id ?? null : null;
    if (!part1.length && !part2 && !part3.length) {
      notify('这个范围里没有足够的题目', 'err');
      return;
    }
    const paper = createPaper({
      name: name.trim() || `随机套卷 · ${new Date().toLocaleDateString('zh-CN')}`,
      part1Ids: part1,
      part2Id: part2,
      part3Ids: part3,
    });
    notify(`已生成 ${part1.length + (part2 ? 1 : 0) + part3.length} 题的套卷`, 'ok');
    onClose();
    onCreated(paper.id);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="随机生成套卷"
      subtitle="从题库里按范围抽取，抽完还能继续编辑"
      footer={
        <>
          <div className="spacer" />
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button variant="primary" icon="shuffle" onClick={generate}>生成</Button>
        </>
      }
    >
      <div className="stack">
        <Field label="套卷名称" hint="留空会自动按日期命名">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：周末冲刺 · 人物类" />
        </Field>
        <div className="grid g2">
          <Field label={`Part 1 题量：${p1}`}>
            <input className="range" type="range" min={0} max={8} value={p1} onChange={(e) => setP1(Number(e.target.value))} />
          </Field>
          <Field label={`Part 3 题量：${p3}`}>
            <input className="range" type="range" min={0} max={8} value={p3} onChange={(e) => setP3(Number(e.target.value))} />
          </Field>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Seg
            value={scope}
            onChange={(v) => setScope(v as 'all' | 'topic')}
            options={[{ value: 'all', label: '全部话题' }, { value: 'topic', label: '指定话题' }]}
          />
          {scope === 'topic' && (
            <select className="select" value={topic} onChange={(e) => setTopic(e.target.value)}>
              <option value="">选择话题</option>
              {topics.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
          <div className="spacer" />
          <label className="row small" style={{ gap: 6 }}>
            <input type="checkbox" checked={withP2} onChange={(e) => setWithP2(e.target.checked)} />
            含 Part 2 题卡
          </label>
        </div>
        <div className="hint">Part 2 会从同一范围里随机抽一张；如果范围里没有 cue card，会自动跳过。</div>
      </div>
    </Modal>
  );
}
