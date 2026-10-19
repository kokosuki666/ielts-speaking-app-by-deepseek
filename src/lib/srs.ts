/** Lightweight Leitner-style scheduler for vocabulary cards. */

const DAY = 24 * 60 * 60 * 1000;
const INTERVALS = [0, 1, 2, 4, 7, 15, 30]; // days per box

export function schedule(box: number, dueAt: number, quality: 'again' | 'hard' | 'good'): { box: number; dueAt: number } {
  const now = Date.now();
  if (quality === 'again') {
    return { box: 0, dueAt: now + 10 * 60 * 1000 };
  }
  const next = quality === 'good' ? Math.min(box + 1, INTERVALS.length - 1) : Math.max(1, box);
  const days = INTERVALS[next] ?? 1;
  const jitter = 0.9 + Math.random() * 0.2;
  return { box: next, dueAt: now + Math.max(days, quality === 'hard' ? 1 : 0) * DAY * jitter };
}

export function isDue(progress: { dueAt: number } | undefined): boolean {
  return !progress || progress.dueAt <= Date.now();
}

export function nextDueLabel(dueAt: number): string {
  const diff = dueAt - Date.now();
  if (diff <= 0) return '现在复习';
  const h = Math.round(diff / 3600000);
  if (h < 24) return `${h} 小时后`;
  return `${Math.round(h / 24)} 天后`;
}
