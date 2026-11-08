/**
 * 0030: pixel stars for the event survey (picker) and its results (read-only row).
 * Same 16x16 star as the dashboard glyph; "off" stars are an outline with a pale fill.
 */
import { useRef, type KeyboardEvent } from 'react';
import { PixelGlyph } from './PixelGlyph';
import { RATING_LABELS } from '../lib/eventSurvey';

export function PixelStar({ on, size = 32 }: { on: boolean; size?: number }) {
  return <PixelGlyph name="star" size={size} className={`pstar ${on ? 'on' : 'off'}`} />;
}

/** Read-only row: `value` rounded to the nearest whole star. */
export function StarRow({ value, size = 18, label }: { value: number | null; size?: number; label?: string }) {
  const n = value == null ? 0 : Math.round(value);
  return (
    <span className="pstar-row" role="img" aria-label={label ?? (value == null ? 'No rating yet' : `${value} out of 5 stars`)}>
      {[1, 2, 3, 4, 5].map((i) => <PixelStar key={i} on={i <= n} size={size} />)}
    </span>
  );
}

/**
 * 1–5 star picker: a radio group (arrow keys move, Space/Enter picks), 48px targets, tiny labels underneath.
 */
export function StarPicker({ value, onChange, labelledBy, invalid, describedBy }: {
  value: number | null;
  onChange: (n: number) => void;
  labelledBy: string;
  invalid?: boolean;
  describedBy?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  function onKey(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = Math.min(5, Math.max(1, i + delta));
    onChange(next);
    refs.current[next - 1]?.focus();
  }
  return (
    <div className="star-picker">
      <div className="star-buttons" role="radiogroup" aria-labelledby={labelledBy} aria-invalid={invalid || undefined} aria-describedby={describedBy}>
        {[1, 2, 3, 4, 5].map((i) => (
          <button
            key={i}
            ref={(el) => (refs.current[i - 1] = el)}
            type="button"
            role="radio"
            aria-checked={value === i}
            aria-label={`${i} star${i === 1 ? '' : 's'}: ${RATING_LABELS[i - 1]}`}
            tabIndex={value === i || (value == null && i === 1) ? 0 : -1}
            className={`star-btn ${value != null && i <= value ? 'lit' : ''}`}
            onClick={() => onChange(i)}
            onKeyDown={(e) => onKey(e, i)}
          >
            <PixelStar on={value != null && i <= value} size={36} />
          </button>
        ))}
      </div>
      <div className="star-scale" aria-hidden="true">
        <span>{RATING_LABELS[0]}</span>
        <b className="star-chosen">{value ? RATING_LABELS[value - 1] : 'Tap a star'}</b>
        <span>{RATING_LABELS[4]}</span>
      </div>
    </div>
  );
}
