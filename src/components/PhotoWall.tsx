/**
 * 0026 event photo wall (Quests → Events → Past events → "📸 Photos (N)"). Lazy-loaded.
 * Shows only what the server returns from event_photos(): approved + shared by the uploader +
 * uploader not opted out + not hidden by staff. Staff can hide a photo (logged).
 */
import { useEffect, useState } from 'react';
import * as api from '../api';
import { campusName } from '../config';
import { useAuth, isStaff } from '../lib/auth';
import { fmtDate } from '../lib/format';
import { errorMessage, useAsync } from '../lib/useAsync';
import type { EventPhoto } from '../types';
import { Empty, ErrorText, Loading, Modal, useToast } from './ui';

export default function PhotoWall({ eventId, title, onClose, onChanged }: { eventId: string; title: string; onClose: () => void; onChanged?: () => void }) {
  const { user } = useAuth();
  const staff = isStaff(user);
  const toast = useToast();
  const list = useAsync<EventPhoto[]>(() => api.eventPhotos(eventId), [eventId]);
  const photos = list.data ?? [];
  const [open, setOpen] = useState<number | null>(null);
  const [confirmHide, setConfirmHide] = useState(false);
  const [busy, setBusy] = useState(false);
  const cur = open !== null ? photos[open] : undefined;

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setOpen((n) => (n === null ? n : Math.min(n + 1, photos.length - 1)));
      if (e.key === 'ArrowLeft') setOpen((n) => (n === null ? n : Math.max(n - 1, 0)));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, photos.length]);

  async function hide(p: EventPhoto) {
    setBusy(true);
    try {
      await api.hideEventPhoto(p.id);
      toast('Photo hidden from the wall.', 'success');
      setOpen(null);
      setConfirmHide(false);
      await list.reload();
      onChanged?.();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={open !== null ? () => { setOpen(null); setConfirmHide(false); } : onClose} title={`📸 ${title}`}>
      {list.loading && !list.data ? (
        <Loading lines={3} />
      ) : list.error && !list.data ? (
        <ErrorText error={list.error} />
      ) : cur ? (
        <div className="stack wall-view">
          <figure className="wall-big">
            <img src={cur.imageUrl} alt={`Photo by ${cur.displayName} at ${title}`} />
            <figcaption>
              <b>{cur.displayName}{cur.mine ? ' (you)' : ''}</b>
              <span className="muted"> · {campusName(cur.campus)} · {fmtDate(cur.createdAt)}</span>
            </figcaption>
          </figure>
          <div className="btn-row">
            <button type="button" className="btn small ghost" disabled={open === 0} onClick={() => { setOpen((n) => (n ?? 1) - 1); setConfirmHide(false); }} aria-label="Previous photo">◀</button>
            <span className="wall-count" aria-live="polite">{(open ?? 0) + 1} / {photos.length}</span>
            <button type="button" className="btn small ghost" disabled={open === photos.length - 1} onClick={() => { setOpen((n) => (n ?? 0) + 1); setConfirmHide(false); }} aria-label="Next photo">▶</button>
          </div>
          {staff && (confirmHide ? (
            <div className="panel flat wall-mod">
              <p style={{ margin: '0 0 8px' }}>Hide this photo from the wall for everyone? (It stays approved and keeps its points. This is logged.)</p>
              <div className="btn-row">
                <button type="button" className="btn small ghost" disabled={busy} onClick={() => setConfirmHide(false)}>Cancel</button>
                <button type="button" className="btn small red" disabled={busy} onClick={() => hide(cur)}>{busy ? 'Hiding…' : 'Hide photo'}</button>
              </div>
            </div>
          ) : (
            <button type="button" className="btn small ghost block" onClick={() => setConfirmHide(true)}>🛡 Hide from wall (staff)</button>
          ))}
          <button type="button" className="btn ghost block" onClick={() => setOpen(null)}>Back to all photos</button>
        </div>
      ) : photos.length === 0 ? (
        <div className="stack">
          <Empty>
            <p style={{ margin: 0 }}>No photos on this wall yet.</p>
          </Empty>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>
            Were you there? Upload a photo in Quests → <b>Upload Event Photos</b> and tick “Show my photo on the event photo wall”. It appears after a YAC admin approves it.
          </p>
          <button type="button" className="btn ghost" onClick={onClose}>Close</button>
        </div>
      ) : (
        <div className="stack">
          <ul className="wall-grid">
            {photos.map((p, n) => (
              <li key={p.id}>
                <button type="button" onClick={() => setOpen(n)} aria-label={`Open photo ${n + 1} by ${p.displayName}`}>
                  <img src={p.imageUrl} alt="" loading="lazy" />
                  <span className="wall-name">{p.displayName.split(' ')[0]}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>Only photos people chose to share. Hide yours any time in Me → Settings.</p>
          <button type="button" className="btn ghost" onClick={onClose}>Close</button>
        </div>
      )}
    </Modal>
  );
}
