/**
 * 0028 End-of-year checklist (staff): on the Admin dashboard during the wrap-up window (Wrapped opens →
 * 14 days after the quest ends) and always in Admin → System. Ticks are stored per cycle on the server
 * (eoy_checklist); "Wrapped sent" ticks itself; "Reset for next year" is YACquest Chair only, after the end.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../../api';
import { PRIZE } from '../../config';
import { Card } from '../../components/Blocks';
import { ErrorText, Loading, useToast } from '../../components/ui';
import { fmtDate, fmtDateTime } from '../../lib/format';
import { errorMessage, useAsync } from '../../lib/useAsync';
import type { EoyChecklist, EoyItemId } from '../../types';

const ITEMS: Record<EoyItemId, { label: string; link?: { to: string; text: string; chair?: boolean } }> = {
  ledger_backup: { label: 'Export the ledger CSV (backup)', link: { to: '/admin/system#export', text: 'Export', chair: true } },
  confirm_winners: { label: 'Confirm prize winners & collect delivery info', link: { to: '/admin/prizes', text: 'Prizes', chair: true } },
  deliver_gift_cards: { label: `Deliver gift cards by ${fmtDate(PRIZE.fulfillBy)}`, link: { to: '/admin/prizes', text: 'Prizes', chair: true } },
  thank_you: { label: 'Send a thank-you announcement', link: { to: '/admin/announce?template=builtin:year_end', text: 'Use template' } },
  reset: { label: 'Reset for next year', link: { to: '/admin/system#reset', text: 'Reset', chair: true } },
};

export function EndOfYearCard({ isChair, showPreview = true }: { isChair: boolean; showPreview?: boolean }) {
  const q = useAsync(() => api.eoyChecklist(), [], { live: true });
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  if (!q.data)
    return (
      <Card glyph="todo" title="End of year" id="end-of-year">
        {q.error ? <ErrorText error={q.error} /> : <Loading lines={3} />}
      </Card>
    );
  const c: EoyChecklist = q.data;
  const done = c.items.filter((i) => i.done).length + (c.wrapped ? 1 : 0);
  const total = c.items.length + 1;

  async function tick(id: EoyItemId, value: boolean) {
    setBusy(id);
    setErr(null);
    try {
      await api.setEoyItem(id, value);
      await q.reload();
      if (value) toast('Ticked off. Nice work!', 'success');
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card glyph="todo" title="End of year" id="end-of-year" className="eoy-card" action={<span className={`chip ${done === total ? 'approved' : 't1'}`}>{done}/{total} done</span>}>
      <p className="muted eoy-intro">
        {c.inWindow ? 'Wrap-up time! ' : ''}Wrapped opens {fmtDate(c.opensAt)} · quest ends {fmtDate(c.endsAt)} · prizes by {fmtDate(c.fulfillBy || PRIZE.fulfillBy)}.
      </p>
      <ul className="eoy-list">
        <li className={`eoy-row auto${c.wrapped ? ' done' : ''}`}>
          <span className="eoy-box" aria-hidden="true">{c.wrapped ? '✓' : ''}</span>
          <span className="eoy-text">
            <b>Wrapped sent</b> <span className="chip neutral">automatic</span>
            <span className="eoy-sub">
              {c.wrapped
                ? `Sent ${fmtDateTime(c.wrapped.sentAt)} · ${c.wrapped.notified} notified · ${c.wrapped.emailed} emailed`
                : `Goes out by itself on ${fmtDate(c.opensAt)} (notification + email teaser).`}
            </span>
          </span>
        </li>
        {c.items.map((it) => {
          const def = ITEMS[it.id];
          const chairOnly = it.id === 'reset';
          const blocked = chairOnly && (!isChair || !c.cycleEnded);
          const why = chairOnly && !isChair ? 'YACquest Chairs only' : chairOnly && !c.cycleEnded ? `Only after the quest ends (${fmtDate(c.endsAt)})` : '';
          const id = `eoy-${it.id}`;
          return (
            <li key={it.id} className={`eoy-row${it.done ? ' done' : ''}${blocked ? ' blocked' : ''}`}>
              <input id={id} type="checkbox" className="eoy-check" checked={it.done} disabled={busy !== null || (blocked && !it.done)} onChange={(e) => void tick(it.id, e.target.checked)} aria-describedby={`${id}-sub`} />
              <label htmlFor={id} className="eoy-text">
                <b>{def.label}</b>
                <span className="eoy-sub" id={`${id}-sub`}>{it.done && it.doneBy ? `Done by ${it.doneBy}${it.doneAt ? ` · ${fmtDate(it.doneAt)}` : ''}` : why || 'Not done yet'}</span>
              </label>
              {def.link && (!def.link.chair || isChair) && !(chairOnly && !c.cycleEnded) && (
                <Link to={def.link.to} className="btn small ghost eoy-link">{def.link.text}</Link>
              )}
            </li>
          );
        })}
      </ul>
      <ErrorText error={err} />
      {showPreview && isChair && (
        <Link to="/wrapped" className="btn small navy block eoy-preview">🎁 Preview Wrapped</Link>
      )}
    </Card>
  );
}
