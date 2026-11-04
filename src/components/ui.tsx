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
    <div className="stack" aria-busy="true" aria-label="Loading">
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

export function Modal({ open, onClose, title, children, tone }: { open: boolean; onClose: () => void; title?: string; children: ReactNode; tone?: 'gold' | 'navy' }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div ref={ref} tabIndex={-1} className={`panel modal ${tone ?? ''}`} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        {title && <h2 className="panel-title">{title}</h2>}
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
      <div className="toast-wrap" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/** `const toast = useToast(); toast('Saved!', 'success')` */
export const useToast = () => useContext(ToastCtx);
