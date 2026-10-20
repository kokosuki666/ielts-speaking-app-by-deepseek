import { lazy, Suspense, useEffect, useState } from 'react';
import { HashRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { useApp, ensureSeeded } from './store/useApp';
import { configureTts, TTS_ERROR_EVENT, TTS_FALLBACK_EVENT } from './lib/speech';
import { applyAccent, applyAppearance } from './lib/appearance';
import { Icon, type IconName } from './components/Icon';

// Route-level code splitting keeps the first paint small; each page loads on demand.
const Home = lazy(() => import('./pages/Home'));
const Library = lazy(() => import('./pages/Library'));
const Papers = lazy(() => import('./pages/Papers'));
const Builder = lazy(() => import('./pages/Builder'));
const Exam = lazy(() => import('./pages/Exam'));
const Reports = lazy(() => import('./pages/Reports'));
const Chat = lazy(() => import('./pages/Chat'));
const Vocab = lazy(() => import('./pages/Vocab'));
const Settings = lazy(() => import('./pages/Settings'));

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  count?: 'questions' | 'vocab';
  end?: boolean;
}

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Learn',
    items: [
      { to: '/', label: '首页', icon: 'home', end: true },
      { to: '/library', label: '题库', icon: 'library', count: 'questions' },
      { to: '/papers', label: '套卷', icon: 'papers' },
    ],
  },
  {
    label: 'Practise',
    items: [
      { to: '/exam', label: '模拟考试', icon: 'mic' },
      { to: '/chat', label: 'AI 对话', icon: 'chat' },
      { to: '/vocab', label: '背诵', icon: 'vocab', count: 'vocab' },
    ],
  },
  {
    label: 'Review',
    items: [
      { to: '/reports', label: '成绩报告', icon: 'chart' },
      { to: '/settings', label: '设置', icon: 'settings' },
    ],
  },
];

const PAGE_META: { match: (path: string) => boolean; title: string; sub: string }[] = [
  { match: (p) => p === '/', title: '首页', sub: '今天想练点什么？' },
  { match: (p) => p.startsWith('/library'), title: '题库', sub: '本地导入 · 筛选 · 组卷素材' },
  { match: (p) => p === '/papers', title: '套卷', sub: '按考试节奏组装完整模考' },
  { match: (p) => p.startsWith('/papers/'), title: '组卷', sub: '挑选题目，生成一套完整模考' },
  { match: (p) => p === '/exam', title: '模拟考试', sub: 'Part 1 → Part 2 → Part 3' },
  { match: (p) => p.startsWith('/reports') || p.startsWith('/report'), title: '成绩报告', sub: '按雅思官方四项标准评分' },
  { match: (p) => p.startsWith('/chat'), title: 'AI 对话', sub: '像和真人聊天一样练口语' },
  { match: (p) => p.startsWith('/vocab'), title: '背诵', sub: '话题词 · 间隔重复 · 口语化例句' },
  { match: (p) => p.startsWith('/settings'), title: '设置', sub: '外观 · AI 模型 · 目标分 · 语音' },
];

function Shell() {
  const settings = useApp((s) => s.settings);
  const patchSettings = useApp((s) => s.patchSettings);
  const toast = useApp((s) => s.toast);
  const notify = useApp((s) => s.notify);
  const examRun = useApp((s) => s.examRun);
  const reports = useApp((s) => s.reports);
  const questions = useApp((s) => s.questions);
  const vocab = useApp((s) => s.vocab);
  const location = useLocation();
  const [online, setOnline] = useState(true);
  const [ttsBroken, setTtsBroken] = useState(false);

  useEffect(() => {
    ensureSeeded();
  }, []);

  useEffect(() => {
    applyAppearance(settings.appearance, settings.theme);
    applyAccent(settings.appearance.accent);
  }, [settings.appearance, settings.theme]);

  useEffect(() => {
    configureTts(settings.speech);
  }, [settings.speech]);

  useEffect(() => {
    const onError = (event: Event) => {
      setTtsBroken(true);
      notify((event as CustomEvent<string>).detail, 'err');
    };
    const onFallback = (event: Event) => notify((event as CustomEvent<string>).detail, 'info');
    window.addEventListener(TTS_ERROR_EVENT, onError);
    window.addEventListener(TTS_FALLBACK_EVENT, onFallback);
    return () => {
      window.removeEventListener(TTS_ERROR_EVENT, onError);
      window.removeEventListener(TTS_FALLBACK_EVENT, onFallback);
    };
  }, [notify]);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const res = await fetch('/api/health', { signal: AbortSignal.timeout(4000) });
        const data = await res.json();
        if (alive) setOnline(Boolean(data?.ok));
      } catch {
        if (alive) setOnline(false);
      }
    };
    void check();
    const timer = window.setInterval(check, 15000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  const scroller = document.querySelector('.scroll');
  useEffect(() => {
    scroller?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  const meta = PAGE_META.find((m) => m.match(location.pathname)) ?? PAGE_META[0];
  const todayPracticed = reports.some((r) => new Date(r.createdAt).toDateString() === new Date().toDateString());

  const counts = { questions: questions.length, vocab: vocab.length };
  const isDesktop = typeof window !== 'undefined' && Boolean(window.desktop?.window);

  return (
    <div className={isDesktop ? 'desktop-root' : undefined}>
      {isDesktop && <DesktopTitlebar />}
      <div className="shell">
      <aside className="sidebar no-print">
        <div className="side-card">
          <NavLink to="/" className="brand">
            <span className="brand-mark">IS</span>
            <span className="brand-text">
              <span className="brand-title">Speaking Studio</span>
              <span className="brand-sub">IELTS · 口语</span>
            </span>
          </NavLink>

          <nav className="nav" aria-label="主导航">
            {NAV_GROUPS.map((group) => (
              <div key={group.label} style={{ display: 'contents' }}>
                <div className="nav-label">{group.label}</div>
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                  >
                    <Icon name={item.icon} size={18} />
                    <span>{item.label}</span>
                    {item.count && <span className="count">{counts[item.count]}</span>}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>

          <div className="nav-foot">
            <div className="target-card">
              <div className="tc-label">Target Band</div>
              <div className="row" style={{ alignItems: 'baseline', gap: 8 }}>
                <span className="tc-value">{settings.targetBand.toFixed(1)}</span>
              </div>
              <div className="tc-meta" style={{ marginTop: 4 }}>
                {todayPracticed ? '今天已经练过了' : '今天还没开始练习'}
              </div>
            </div>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar no-print">
          <div>
            <h1 className="topbar-title">{meta.title}</h1>
            <p className="topbar-sub">{meta.sub}</p>
          </div>
          <div className="topbar-actions">
            {examRun && !examRun.finished && (
              <NavLink to="/exam" className="btn btn--primary btn--sm">
                <Icon name="play" size={14} />
                继续模考
              </NavLink>
            )}
            <span className={`status-dot ${online ? 'online' : 'offline'}`} title={online ? '本地服务已连接' : '本地服务未连接'} />
            <button type="button" className="band-pill" title="设置目标分数" onClick={() => (window.location.hash = '#/settings')}>
              <Icon name="target" size={14} />
              <span className="tiny muted">目标</span>
              <span className="band band--great" style={{ fontSize: 13 }}>{settings.targetBand.toFixed(1)}</span>
            </button>
            <button
              className="btn btn--ghost btn--icon"
              aria-label="切换深浅色"
              title="切换深浅色"
              onClick={() => patchSettings({ theme: settings.appearance.themeId === 'aurora' || settings.appearance.themeId === 'midnight' ? 'light' : settings.theme === 'dark' ? 'light' : 'dark' })}
            >
              <Icon name={settings.theme === 'dark' ? 'eye' : 'eye-off'} size={18} />
            </button>
          </div>
        </header>

        <div className="scroll">
          {!online && (
            <div className="offline-bar">
              本地服务未连接：文档解析、AI 评分与语音朗读暂不可用。请确认 `npm run dev` 或桌面版仍在运行。
            </div>
          )}

          {ttsBroken && (
            <div className="offline-bar" style={{ background: 'var(--warn-soft)' }}>
              语音引擎异常，已切换到系统语音。可在「设置 → 语音」里检查引擎。
              <button className="btn btn--ghost btn--sm" onClick={() => setTtsBroken(false)}>知道了</button>
            </div>
          )}

          <Suspense
            fallback={
              <div className="page">
                <div className="card">
                  <div className="skeleton" style={{ height: 22, width: '40%' }} />
                  <div className="skeleton" style={{ height: 14, width: '70%', marginTop: 12 }} />
                  <div className="skeleton" style={{ height: 120, marginTop: 18 }} />
                </div>
              </div>
            }
          >
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/library" element={<Library />} />
              <Route path="/papers" element={<Papers />} />
              <Route path="/papers/new" element={<Builder />} />
              <Route path="/papers/:id" element={<Builder />} />
              <Route path="/exam" element={<Exam />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/reports/:id" element={<Reports />} />
              <Route path="/report" element={<Reports />} />
              <Route path="/report/:id" element={<Reports />} />
              <Route path="/chat" element={<Chat />} />
              <Route path="/vocab" element={<Vocab />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<Home />} />
            </Routes>
          </Suspense>
        </div>
      </div>

      {toast && (
        <div className={`toast ${toast.tone === 'err' ? 'warn' : ''}`} role="status">
          <Icon name={toast.tone === 'err' ? 'alert' : toast.tone === 'info' ? 'info' : 'check'} size={16} />
          {toast.text}
        </div>
      )}
      </div>
    </div>
  );
}

function DesktopTitlebar() {
  const api = window.desktop?.window;
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!api) return;
    void api.isMaximized().then(setMaximized).catch(() => undefined);
    return api.onMaximized(setMaximized);
  }, [api]);

  if (!api) return null;

  return (
    <div className="desktop-titlebar">
      <span className="desktop-mark">IS</span>
      <span className="desktop-title">IELTS Speaking Studio</span>
      <div className="spacer" />
      <button className="dtb" title="最小化" aria-label="最小化" onClick={() => void api.minimize()}>
        <span style={{ width: 10, height: 1, background: 'currentColor', display: 'block' }} />
      </button>
      <button className="dtb" title={maximized ? '还原' : '最大化'} aria-label="最大化" onClick={() => void api.toggleMaximize()}>
        {maximized ? (
          <span style={{ position: 'relative', width: 10, height: 10, display: 'block' }}>
            <span style={{ position: 'absolute', right: 0, top: 0, width: 8, height: 8, border: '1px solid currentColor', borderRadius: 1 }} />
            <span style={{ position: 'absolute', left: 0, bottom: 0, width: 8, height: 8, border: '1px solid currentColor', borderRadius: 1, background: 'var(--bg-base)' }} />
          </span>
        ) : (
          <span style={{ width: 9, height: 9, border: '1px solid currentColor', borderRadius: 1, display: 'block' }} />
        )}
      </button>
      <button className="dtb dtb--close" title="关闭" aria-label="关闭" onClick={() => void api.close()}>
        <span style={{ fontSize: 12, lineHeight: 1 }}>✕</span>
      </button>
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <Shell />
    </HashRouter>
  );
}
