/**
 * Shared layout blocks so every screen uses the same card header, accordion and "Show more" pattern
 * (style reference: the admin dashboard). Pure paging helpers live in src/lib/listing.ts.
 */
import { useState, type ReactNode } from 'react';
import { nextLimit } from '../lib/listing';
import { PixelGlyph, type GlyphName } from './PixelGlyph';

/** Pixel panel with a small glyph + Silkscreen title and an optional right-side action (link, chip or small button). */
export function Card({ glyph, title, action, tone, className = '', label, id, children }: {
  glyph?: GlyphName;
  title: ReactNode;
  action?: ReactNode;
  tone?: 'gold' | 'navy';
  className?: string;
  label?: string;
  id?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className={`panel dash-card ${tone ?? ''} ${className}`} aria-label={label}>
      <h2 className="dash-title">
        {glyph && <PixelGlyph name={glyph} size={20} />}
        <span className="dash-title-text">{title}</span>
        {action}
      </h2>
      {children}
    </section>
  );
}

/**
 * Collapsible section built on <details>, so it works with the keyboard and screen readers for free.
 * `summary` is a short one-line hint shown under the title while closed (and open).
 */
export function Accordion({ title, glyph, icon, summary, right, defaultOpen = false, tone, flat, className = '', id, children }: {
  title: ReactNode;
  glyph?: GlyphName;
  /** Emoji or small element in front of the title, when there's no pixel glyph for it. */
  icon?: ReactNode;
  summary?: ReactNode;
  /** Small chip/count on the right of the header. */
  right?: ReactNode;
  defaultOpen?: boolean;
  tone?: 'gold';
  /** No outer panel (for accordions nested inside a card). */
  flat?: boolean;
  className?: string;
  id?: string;
  children: ReactNode;
}) {
  return (
    <details id={id} className={`acc ${flat ? 'acc-flat' : 'panel'} ${tone ?? ''} ${className}`} open={defaultOpen || undefined}>
      <summary>
        {glyph && <PixelGlyph name={glyph} size={20} />}
        {icon && <span className="acc-icon" aria-hidden="true">{icon}</span>}
        <span className="acc-head">
          <span className="acc-title">{title}</span>
          {summary && <span className="acc-sum">{summary}</span>}
        </span>
        {right}
        <span className="acc-caret" aria-hidden="true">▸</span>
      </summary>
      <div className="acc-body">{children}</div>
    </details>
  );
}

/** `const more = useShowMore(10)` → `items.slice(0, more.limit)` and `<ShowMore … />` underneath. */
export function useShowMore(step: number, initial = step) {
  const [limit, setLimit] = useState(initial);
  return {
    limit,
    step,
    more: (total: number) => setLimit((l) => nextLimit(l, step, total)),
    reset: () => setLimit(initial),
    setLimit,
  };
}

/** "Show 10 more (23 left)" button. Renders nothing when everything is already shown. */
export function ShowMore({ shown, total, step, onMore, noun, busy }: {
  shown: number;
  total: number;
  step: number;
  onMore: () => void;
  /** What the items are, singular and plural: ['event', 'events'] → "Show 1 more event". */
  noun?: [string, string];
  busy?: boolean;
}) {
  const left = total - shown;
  if (left <= 0) return null;
  const n = Math.min(step, left);
  const what = noun ? ` ${n === 1 ? noun[0] : noun[1]}` : '';
  return (
    <button type="button" className="show-more" onClick={onMore} disabled={busy}>
      <span>{busy ? 'Loading…' : `Show ${n} more${what}`}</span>
      {!busy && left > n && <span className="show-more-left">{left} left</span>}
    </button>
  );
}
