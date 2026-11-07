import { useState } from 'react';
import * as api from '../../api';
import { ACTIVITIES } from '../../lib/activities';
import { CAMPUSES, campusName, type CampusId } from '../../config';
import { Empty, ErrorText, Loading, Modal, Panel, TierChip, useToast } from '../../components/ui';
import { ShowMore } from '../../components/Blocks';
import { nextLimit } from '../../lib/listing';
import { fmtDateTime, timeAgo } from '../../lib/format';
import { errorMessage, useAsync } from '../../lib/useAsync';
import type { SubmissionStatus } from '../../types';

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

  const q = useAsync(
    () => api.reviewQueue({ status, campus: campus || undefined, activityId: activityId || undefined }),
    [status, campus, activityId],
  );

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
          <p className="list-count">{q.data.length} {status}</p>
          {q.data.slice(0, limit).map((s) => (
            <Panel key={s.id} className="adm-item">
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
