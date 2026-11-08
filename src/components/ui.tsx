/**
 * Small shared UI building blocks. Screens should use these instead of re-styling.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Tier } from '../config';
import { TIER_LABELS, TIER_POINTS } from '../config';
import type { SubmissionStatus } from '../types';

export function Panel({ title, action, tone, children, className = '' }: { title?: ReactNode; action?: ReactNode; tone?: 'gold' | 'navy' | 'flat'; children: ReactNode; className?: string }) {
  return (
    <section className={`panel ${tone ?? ''} ${className}`}>
      {(title || action) && (
        <h2 className="panel-title">
          <span>{title}</span>
          {action}
        </h2>
      )}
      {children}
    </section>
  );
}

export function ProgressBar({ value, max, label }: { value: number; max: number; label?: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="xpbar" role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={label ?? 'Progress'}>
      <div className="fill" style={{ width: `${pct}%` }} />
      {label && <div className="label">{label}</div>}
    </div>
  );
}

export function TierChip({ tier, showPoints = true }: { tier: Tier; showPoints?: boolean }) {
  return (
    <span className={`chip t${tier}`}>
      T{tier} {TIER_LABELS[tier]}
      {showPoints && ` · +${TIER_POINTS[tier]}`}
    </span>
  );
}

export function StatusChip({ status }: { status: SubmissionStatus }) {
  const label = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' }[status];
  return <span className={`chip ${status}`}>{label}</span>;
}

export function Loading({ lines = 2 }: { lines?: number }) {
  return (
    <div className="stack" role="status" aria-busy="true" aria-label="Loading">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="skeleton" />
      ))}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function ErrorText({ error }: { error?: string | null }) {
  if (!error) return null;
  return (
    <p className="field-error" role="alert">
      {error}
    </p>
  );
}

let modalSeq = 0;
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

/**
 * Dialog: focus moves into it on open, Tab/Shift+Tab stay inside (focus trap), Escape closes, and focus
 * returns to whatever opened it (0027 accessibility pass).
 */
export function Modal({ open, onClose, title, children, tone }: { open: boolean; onClose: () => void; title?: string; children: ReactNode; tone?: 'gold' | 'navy' }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [titleId] = useState(() => `modal-title-${++modalSeq}`);
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== 'Tab' || !ref.current) return;
      const items = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (!items.length) {
        e.preventDefault();
        ref.current.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === ref.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      } else if (!ref.current.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      if (opener && typeof opener.focus === 'function' && document.contains(opener)) opener.focus();
    };
  }, [open]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={() => closeRef.current()}>
      <div
        ref={ref}
        tabIndex={-1}
        className={`panel modal ${tone ?? ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : 'Dialog'}
        onClick={(e) => e.stopPropagation()}
      >
        {title && <h2 className="panel-title" id={titleId}>{title}</h2>}
        {children}
      </div>
    </div>
  );
}

// ── Toasts ──────────────────────────────────────────
type Toast = { id: number; kind: 'success' | 'error' | 'info'; text: string };
const ToastCtx = createContext<(text: string, kind?: Toast['kind']) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      {/* 0027: a live region so screen readers announce toasts (errors politely interrupt). */}
      <div className="toast-wrap" role="status" aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`} role={t.kind === 'error' ? 'alert' : undefined}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/** `const toast = useToast(); toast('Saved!', 'success')` */
export const useToast = () => useContext(ToastCtx);
