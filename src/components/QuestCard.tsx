/**
 * 0022: "🎴 Share my quest card" — opens a preview of the person's 1080×1920 quest card (Instagram-story
 * size), with Share (the phone's share sheet, as a PNG file) and Save image. The drawing code is lazy-loaded.
 */
import { useEffect, useState } from 'react';
import * as api from '../api';
import { errorMessage } from '../lib/useAsync';
import { ErrorText, Loading, Modal, useToast } from './ui';

const FILE_NAME = 'yacquest-card.png';

export function QuestCardButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn small navy" style={{ alignSelf: 'center' }} onClick={() => setOpen(true)}>
        🎴 Share my quest card
      </button>
      {open && <QuestCardModal onClose={() => setOpen(false)} />}
    </>
  );
}

function QuestCardModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [img, setImg] = useState<{ url: string; blob: Blob } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let url = '';
    (async () => {
      try {
        const [recap, card] = await Promise.all([api.myRecap(), import('../lib/questCard')]);
        const canvas = await card.drawQuestCard(recap);
        const blob = await card.cardBlob(canvas);
        url = URL.createObjectURL(blob);
        if (alive) setImg({ url, blob });
        else URL.revokeObjectURL(url);
      } catch (x) {
        if (alive) setErr(errorMessage(x));
      }
    })();
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, []);

  const file = img ? new File([img.blob], FILE_NAME, { type: 'image/png' }) : null;
  const canShareFile = !!file && typeof navigator !== 'undefined' && !!navigator.canShare && navigator.canShare({ files: [file] });

  async function share() {
    if (!file) return;
    try {
      await navigator.share({ files: [file], title: 'My YACquest card', text: 'My YACquest card #YACquest @ncssmyoungalumni' });
    } catch (x) {
      // Closing the share sheet isn't an error worth showing.
      if ((x as Error)?.name !== 'AbortError') toast('Couldn’t open sharing here. Use Save image instead.', 'error');
    }
  }

  function save() {
    if (!img) return;
    const a = document.createElement('a');
    a.href = img.url;
    a.download = FILE_NAME;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <Modal open onClose={onClose} title="My Quest Card">
      <div className="stack" style={{ alignItems: 'stretch' }}>
        <div className="quest-card-preview">
          {img ? <img src={img.url} alt="Your YACquest quest card" /> : err ? <ErrorText error={err} /> : <Loading lines={4} />}
        </div>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Story-sized (1080×1920). {canShareFile ? 'Share opens your phone’s share sheet (pick Instagram → Story).' : 'Save it, then add it to your Instagram story from your photos.'}
        </p>
        <div className="btn-row">
          <button type="button" className="btn ghost" onClick={onClose}>Close</button>
          {canShareFile && <button type="button" className="btn" onClick={share}>Share</button>}
          <button type="button" className={`btn ${canShareFile ? 'blue' : ''}`} disabled={!img} onClick={save}>Save image</button>
        </div>
      </div>
    </Modal>
  );
}
