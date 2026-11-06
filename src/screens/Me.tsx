import { NAME_NOT_ALLOWED, nameIsClean } from '../lib/nameFilter';
import { FeedbackForm } from '../components/FeedbackForm';
import { InstallApp } from '../components/InstallApp';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import * as api from '../api';
import { campusName } from '../config';
import { AVATAR_IDS, AVATAR_NAMES } from '../components/Sprite';
import { Avatar } from '../components/Avatar';
import { ErrorText, Loading, Modal, Panel, useToast } from '../components/ui';
import { useAuth } from '../lib/auth';
import { fmtDate, fmtPts } from '../lib/format';
import { getSoundOn, playCoin, setSoundOn } from '../lib/sound';
import { errorMessage, useAsync } from '../lib/useAsync';
import type { AvatarId } from '../types';
import { LEGENDARY_AVATARS } from '../lib/staffRewards';
import { useStaffRewards } from '../lib/useStaffRewards';

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
  const streak = useAsync(() => api.myStreak(), [], { live: true });
  // Staff only (0020): null for participants, so the Golden Yak never shows for them.
  const staff = useStaffRewards().data;
  const legendary = staff?.legendary ? LEGENDARY_AVATARS : [];

  const [name, setName] = useState(user?.displayName ?? '');
  const [avatar, setAvatar] = useState<AvatarId>(user?.avatar ?? 'yak');
  const [profileErr, setProfileErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [theme, setTheme] = useState<Theme>(readTheme);
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
    if (!nameIsClean(name)) {
      setProfileErr(NAME_NOT_ALLOWED);
      return;
    }
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
          <Avatar id={user.avatar} look={user.look} campus={user.campus} size={72} hero={!!staff?.isHero} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ margin: 0 }}>{user.displayName}</h1>
            <div className="muted">@{user.handle} · {campusName(user.campus)} · {ROLE[user.role]}</div>
            {streak.data && (streak.data.current >= 1 || streak.data.best >= 1) && (
              <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                {streak.data.current >= 1 && <span className="chip streak">🔥 {streak.data.current}-month streak</span>}
                {streak.data.best > streak.data.current && <small className="muted">Best: {streak.data.best} months</small>}
                {streak.data.current >= 1 && !streak.data.checkedInThisMonth && <small className="muted">Check in this month to keep it going!</small>}
              </div>
            )}
            <Link to="/prize?tab=wardrobe" className="btn small" style={{ marginTop: 8 }}>👒 Wardrobe</Link>
          </div>
        </div>
      </Panel>

      <InstallApp />

      <Panel title="Edit profile">
        <form className="stack" onSubmit={saveProfile}>
          <label className="field">
            <span>Display name</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={24} />
          </label>
          <div role="radiogroup" aria-label="Character" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
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
                <Avatar id={id} look={{ hat: user.look?.hat, accessory: user.look?.accessory }} size={48} />
                <div style={{ fontSize: 13 }}>{AVATAR_NAMES[id]}</div>
              </button>
            ))}
            {legendary.map((id) => (
              <button
                type="button"
                key={id}
                role="radio"
                aria-checked={avatar === id}
                aria-label={`${AVATAR_NAMES[id]} (Legendary)`}
                onClick={() => setAvatar(id)}
                className="panel flat"
                style={{ gridColumn: '1 / -1', margin: 0, padding: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', minWidth: 0,
                  background: avatar === id ? 'var(--gold-300)' : 'linear-gradient(90deg, #fff7d6, #ffe7a0)', color: 'var(--navy-900)', borderColor: 'var(--gold-500)' }}
              >
                <Avatar id={id} look={{ hat: user.look?.hat, accessory: user.look?.accessory }} size={56} />
                <span style={{ minWidth: 0 }}>
                  <b style={{ display: 'block' }}>{AVATAR_NAMES[id]}</b>
                  <span className="chip legendary">★ Legendary</span>
                  <span style={{ display: 'block', fontSize: 12, marginTop: 4 }}>Staff only · Council Legend or Council MVP</span>
                </span>
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
            <span>
              Email me announcements from YAC
              <small className="muted" style={{ display: 'block' }}>Event news and reminders. You’ll still see every message in the app.</small>
            </span>
          </label>
          <SoundToggle />
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

      <FeedbackForm />

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
        <div className="stack" style={{ gap: 8 }}>
          <Link className="btn small ghost block" to="/rules">📜 Rules</Link>
          <Link className="btn small ghost block" to="/help">❓ Help</Link>
          <Link className="btn small ghost block" to="/notifications">🔔 Notifications</Link>
        </div>
      </Panel>

      <button className="btn block navy" onClick={async () => { await signOut(); nav('/login'); }}>Sign out</button>
      {api.isMock && <button className="btn block red small" onClick={() => setConfirmReset(true)}>Reset demo data</button>}

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

function SoundToggle() {
  const [on, setOn] = useState(getSoundOn);
  return (
    <label className="check">
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => {
          setSoundOn(e.target.checked);
          setOn(e.target.checked);
          if (e.target.checked) playCoin();
        }}
      />
      <span>Sound effects</span>
    </label>
  );
}
