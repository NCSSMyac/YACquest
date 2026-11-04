import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import * as api from '../api';
import { campusName } from '../config';
import { Sprite, AVATAR_IDS, AVATAR_NAMES } from '../components/Sprite';
import { ErrorText, Loading, Modal, Panel, useToast } from '../components/ui';
import { useAuth } from '../lib/auth';
import { fmtDate, fmtPts } from '../lib/format';
import { errorMessage, useAsync } from '../lib/useAsync';
import type { AvatarId } from '../types';

type Theme = 'light' | 'dark' | 'system';
const THEME_KEY = 'yacquest-theme';

function readTheme(): Theme {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === 'light' || t === 'dark' ? t : 'system';
  } catch {
    return 'system';
  }
}
function applyTheme(t: Theme) {
  try {
    if (t === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, t);
  } catch {
    /* ignore */
  }
  if (t === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
}

const ROLE = { participant: 'Adventurer', admin: 'Admin', chair: 'YAC Chair' } as const;

export default function Me() {
  const { user, refresh, signOut } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const ledger = useAsync(() => api.myLedger(), [], { live: true });

  const [name, setName] = useState(user?.displayName ?? '');
  const [avatar, setAvatar] = useState<AvatarId>(user?.avatar ?? 'yak');
  const [profileErr, setProfileErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [theme, setTheme] = useState<Theme>(readTheme);
  const [idea, setIdea] = useState('');
  const [ideaErr, setIdeaErr] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.displayName);
      setAvatar(user.avatar);
    }
  }, [user]);

  if (!user) return <Loading />;

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setProfileErr(null);
    try {
      await api.updateProfile({ displayName: name, avatar });
      await refresh();
      toast('Profile saved!', 'success');
    } catch (err) {
      setProfileErr(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function toggleEmail(on: boolean) {
    try {
      await api.updateProfile({ emailOptIn: on });
      await refresh();
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  function pickTheme(t: Theme) {
    setTheme(t);
    applyTheme(t);
  }

  async function sendIdea(e: FormEvent) {
    e.preventDefault();
    setIdeaErr(null);
    if (!idea.trim()) return setIdeaErr('Tell us your idea first.');
    try {
      await api.suggestPrize(idea.trim());
      setIdea('');
      toast('Thanks for the idea!', 'success');
    } catch (err) {
      setIdeaErr(errorMessage(err));
    }
  }

  async function doReset() {
    try {
      await api.resetDemoData();
      await signOut();
      nav('/login');
    } catch (err) {
      setConfirmReset(false);
      toast(errorMessage(err), 'error');
    }
  }

  return (
    <div className="stack">
      <Panel>
        <div className="row">
          <Sprite id={user.avatar} size={64} />
          <div>
            <h1 style={{ margin: 0 }}>{user.displayName}</h1>
            <div className="muted">@{user.handle} · {campusName(user.campus)} · {ROLE[user.role]}</div>
          </div>
        </div>
      </Panel>

      <Panel title="Edit profile">
        <form className="stack" onSubmit={saveProfile}>
          <label className="field">
            <span>Display name</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={24} />
          </label>
          <div role="radiogroup" aria-label="Character" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
            {AVATAR_IDS.map((id) => (
              <button
                type="button"
                key={id}
                role="radio"
                aria-checked={avatar === id}
                onClick={() => setAvatar(id)}
                className="panel flat"
                style={{ margin: 0, padding: 6, cursor: 'pointer', textAlign: 'center', background: avatar === id ? 'var(--gold-300)' : undefined, color: avatar === id ? 'var(--navy-900)' : 'var(--text)', minWidth: 0 }}
              >
                <Sprite id={id} size={48} />
                <div style={{ fontSize: 13 }}>{AVATAR_NAMES[id]}</div>
              </button>
            ))}
          </div>
          <ErrorText error={profileErr} />
          <button className="btn" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </form>
      </Panel>

      <Panel title="Settings">
        <div className="stack">
          <label className="check">
            <input type="checkbox" checked={user.emailOptIn} onChange={(e) => toggleEmail(e.target.checked)} />
            <span>Email me weekly updates</span>
          </label>
          <div>
            <div className="muted" style={{ marginBottom: 6 }}>Theme</div>
            <div className="tabs" role="radiogroup" aria-label="Theme">
              {(['light', 'dark', 'system'] as Theme[]).map((t) => (
                <button key={t} type="button" role="radio" aria-checked={theme === t} aria-selected={theme === t} onClick={() => pickTheme(t)}>
                  {t[0].toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Panel>

      <Panel title="Suggest a prize">
        <form className="stack" onSubmit={sendIdea}>
          <label className="field">
            <span>What would you love to win?</span>
            <textarea className="input" rows={3} value={idea} onChange={(e) => setIdea(e.target.value)} maxLength={280} />
          </label>
          <ErrorText error={ideaErr} />
          <button className="btn blue">Send idea</button>
        </form>
      </Panel>

      <Panel title="Points history">
        {ledger.loading && !ledger.data ? (
          <Loading />
        ) : ledger.data && ledger.data.length > 0 ? (
          <ul className="list">
            {ledger.data.map((l) => (
              <li key={l.id} className="spread">
                <span>{l.reason}<div className="muted">{fmtDate(l.createdAt)}</div></span>
                <b style={{ color: l.amount < 0 ? 'var(--red)' : 'var(--green)' }}>{fmtPts(l.amount)}</b>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted" style={{ margin: 0 }}>No points yet.</p>
        )}
      </Panel>

      <Panel title="More">
        <div className="stack">
          <Link to="/rules">Rules</Link>
          <Link to="/notifications">Notifications</Link>
        </div>
      </Panel>

      <button className="btn block navy" onClick={async () => { await signOut(); nav('/login'); }}>Sign out</button>
      {api.isMock && <button className="btn block red small" onClick={() => setConfirmReset(true)}>Reset demo data (demo only)</button>}

      <Modal open={confirmReset} onClose={() => setConfirmReset(false)} title="Reset demo data?">
        <div className="stack">
          <p style={{ margin: 0 }}>Demo only: this erases everything stored in this browser and restores the sample data. You’ll be signed out.</p>
          <button className="btn red" onClick={doReset}>Yes, reset</button>
          <button className="btn ghost" onClick={() => setConfirmReset(false)}>Cancel</button>
        </div>
      </Modal>
    </div>
  );
}
