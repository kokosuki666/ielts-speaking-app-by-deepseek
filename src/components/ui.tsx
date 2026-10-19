import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from './Icon';

/* --------------------------------- Button -------------------------------- */

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'danger' | 'dark';
  size?: 'sm' | 'lg';
  icon?: IconName;
  loading?: boolean;
  block?: boolean;
}

export function Button({
  variant,
  size,
  icon,
  loading,
  block,
  children,
  className = '',
  disabled,
  ...rest
}: ButtonProps) {
  const cls = [
    'btn',
    variant ? `btn--${variant}` : '',
    size ? `btn--${size}` : '',
    block ? 'btn--block' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button className={cls} disabled={disabled || loading} {...rest}>
      {loading ? <span className="spinner" /> : icon ? <Icon name={icon} size={16} /> : null}
      {children}
    </button>
  );
}

export function IconButton({
  icon,
  label,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string }) {
  return (
    <button className={`btn btn--ghost btn--icon ${className}`} aria-label={label} title={label} {...rest}>
      <Icon name={icon} size={18} />
    </button>
  );
}

/* ---------------------------------- Card --------------------------------- */

export function Card({
  className = '',
  children,
  style,
  ...rest
}: { className?: string; children: ReactNode; style?: CSSProperties } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`card ${className}`} style={style} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ title, desc, action }: { title: ReactNode; desc?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card-hd">
      <div>
        <div className="card-title">{title}</div>
        {desc && <p className="card-desc">{desc}</p>}
      </div>
      {action}
    </div>
  );
}

/* ---------------------------------- Modal -------------------------------- */

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="overlay" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={wide ? { maxWidth: 820 } : undefined}
      >
        <div className="sheet-hd">
          <div>
            <h3 id={titleId}>{title}</h3>
            {subtitle && <p className="card-desc">{subtitle}</p>}
          </div>
          <button className="btn btn--ghost btn--icon" aria-label="关闭" onClick={onClose}>
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-ft">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/* ----------------------------------- Seg --------------------------------- */

export function Seg<T extends string | number>({
  value,
  onChange,
  options,
  size = 'md',
  className = '',
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: ReactNode; icon?: IconName }[];
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <div className={`seg ${size === 'sm' ? 'seg--sm' : ''} ${className}`} role="tablist">
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          role="tab"
          aria-selected={value === opt.value}
          className={value === opt.value ? 'active' : ''}
          onClick={() => onChange(opt.value)}
        >
          {opt.icon && <Icon name={opt.icon} size={14} />}
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/* ---------------------------------- Field -------------------------------- */

export function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="field">
      <label className="label">{label}</label>
      {children}
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`input ${props.className ?? ''}`} {...props} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`textarea ${props.className ?? ''}`} {...props} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`select ${props.className ?? ''}`} {...props} />;
}

/* ---------------------------------- Chip --------------------------------- */

export function Chip({
  active,
  onClick,
  children,
  count,
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  count?: number | string;
}) {
  return (
    <button className={`chip ${active ? 'chip--on' : ''}`} onClick={onClick} aria-pressed={active}>
      {children}
      {count !== undefined && <span className="count">{count}</span>}
    </button>
  );
}

export function Tag({ tone, children }: { tone?: 'accent' | 'ok' | 'warn' | 'bad'; children: ReactNode }) {
  return <span className={`tag ${tone ? `tag--${tone}` : ''}`}>{children}</span>;
}

/* ---------------------------------- Ring --------------------------------- */

export function Ring({
  value,
  max = 9,
  size = 132,
  label,
  sub,
}: {
  value: number;
  max?: number;
  size?: number;
  label?: ReactNode;
  sub?: ReactNode;
}) {
  const pct = Math.max(0, Math.min(1, value / max));
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="ring-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="ring">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--line)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="url(#ringGradient)"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <defs>
          <linearGradient id="ringGradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
        </defs>
      </svg>
      <div className="ring-cap">
        <div className="ring-num">{label ?? value.toFixed(1)}</div>
        {sub && <div className="tiny muted">{sub}</div>}
      </div>
    </div>
  );
}

/* --------------------------------- Switch -------------------------------- */

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      className={`switch ${checked ? 'on' : ''}`}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}

/* --------------------------------- Empty --------------------------------- */

export function Empty({
  icon = 'sparkles',
  title,
  desc,
  action,
}: {
  icon?: IconName;
  title: ReactNode;
  desc?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon name={icon} size={22} />
      </div>
      <div style={{ fontWeight: 600 }}>{title}</div>
      {desc && <div className="small muted" style={{ marginTop: 6, maxWidth: 420 }}>{desc}</div>}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  );
}

/* -------------------------------- Confirm -------------------------------- */

export function useConfirm() {
  const [state, setState] = useState<{ text: string; resolve: (ok: boolean) => void } | null>(null);
  const confirm = useCallback(
    (text: string) => new Promise<boolean>((resolve) => setState({ text, resolve })),
    [],
  );
  const node = state ? (
    <Modal
      open
      onClose={() => {
        state.resolve(false);
        setState(null);
      }}
      title="确认操作"
      footer={
        <>
          <div className="spacer" />
          <Button variant="ghost" onClick={() => { state.resolve(false); setState(null); }}>取消</Button>
          <Button variant="danger" onClick={() => { state.resolve(true); setState(null); }}>确认</Button>
        </>
      }
    >
      <p className="small">{state.text}</p>
    </Modal>
  ) : null;
  return { confirm, node };
}

/* ------------------------------- Copy button ------------------------------ */

export function CopyButton({ text, label = '复制' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setDone(false), 1600);
    } catch {
      /* clipboard may be blocked */
    }
  };
  return (
    <Button size="sm" variant="ghost" icon={done ? 'check' : 'copy'} onClick={copy}>
      {done ? '已复制' : label}
    </Button>
  );
}

/* ------------------------------ Section title ----------------------------- */

export function SectionTitle({ children, desc }: { children: ReactNode; desc?: ReactNode }) {
  return (
    <div className="section-title">
      <div className="eyebrow">{children}</div>
      {desc && <p className="card-desc">{desc}</p>}
    </div>
  );
}

export const AppModalContext = createContext<null>(null);
export function useAppModal() {
  return useContext(AppModalContext);
}
