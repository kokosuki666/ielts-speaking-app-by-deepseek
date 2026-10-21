import type { Appearance } from '../types';

export type { Appearance };
export type ThemeId =
  | 'liquid' | 'aurora' | 'sunset' | 'coast' | 'forest'
  | 'sakura' | 'violet' | 'midnight' | 'paper' | 'minimal';

export interface ThemeDef {
  id: ThemeId;
  name: string;
  dark: boolean;
  accent: string;
  accent2: string;
  background: string;
  swatch: string;
}

export const THEMES: ThemeDef[] = [
  {
    id: 'liquid',
    name: '液态玻璃',
    dark: false,
    accent: '#2563eb',
    accent2: '#7c3aed',
    background:
      'radial-gradient(1000px 700px at 8% -10%, #bcd4ff 0%, transparent 58%), radial-gradient(900px 650px at 95% 0%, #d9c9ff 0%, transparent 55%), radial-gradient(700px 500px at 50% 112%, #bfe7ff 0%, transparent 60%), linear-gradient(180deg, #f2f6ff 0%, #e7ecf9 100%)',
    swatch: 'linear-gradient(135deg,#dbeafe,#ede9fe 80%)',
  },
  {
    id: 'aurora',
    name: '极光',
    dark: true,
    accent: '#38bdf8',
    accent2: '#a78bfa',
    background:
      'radial-gradient(900px 600px at 12% 0%, rgba(45,212,191,.38) 0%, transparent 55%), radial-gradient(820px 560px at 90% 6%, rgba(139,92,246,.42) 0%, transparent 55%), linear-gradient(180deg, #060c18 0%, #0b1426 100%)',
    swatch: 'linear-gradient(135deg,#0b1220,#1e3a5f 70%,#7c3aed)',
  },
  {
    id: 'sunset',
    name: '日落',
    dark: false,
    accent: '#f97316',
    accent2: '#ec4899',
    background:
      'radial-gradient(920px 620px at 4% -2%, #ffc9a8 0%, transparent 55%), radial-gradient(900px 640px at 96% 2%, #ffc2e2 0%, transparent 52%), linear-gradient(180deg, #fff2e6 0%, #ffe8f2 100%)',
    swatch: 'linear-gradient(135deg,#ffe4d6,#fde2f3)',
  },
  {
    id: 'coast',
    name: '海岸',
    dark: false,
    accent: '#0891b2',
    accent2: '#22d3ee',
    background:
      'radial-gradient(920px 620px at 6% -2%, #a9edf1 0%, transparent 55%), radial-gradient(900px 640px at 94% 2%, #b9ddff 0%, transparent 52%), linear-gradient(180deg, #ecfcff 0%, #e2f2fb 100%)',
    swatch: 'linear-gradient(135deg,#d6f5f7,#e0f2fe)',
  },
  {
    id: 'forest',
    name: '森林',
    dark: false,
    accent: '#16a34a',
    accent2: '#65a30d',
    background:
      'radial-gradient(920px 620px at 6% -2%, #b3efc6 0%, transparent 55%), radial-gradient(900px 640px at 94% 2%, #d7f3a8 0%, transparent 52%), linear-gradient(180deg, #eefdf2 0%, #e5f4e8 100%)',
    swatch: 'linear-gradient(135deg,#dcfce7,#ecfccb)',
  },
  {
    id: 'sakura',
    name: '樱花',
    dark: false,
    accent: '#db2777',
    accent2: '#a855f7',
    background:
      'radial-gradient(920px 620px at 6% -2%, #ffc2dc 0%, transparent 55%), radial-gradient(900px 640px at 94% 2%, #f2c4ff 0%, transparent 52%), linear-gradient(180deg, #fff0f7 0%, #fde6f4 100%)',
    swatch: 'linear-gradient(135deg,#fce7f3,#fae8ff)',
  },
  {
    id: 'violet',
    name: '紫霞',
    dark: false,
    accent: '#7c3aed',
    accent2: '#c026d3',
    background:
      'radial-gradient(920px 620px at 6% -2%, #cbb8ff 0%, transparent 55%), radial-gradient(900px 640px at 94% 2%, #eeb6ff 0%, transparent 52%), linear-gradient(180deg, #f6f0ff 0%, #ede3ff 100%)',
    swatch: 'linear-gradient(135deg,#ede9fe,#fae8ff)',
  },
  {
    id: 'midnight',
    name: '午夜',
    dark: true,
    accent: '#94a3b8',
    accent2: '#64748b',
    background:
      'radial-gradient(900px 620px at 16% 0%, rgba(96,165,250,.26) 0%, transparent 58%), radial-gradient(700px 520px at 92% 18%, rgba(148,163,184,.14) 0%, transparent 60%), linear-gradient(180deg, #05070c 0%, #0e131d 100%)',
    swatch: 'linear-gradient(135deg,#0b0e14,#1a1f2b)',
  },
  {
    id: 'paper',
    name: '纸张',
    dark: false,
    accent: '#a16207',
    accent2: '#b45309',
    background:
      'radial-gradient(900px 620px at 8% 0%, #f7e3b0 0%, transparent 58%), radial-gradient(760px 520px at 94% 0%, #f2d9a6 0%, transparent 55%), repeating-linear-gradient(0deg, rgba(120,90,40,.04) 0 1px, transparent 1px 4px), linear-gradient(180deg, #fdf8ea 0%, #f4ead6 100%)',
    swatch: 'linear-gradient(135deg,#fdf6e3,#f7f1e3)',
  },
  {
    id: 'minimal',
    name: '极简',
    dark: false,
    accent: '#334155',
    accent2: '#64748b',
    background: 'radial-gradient(900px 620px at 8% 0%, #e3e7ee 0%, transparent 55%), radial-gradient(760px 520px at 92% 2%, #eef1f5 0%, transparent 55%), linear-gradient(180deg, #f7f8fa 0%, #e9edf2 100%)',
    swatch: 'linear-gradient(135deg,#f5f6f8,#eef0f3)',
  },
];

export const ACCENTS = ['#2563eb', '#0ea5e9', '#14b8a6', '#22c55e', '#84cc16', '#f59e0b', '#f97316', '#ef4444', '#ec4899', '#a855f7'];

export const DEFAULT_APPEARANCE: Appearance = {
  themeId: 'liquid',
  accent: '#2563eb',
  alpha: 58,
  blur: 26,
  saturate: 170,
  border: 100,
  radius: 22,
  glassButtons: false,
  grain: false,
  motion: true,
  bgImage: '',
};

export function themeById(id: ThemeId): ThemeDef {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Writes the appearance settings into CSS custom properties on <html>. */
export function applyAppearance(a: Appearance, mode: 'light' | 'dark'): void {
  const theme = themeById(a.themeId);
  const dark = theme.dark || mode === 'dark';
  const root = document.documentElement;
  const alpha = Math.min(0.96, Math.max(0.12, a.alpha / 100));
  const glassBase = dark ? '#121722' : '#ffffff';

  root.dataset.theme = dark ? 'dark' : 'light';
  if (a.bgImage) {
    root.style.setProperty('--bg-image', `url("${a.bgImage}")`);
    root.style.setProperty('--bg-size', 'cover');
    root.style.setProperty('--bg-wash', dark ? 'rgba(6, 9, 15, 0.62)' : 'rgba(248, 250, 255, 0.44)');
  } else {
    root.style.setProperty('--bg-image', theme.background);
    root.style.setProperty('--bg-size', 'auto');
    root.style.setProperty('--bg-wash', 'transparent');
  }
  root.style.setProperty('--bg-base', dark ? '#0b0f17' : '#eef1f7');
  root.style.setProperty('--glass', rgba(glassBase, alpha));
  root.style.setProperty('--glass-strong', rgba(glassBase, Math.min(0.97, alpha + 0.2)));
  root.style.setProperty('--glass-soft', rgba(glassBase, Math.max(0.08, alpha - 0.22)));
  root.style.setProperty('--glass-btn', rgba(glassBase, Math.min(0.95, alpha + 0.06)));
  root.style.setProperty('--glass-blur', `${a.blur}px`);
  root.style.setProperty('--glass-sat', `${a.saturate}%`);
  root.style.setProperty('--stroke', dark ? `rgba(255,255,255,${Math.min(0.4, (a.border / 100) * 0.22)})` : `rgba(255,255,255,${Math.min(0.95, a.border / 100)})`);
  root.style.setProperty('--r-md', `${Math.round(a.radius * 0.72)}px`);
  root.style.setProperty('--r-lg', `${a.radius}px`);
  root.style.setProperty('--r-xl', `${Math.round(a.radius * 1.36)}px`);
  root.style.setProperty('--accent', theme.accent);
  root.style.setProperty('--accent-ink', theme.accent);
  root.style.setProperty('--accent-2', theme.accent2);
  root.style.setProperty('--accent-soft', rgba(theme.accent, dark ? 0.18 : 0.1));
  root.style.setProperty('--border-hi', `${a.border}%`);
  root.dataset.motion = a.motion ? 'on' : 'off';
  // CSS uses [data-glass=on]; keep the old name too for compatibility.
  root.dataset.glass = a.glassButtons ? 'on' : 'off';
  root.dataset.bgImage = a.bgImage ? 'on' : 'off';
  root.dataset.glassButtons = a.glassButtons ? 'on' : 'off';
  root.dataset.grain = a.grain ? 'on' : 'off';
}

/** Accent override: the picker can beat the theme's default accent. */
export function applyAccent(accent: string): void {
  const root = document.documentElement;
  root.style.setProperty('--accent', accent);
  root.style.setProperty('--accent-ink', accent);
  root.style.setProperty('--accent-soft', rgba(accent, 0.12));
}
