import { useState } from 'react';
import * as api from '../../api';
import { ACTIVITIES } from '../../lib/activities';
import { CAMPUSES, campusName, type CampusId } from '../../config';
import { Empty, ErrorText, Loading, Modal, Panel, TierChip, useToast } from '../../components/ui';
import { fmtDateTime, timeAgo } from '../../lib/format';
import { errorMessage, useAsync } from '../../lib/useAsync';
import type { SubmissionStatus } from '../../types';

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
          <button key={s} role="tab" aria-selected={status === s} onClick={() => setStatus(s)}>{l}</button>
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
        q.data.map((s) => (
          <Panel key={s.id}>
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <button
                onClick={() => setZoom(s.imageUrl)}
                aria-label="Enlarge proof image"
                style={{ padding: 0, border: '3px solid var(--border)', background: 'none', cursor: 'zoom-in', flex: '0 0 96px' }}
              >
                <img src={s.imageUrl} alt={`Proof from ${s.user.displayName}`} style={{ width: 90, height: 90, objectFit: 'cover', display: 'block' }} />
              </button>
              <div className="stack" style={{ gap: 4, minWidth: 0 }}>
                <strong>{s.user.displayName}</strong>
                <span className="muted">@{s.user.handle} · {campusName(s.user.campus)}</span>
                <div className="row wrap"><span>{s.activity.title}</span><TierChip tier={s.activity.tier} /></div>
                {s.eventTitle && <span className="muted">Event: {s.eventTitle}</span>}
                <span className="muted" title={fmtDateTime(s.createdAt)}>Submitted {timeAgo(s.createdAt)}</span>
              </div>
            </div>
            {s.note && <p>“{s.note}”</p>}
            {status === 'pending' ? (
              <div className="grid-2">
                <button className="btn green" disabled={busy} onClick={() => decide(s.id, 'approved')}>Approve</button>
                <button className="btn red" disabled={busy} onClick={() => { setRejecting(s.id); setReason(''); setErr(null); }}>Reject</button>
              </div>
            ) : (
              <p className="muted">
                {s.reviewedAt && `Reviewed ${fmtDateTime(s.reviewedAt)}. `}
                {s.reviewReason && `Reason: ${s.reviewReason}`}
              </p>
            )}
          </Panel>
        ))
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
          <div className="grid-2">
            <button className="btn ghost" onClick={() => setRejecting(null)}>Cancel</button>
            <button className="btn red" disabled={busy || !reason.trim()} onClick={() => rejecting && decide(rejecting, 'rejected', reason)}>Reject</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
