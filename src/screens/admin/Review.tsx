import { useEffect, useState } from 'react';
import * as api from '../../api';
import { ACTIVITIES } from '../../lib/activities';
import { CAMPUSES, campusName, type CampusId } from '../../config';
import { Empty, ErrorText, Loading, Modal, Panel, TierChip, useToast } from '../../components/ui';
import { ShowMore } from '../../components/Blocks';
import { nextLimit } from '../../lib/listing';
import { fmtDateTime, timeAgo } from '../../lib/format';
import { errorMessage, useAsync } from '../../lib/useAsync';
import type { SubmissionStatus } from '../../types';
import { bulkSummary, toggleAll } from '../../lib/adminTools';

const REVIEW_STEP = 8;
const QUICK = ['Screenshot unclear', 'Duplicate', "Doesn't show YAC content"];
const TABS: [SubmissionStatus, string][] = [['pending', 'Pending'], ['approved', 'Approved'], ['rejected', 'Rejected']];

export default function Review() {
  const toast = useToast();
  const [status, setStatus] = useState<SubmissionStatus>('pending');
  const [campus, setCampus] = useState<CampusId | ''>('');
  const [activityId, setActivityId] = useState('');
  const [zoom, setZoom] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [limit, setLimit] = useState(REVIEW_STEP);
  // 0025 bulk approve: ticked pending cards (ids), the confirm dialog, and the running request.
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  const q = useAsync(
    () => api.reviewQueue({ status, campus: campus || undefined, activityId: activityId || undefined }),
    [status, campus, activityId],
  );

  // Forget ticks that left the list (reviewed elsewhere, filters changed, other tab).
  useEffect(() => {
    if (status !== 'pending') return setPicked(new Set());
    const ids = new Set((q.data ?? []).map((x) => x.id));
    setPicked((p) => (([...p].every((id) => ids.has(id))) ? p : new Set([...p].filter((id) => ids.has(id)))));
  }, [q.data, status]);

  const pageIds = status === 'pending' ? (q.data ?? []).slice(0, limit).map((x) => x.id) : [];
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => picked.has(id));
  const tick = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  async function approvePicked() {
    const ids = [...picked];
    setBulkBusy(true);
    try {
      const r = await api.reviewSubmissionsBulk(ids);
      const done = new Set(r.results.filter((x) => x.ok).map((x) => x.id));
      q.setData((d) => (d ? d.filter((x) => !done.has(x.id)) : d));
      setPicked(new Set(r.results.filter((x) => !x.ok && x.code !== 'already_reviewed' && x.code !== 'not_found').map((x) => x.id)));
      toast(bulkSummary(r), r.skipped ? 'info' : 'success');
      setConfirmBulk(false);
      if (r.skipped) void q.reload();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBulkBusy(false);
    }
  }

  async function decide(id: string, decision: 'approved' | 'rejected', why?: string) {
    setBusy(true);
    setErr(null);
    const prev = q.data;
    q.setData((d) => (d ? d.filter((x) => x.id !== id) : d) as typeof prev);
    try {
      await api.reviewSubmission(id, decision, why);
      toast(decision === 'approved' ? 'Approved — points awarded.' : 'Rejected — participant notified.', 'success');
      setRejecting(null);
      setReason('');
    } catch (e) {
      q.setData(prev);
      if (rejecting) setErr(errorMessage(e));
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className="tabs" role="tablist">
        {TABS.map(([s, l]) => (
          <button key={s} role="tab" aria-selected={status === s} onClick={() => { setStatus(s); setLimit(REVIEW_STEP); }}>{l}</button>
        ))}
      </div>
      <div className="grid-2">
        <label className="field">
          <span>Campus</span>
          <select value={campus} onChange={(e) => setCampus(e.target.value as CampusId | '')}>
            <option value="">All campuses</option>
            {CAMPUSES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Activity</span>
          <select value={activityId} onChange={(e) => setActivityId(e.target.value)}>
            <option value="">All activities</option>
            {ACTIVITIES.filter((a) => a.method === 'screenshot' || a.method === 'photo').map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
          </select>
        </label>
      </div>

      {q.loading && !q.data ? <Loading lines={3} /> : q.error ? <ErrorText error={q.error} /> : !q.data?.length ? (
        <Empty>Nothing {status} here. Nice work!</Empty>
      ) : (
        <>
          <div className="review-top">
            <p className="list-count">{q.data.length} {status}</p>
            {status === 'pending' && (
              <label className="check review-all">
                <input type="checkbox" checked={allOnPage} onChange={() => setPicked((p) => toggleAll(p, pageIds))} />
                <span>Select all on this page ({pageIds.length})</span>
              </label>
            )}
          </div>
          {q.data.slice(0, limit).map((s) => (
            <Panel key={s.id} className={`adm-item${picked.has(s.id) ? ' picked' : ''}`}>
              {status === 'pending' && (
                <label className="check review-pick">
                  <input type="checkbox" checked={picked.has(s.id)} onChange={() => tick(s.id)} aria-label={`Select ${s.user.displayName}’s ${s.activity.title}`} />
                  <span aria-hidden="true">{picked.has(s.id) ? 'Selected' : 'Select'}</span>
                </label>
              )}
              <div className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
                <button onClick={() => setZoom(s.imageUrl)} aria-label="Enlarge proof image" className="review-thumb">
                  <img src={s.imageUrl} alt={`Proof from ${s.user.displayName}`} />
                </button>
                <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div className="spread" style={{ alignItems: 'baseline' }}>
                    <strong style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{s.user.displayName}</strong>
                    <small className="muted" style={{ whiteSpace: 'nowrap' }} title={fmtDateTime(s.createdAt)}>{timeAgo(s.createdAt)}</small>
                  </div>
                  <span className="muted" style={{ fontSize: 13 }}>@{s.user.handle} · {campusName(s.user.campus)}</span>
                  <div className="row wrap" style={{ gap: 6 }}><span style={{ fontSize: 15 }}>{s.activity.title}</span><TierChip tier={s.activity.tier} /></div>
                  {s.eventTitle && <span className="muted" style={{ fontSize: 13 }}>Event: {s.eventTitle}</span>}
                </div>
              </div>
              {s.note && <p style={{ margin: '8px 0 0', fontSize: 15 }}>“{s.note}”</p>}
              {status === 'pending' ? (
                <div className="btn-row" style={{ marginTop: 10 }}>
                  <button className="btn small green" disabled={busy} onClick={() => decide(s.id, 'approved')}>Approve</button>
                  <button className="btn small red" disabled={busy} onClick={() => { setRejecting(s.id); setReason(''); setErr(null); }}>Reject</button>
                </div>
              ) : (
                <p className="muted" style={{ margin: '8px 0 0', fontSize: 14 }}>
                  {s.reviewedAt && `Reviewed ${fmtDateTime(s.reviewedAt)}. `}
                  {s.reviewReason && `Reason: ${s.reviewReason}`}
                </p>
              )}
            </Panel>
          ))}
          <ShowMore shown={Math.min(limit, q.data.length)} total={q.data.length} step={REVIEW_STEP} onMore={() => setLimit((l) => nextLimit(l, REVIEW_STEP, q.data?.length ?? 0))} />
        </>
      )}

      {status === 'pending' && picked.size > 0 && (
        <div className="bulk-bar" role="region" aria-label="Bulk approve">
          <span className="bulk-count"><b>{picked.size}</b> selected</span>
          <button type="button" className="btn small ghost" onClick={() => setPicked(new Set())}>Clear</button>
          <button type="button" className="btn small green" disabled={bulkBusy} onClick={() => setConfirmBulk(true)}>✓ Approve {picked.size}</button>
        </div>
      )}

      <Modal open={confirmBulk} onClose={() => !bulkBusy && setConfirmBulk(false)} title={`Approve ${picked.size} ${picked.size === 1 ? 'submission' : 'submissions'}?`}>
        <div className="stack">
          <p style={{ margin: 0 }}>Each person gets their points and an “approved” notification. Anything someone else already reviewed is skipped.</p>
          <p className="muted" style={{ margin: 0 }}>Rejecting still happens one at a time, so you can give a reason.</p>
          <div className="btn-row">
            <button className="btn ghost" disabled={bulkBusy} onClick={() => setConfirmBulk(false)}>Cancel</button>
            <button className="btn green" disabled={bulkBusy} onClick={() => void approvePicked()}>{bulkBusy ? 'Approving…' : `Approve ${picked.size}`}</button>
          </div>
        </div>
      </Modal>

      <Modal open={!!zoom} onClose={() => setZoom(null)} title="Proof image">
        {zoom && <img src={zoom} alt="Proof, enlarged" style={{ width: '100%', maxHeight: '70vh', objectFit: 'contain' }} />}
        <button className="btn block" onClick={() => setZoom(null)}>Close</button>
      </Modal>

      <Modal open={!!rejecting} onClose={() => setRejecting(null)} title="Reject submission">
        <div className="stack">
          <div className="row wrap">
            {QUICK.map((r) => <button key={r} className="btn small ghost" onClick={() => setReason(r)}>{r}</button>)}
          </div>
          <label className="field">
            <span>Reason (shown to the participant)</span>
            <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <ErrorText error={err} />
          <div className="btn-row">
            <button className="btn ghost" onClick={() => setRejecting(null)}>Cancel</button>
            <button className="btn red" disabled={busy || !reason.trim()} onClick={() => rejecting && decide(rejecting, 'rejected', reason)}>Reject</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
