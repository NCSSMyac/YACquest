/**
 * 0022: "🎴 Share my quest card" — opens a preview of the person's 1080×1920 quest card (Instagram-story
 * size), with Share (the phone's share sheet, as a PNG file) and Save image. The drawing code is lazy-loaded.
 * 0028: the preview + Share/Save part is ShareImage, reused by the YACquest Wrapped share slide.
 */
import { useEffect, useState } from 'react';
import * as api from '../api';
import { errorMessage } from '../lib/useAsync';
import { ErrorText, Loading, Modal, useToast } from './ui';

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

async function makeQuestCard(): Promise<Blob> {
  const [recap, card] = await Promise.all([api.myRecap(), import('../lib/questCard')]);
  return card.cardBlob(await card.drawQuestCard(recap));
}

function QuestCardModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal open onClose={onClose} title="My Quest Card">
      <ShareImage make={makeQuestCard} fileName="yacquest-card.png" alt="Your YACquest quest card" shareTitle="My YACquest card" onClose={onClose} />
    </Modal>
  );
}

/** Preview of a generated story-sized PNG with Share (share sheet) and Save image. */
export function ShareImage({ make, fileName, alt, shareTitle, onClose, className = '' }: {
  make: () => Promise<Blob>;
  fileName: string;
  alt: string;
  shareTitle: string;
  onClose?: () => void;
  className?: string;
}) {
  const toast = useToast();
  const [img, setImg] = useState<{ url: string; blob: Blob } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let url = '';
    (async () => {
      try {
        const blob = await make();
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
  }, [make]);

  const file = img ? new File([img.blob], fileName, { type: 'image/png' }) : null;
  const canShareFile = !!file && typeof navigator !== 'undefined' && !!navigator.canShare && navigator.canShare({ files: [file] });

  async function share() {
    if (!file) return;
    try {
      await navigator.share({ files: [file], title: shareTitle, text: `${shareTitle} #YACquest @ncssmyoungalumni` });
    } catch (x) {
      // Closing the share sheet isn't an error worth showing.
      if ((x as Error)?.name !== 'AbortError') toast('Couldn’t open sharing here. Use Save image instead.', 'error');
    }
  }

  function save() {
    if (!img) return;
    const a = document.createElement('a');
    a.href = img.url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <div className={`stack ${className}`} style={{ alignItems: 'stretch' }}>
      <div className="quest-card-preview">
        {img ? <img src={img.url} alt={alt} /> : err ? <ErrorText error={err} /> : <Loading lines={4} />}
      </div>
      <p className="muted share-hint" style={{ margin: 0, fontSize: 13 }}>
        Story-sized (1080×1920). {canShareFile ? 'Share opens your phone’s share sheet (pick Instagram → Story).' : 'Save it, then add it to your Instagram story from your photos.'}
      </p>
      <div className="btn-row">
        {onClose && <button type="button" className="btn ghost" onClick={onClose}>Close</button>}
        {canShareFile && <button type="button" className="btn" onClick={share}>Share</button>}
        <button type="button" className={`btn ${canShareFile ? 'blue' : ''}`} disabled={!img} onClick={save}>Save image</button>
      </div>
    </div>
  );
}
