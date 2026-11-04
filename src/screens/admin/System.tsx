import { useState } from 'react';
import * as api from '../../api';
import { CYCLE } from '../../config';
import { Empty, ErrorText, Loading, Modal, Panel, useToast } from '../../components/ui';
import { fmtDate, fmtDateTime } from '../../lib/format';
import { errorMessage, useAsync } from '../../lib/useAsync';

export default function System() {
  const toast = useToast();
  const sync = useAsync(() => api.syncStatus(), [], { live: true });
  const arch = useAsync(() => api.archives(), []);
  const [syncing, setSyncing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [resetting, setResetting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function runSync() {
    setSyncing(true);
    try {
      await api.runSync();
      toast('Sync complete.', 'success');
      void sync.reload();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setSyncing(false);
    }
  }

  async function exportCsv() {
    setExporting(true);
    try {
      const csv = await api.exportLedgerCsv();
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `yacquest-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setExporting(false);
    }
  }

  async function reset() {
    setResetting(true);
    setErr(null);
    try {
      await api.resetCycle(confirmText);
      toast('Cycle archived and points reset.', 'success');
      setResetOpen(false);
      setConfirmText('');
      void arch.reload();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setResetting(false);
    }
  }

  const s = sync.data;
  const state = syncing ? 'syncing' : s?.state;
  return (
    <div className="stack">
      <Panel title="Google Sheets sync">
        {sync.loading && !s ? <Loading /> : sync.error ? <ErrorText error={sync.error} /> : s && (
          <div className="stack">
            <div className="row wrap">
              <span className={`chip ${state === 'ok' ? 'approved' : state === 'error' ? 'rejected' : 'pending'}`}>{state}</span>
              <span className="muted">Last sync {fmtDateTime(s.lastSyncAt)}</span>
            </div>
            <p>{s.rowsPushed} rows pushed · {s.rowsPulled} pulled · {s.conflicts} conflicts</p>
            <a href={s.sheetUrl} target="_blank" rel="noreferrer">Open the sheet</a>
            <button className="btn blue" disabled={syncing} onClick={runSync}>{syncing ? 'Syncing…' : 'Sync now'}</button>
          </div>
        )}
      </Panel>

      <Panel title="Export">
        <p className="muted">Full points ledger as CSV, for audits and the year-end archive.</p>
        <button className="btn" disabled={exporting} onClick={exportCsv}>{exporting ? 'Preparing…' : 'Export ledger CSV'}</button>
      </Panel>

      <Panel title="Current cycle">
        <p><strong>{CYCLE.name}</strong></p>
        <p className="muted">{fmtDate(CYCLE.start)} – {fmtDate(CYCLE.end)}</p>
      </Panel>

      <Panel title="Past cycles">
        {arch.loading && !arch.data ? <Loading /> : !arch.data?.length ? <Empty>No archived cycles yet.</Empty> : (
          <ul className="list">
            {arch.data.map((a, i) => (
              <li key={i}>
                <strong>{a.cycle}</strong> <span className="muted">archived {fmtDate(a.archivedAt)} · {a.ledgerRows} ledger rows · {a.winners.length} winners</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Danger zone">
        <p>Ending the cycle archives all history and zeroes everyone's points. This cannot be undone.</p>
        <button className="btn red" onClick={() => { setResetOpen(true); setErr(null); setConfirmText(''); }}>End cycle &amp; reset points</button>
      </Panel>

      <Modal open={resetOpen} onClose={() => setResetOpen(false)} title="End cycle & reset?">
        <div className="stack">
          <p>This archives the ledger and prize winners, then sets every participant to 0 points and clears claims and submissions. Everyone is notified.</p>
          <label className="field">
            <span>Type RESET to confirm</span>
            <input className="input" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
          </label>
          <ErrorText error={err} />
          <div className="grid-2">
            <button className="btn ghost" onClick={() => setResetOpen(false)}>Cancel</button>
            <button className="btn red" disabled={confirmText !== 'RESET' || resetting} onClick={reset}>{resetting ? 'Resetting…' : 'Reset'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
