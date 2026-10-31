import {
  createContext, useCallback, useContext, useEffect, useState,
  type ButtonHTMLAttributes, type ReactNode,
} from 'react';
import { initials } from '../lib/format';

// ---------------------------------------------------------------------------
// Notifications éphémères (toasts)
// ---------------------------------------------------------------------------
type ToastKind = 'success' | 'error' | 'info';
interface Toast { id: number; kind: ToastKind; text: string }
const ToastContext = createContext<(text: string, kind?: ToastKind) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: ToastKind = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>{t.text}</div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

/** Exécute une action asynchrone avec gestion du chargement et des erreurs. */
export function useAction() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = useCallback(
    async (fn: () => Promise<unknown>, success?: string) => {
      setBusy(true);
      try {
        await fn();
        if (success) toast(success);
        return true;
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e), 'error');
        return false;
      } finally {
        setBusy(false);
      }
    },
    [toast],
  );
  return { busy, run };
}

// ---------------------------------------------------------------------------
// Composants de base
// ---------------------------------------------------------------------------
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({ variant = 'primary', loading, children, className = '', ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button className={`btn btn-${variant} ${className}`} disabled={loading || rest.disabled} {...rest}>
      {loading && <span className="spinner spinner-sm" aria-hidden />}
      {children}
    </button>
  );
}

export function Card({ children, className = '', title, actions }:
  { children: ReactNode; className?: string; title?: ReactNode; actions?: ReactNode }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="card-head">
          {title && <h2 className="card-title">{title}</h2>}
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function Spinner() {
  return <div className="center pad"><span className="spinner" aria-label="Chargement" /></div>;
}

export function FullPageSpinner() {
  return <div className="full-center"><span className="spinner" aria-label="Chargement" /></div>;
}

export function Empty({ icon = '📭', title, children }: { icon?: string; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon" aria-hidden>{icon}</div>
      <p className="empty-title">{title}</p>
      {children && <div className="muted">{children}</div>}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="alert alert-error">
      <span>{error}</span>
      {onRetry && <Button variant="ghost" onClick={onRetry}>Réessayer</Button>}
    </div>
  );
}

export function Badge({ children, tone = 'neutral', color }:
  { children: ReactNode; tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info'; color?: string }) {
  return (
    <span className={`badge badge-${tone}`} style={color ? { background: `${color}1f`, color } : undefined}>
      {children}
    </span>
  );
}

export function Avatar({ person, size = 36 }: { person?: { first_name: string; last_name: string } | null; size?: number }) {
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.38 }} aria-hidden>
      {initials(person)}
    </span>
  );
}

export function Modal({ open, title, onClose, children, wide }:
  { open: boolean; title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Fermer">✕</button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, hint, children, required }:
  { label: string; hint?: string; children: ReactNode; required?: boolean }) {
  return (
    <label className="field">
      <span className="field-label">{label}{required && <span className="req"> *</span>}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }:
  { tabs: { id: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id}
          className={`tab ${value === t.id ? 'tab-active' : ''}`} onClick={() => onChange(t.id)}>
          {t.label}
          {t.count !== undefined && t.count > 0 && <span className="tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function StatCard({ label, value, icon, tone = 'green', hint }:
  { label: string; value: ReactNode; icon: string; tone?: 'green' | 'gold' | 'clay' | 'blue'; hint?: string }) {
  return (
    <div className={`stat stat-${tone}`}>
      <span className="stat-icon" aria-hidden>{icon}</span>
      <div>
        <div className="stat-value">{value}</div>
        <div className="stat-label">{label}</div>
        {hint && <div className="stat-hint">{hint}</div>}
      </div>
    </div>
  );
}

export function Progress({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="progress-bar" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function BarList({ items, unit = '' }: { items: { label: string; value: number }[]; unit?: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (items.length === 0) return <p className="muted">Pas encore de données.</p>;
  return (
    <ul className="barlist">
      {items.map((i) => (
        <li key={i.label}>
          <span className="barlist-label">{i.label}</span>
          <span className="barlist-track"><span className="barlist-bar" style={{ width: `${(i.value / max) * 100}%` }} /></span>
          <span className="barlist-value">{i.value}{unit}</span>
        </li>
      ))}
    </ul>
  );
}

/** Bouton qui demande confirmation avant une action destructive. */
export function ConfirmButton({ onConfirm, children, message = 'Confirmer cette action ?', variant = 'danger', ...rest }:
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> & { onConfirm: () => void; message?: string; variant?: Variant }) {
  return (
    <Button variant={variant} {...rest} onClick={() => window.confirm(message) && onConfirm()}>
      {children}
    </Button>
  );
}

/** Affiche du texte en conservant les retours à la ligne et en rendant les liens cliquables. */
export function RichText({ text }: { text: string | null }) {
  if (!text) return null;
  const parts = text.split(/(https:\/\/[^\s]+)/g);
  return (
    <div className="richtext">
      {parts.map((p, i) =>
        p.startsWith('https://') ? <a key={i} href={p} target="_blank" rel="noopener noreferrer">{p}</a> : <span key={i}>{p}</span>,
      )}
    </div>
  );
}
