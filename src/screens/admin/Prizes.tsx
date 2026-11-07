import { useState } from 'react';
import * as api from '../../api';
import { PRIZE, campusName } from '../../config';
import { Empty, ErrorText, Loading, Modal, Panel, useToast } from '../../components/ui';
import { ShowMore, useShowMore } from '../../components/Blocks';
import { fmtDate, fmtLongDate, timeAgo } from '../../lib/format';
import { errorMessage, useAsync } from '../../lib/useAsync';

export default function Prizes() {
  const toast = useToast();
  const claims = useAsync(() => api.listClaims(), [], { live: true });
  const sugg = useAsync(() => api.listSuggestions(), []);
  const suggMore = useShowMore(10);
  const [confirm, setConfirm] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const target = claims.data?.find((c) => c.spot === confirm && c.status !== 'revoked');
  const remaining = PRIZE.count - (claims.data?.filter((c) => c.status !== 'revoked').length ?? 0);

  async function fulfil() {
    if (confirm == null) return;
    setBusy(true);
    try {
      await api.markFulfilled(confirm);
      toast('Marked fulfilled — winner notified.', 'success');
      setConfirm(null);
      void claims.reload();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <Panel title="Prize claims">
        <p className="muted">{claims.data ? `${remaining} of ${PRIZE.count} spots remaining. ` : ''}Send prizes by {fmtLongDate(PRIZE.fulfillBy)}.</p>
        {claims.loading && !claims.data ? <Loading /> : claims.error ? <ErrorText error={claims.error} /> : !claims.data?.length ? <Empty>No winners yet.</Empty> : (
          <ul className="list">
            {[...claims.data].sort((a, b) => Number(a.status === 'revoked') - Number(b.status === 'revoked') || a.spot - b.spot).map((c) => c.status === 'revoked' ? (
              <li key={`${c.spot}-${c.userId}`} className="stack" style={{ gap: 4, opacity: 0.55 }}>
                <div className="spread">
                  <strong>#{c.spot} {c.displayName}</strong>
                  <span className="chip neutral">revoked</span>
                </div>
                <span className="muted">{campusName(c.campus)} · revoked {c.revokedAt && fmtDate(c.revokedAt)} · {c.revokeReason ?? 'Points fell below the goal'}</span>
              </li>
            ) : (
              <li key={c.spot} className="stack" style={{ gap: 4 }}>
                <div className="spread">
                  <strong>#{c.spot} {c.displayName}</strong>
                  <span className={`chip ${c.status === 'fulfilled' ? 'approved' : c.status === 'info_submitted' ? 't2' : 'pending'}`}>{c.status.replace('_', ' ')}</span>
                </div>
                <span className="muted">{campusName(c.campus)} · qualified {fmtDate(c.qualifiedAt)}{c.reference && ` · ref ${c.reference}`}</span>
                {c.contact ? (
                  <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 10px', fontSize: 15 }}>
                    <dt className="muted">Name</dt><dd style={{ margin: 0 }}>{c.contact.fullName}</dd>
                    <dt className="muted">Email</dt><dd style={{ margin: 0, wordBreak: 'break-word' }}><a href={`mailto:${c.contact.email}`}>{c.contact.email}</a></dd>
                    <dt className="muted">Phone</dt><dd style={{ margin: 0 }}>{c.contact.phone ? <a href={`tel:${c.contact.phone.replace(/[^\d+]/g, '')}`}>{c.contact.phone}</a> : '—'}</dd>
                    <dt className="muted">Address</dt><dd style={{ margin: 0, whiteSpace: 'pre-line' }}>{c.contact.address || '—'}</dd>
                    <dt className="muted">Card</dt><dd style={{ margin: 0 }}>{c.contact.preference || 'No preference'}</dd>
                    {c.contact.notes && <><dt className="muted">Notes</dt><dd style={{ margin: 0 }}>{c.contact.notes}</dd></>}
                  </dl>
                ) : <span className="muted">No contact info submitted yet.</span>}
                {c.status === 'fulfilled' ? (
                  <span className="muted">Fulfilled {c.fulfilledAt && fmtDate(c.fulfilledAt)}</span>
                ) : (
                  <button className="btn small green" style={{ alignSelf: 'flex-start' }} onClick={() => setConfirm(c.spot)}>Mark fulfilled</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Prize suggestions">
        {sugg.loading && !sugg.data ? <Loading /> : !sugg.data?.length ? <Empty>No suggestions yet.</Empty> : (
          <ul className="list">
            {sugg.data.slice(0, suggMore.limit).map((s) => (
              <li key={s.id}>“{s.idea}” <span className="muted">— {s.displayName}, {timeAgo(s.createdAt)}</span></li>
            ))}
          </ul>
        )}
        {sugg.data && <ShowMore shown={Math.min(suggMore.limit, sugg.data.length)} total={sugg.data.length} step={10} onMore={() => suggMore.more(sugg.data?.length ?? 0)} />}
      </Panel>

      <Modal open={confirm != null} onClose={() => setConfirm(null)} title="Mark as fulfilled?">
        <p>Confirm that the {PRIZE.name} for {target?.displayName} (spot #{confirm}) has been sent. They will be notified.</p>
        <div className="btn-row">
          <button className="btn ghost" onClick={() => setConfirm(null)}>Cancel</button>
          <button className="btn green" disabled={busy} onClick={fulfil}>{busy ? 'Saving…' : 'Yes, fulfilled'}</button>
        </div>
      </Modal>
    </div>
  );
}
