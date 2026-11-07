import { NAME_NOT_ALLOWED, nameIsClean } from '../lib/nameFilter';
import { FeedbackForm } from '../components/FeedbackForm';
import { InstallApp } from '../components/InstallApp';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import * as api from '../api';
import { campusName } from '../config';
import { AVATAR_IDS, AVATAR_NAMES } from '../components/Sprite';
import { Avatar } from '../components/Avatar';
import { ErrorText, Loading, Modal, Panel, useToast } from '../components/ui';
import { Accordion, Card, ShowMore, useShowMore } from '../components/Blocks';
import { useAuth } from '../lib/auth';
import { fmtDate, fmtPts } from '../lib/format';
import { getSoundOn, playCoin, setSoundOn } from '../lib/sound';
import { errorMessage, useAsync } from '../lib/useAsync';
import type { AvatarId } from '../types';
import { LEGENDARY_AVATARS } from '../lib/staffRewards';
import { useStaffRewards } from '../lib/useStaffRewards';
import { MyFriends } from '../components/MyFriends';
import { requestTour } from '../lib/tour';

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

const ROLE = { participant: 'Adventurer', admin: 'Admin', chair: 'YACquest Chair' } as const;

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
  const histMore = useShowMore(10, 5);
  // `#/me?section=friends` (Home's friend-code row) scrolls to My friends.
  const [params] = useSearchParams();
  const section = params.get('section');
  useEffect(() => {
    if (section !== 'friends') return;
    const t = setTimeout(() => {
      const el = document.getElementById('friends');
      el?.scrollIntoView({ block: 'start', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }, 50);
    return () => clearTimeout(t);
  }, [section]);

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

  async function togglePhotoWall(show: boolean) {
    try {
      await api.setPhotoWallOptOut(!show);
      await refresh();
      toast(show ? 'Your shared event photos can appear on photo walls.' : 'Your photos are hidden from every photo wall.', 'success');
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

  const history = ledger.data ?? [];
  const avatarLook = { hat: user.look?.hat, accessory: user.look?.accessory };

  return (
    <div className="stack">
      <Panel>
        <div className="row">
          <Avatar id={user.avatar} look={user.look} campus={user.campus} size={64} hero={!!staff?.isHero} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: 20, overflowWrap: 'anywhere' }}>{user.displayName}</h1>
            <div className="muted" style={{ fontSize: 14 }}>@{user.handle} · {campusName(user.campus)} · {ROLE[user.role]}</div>
            {streak.data && (streak.data.current >= 1 || streak.data.best >= 1) && (
              <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                {streak.data.current >= 1 && <span className="chip streak">🔥 {streak.data.current}-month streak</span>}
                {streak.data.best > streak.data.current && <small className="muted">Best: {streak.data.best} months</small>}
                {streak.data.current >= 1 && !streak.data.checkedInThisMonth && <small className="muted">Check in this month to keep it going!</small>}
              </div>
            )}
          </div>
        </div>
        <div className="grid-2" style={{ marginTop: 10 }}>
          <Link to="/prize?tab=wardrobe" className="btn small">👒 Wardrobe</Link>
          <Link to="/prize?tab=badges" className="btn small ghost">🏅 Badges</Link>
        </div>
      </Panel>

      <Card glyph="scroll" title="Points history" id="points" action={history.length ? <span className="chip neutral">{history.length}</span> : undefined}>
        {ledger.loading && !ledger.data ? (
          <Loading />
        ) : history.length > 0 ? (
          <>
            <ul className="mini-list">
              {history.slice(0, histMore.limit).map((l) => (
                <li key={l.id}>
                  <span className="mini-main">
                    <span className="mini-title">{l.reason}</span>
                    <span className="mini-meta">{fmtDate(l.createdAt)}</span>
                  </span>
                  <b className={`mini-val ${l.amount < 0 ? 'minus' : 'plus'}`}>{fmtPts(l.amount)}</b>
                </li>
              ))}
            </ul>
            <ShowMore shown={Math.min(histMore.limit, history.length)} total={history.length} step={10} onMore={() => histMore.more(history.length)} />
          </>
        ) : (
          <p className="muted" style={{ margin: 0 }}>No points yet.</p>
        )}
      </Card>

      <MyFriends code={user.friendCode} id="friends" />

      <Accordion glyph="people" title="Name & character" summary={`${user.displayName} · ${AVATAR_NAMES[user.avatar] ?? 'Character'}`}>
        <form className="stack" onSubmit={saveProfile}>
          <label className="field">
            <span>Display name</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={24} />
          </label>
          <div className="field-legend" id="char-label">Character</div>
          <div role="radiogroup" aria-labelledby="char-label" className="char-grid">
            {AVATAR_IDS.map((id) => (
              <button type="button" key={id} role="radio" aria-checked={avatar === id} onClick={() => setAvatar(id)} className="char-btn">
                <Avatar id={id} look={avatarLook} size={44} />
                <span className="char-name">{AVATAR_NAMES[id]}</span>
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
                <Avatar id={id} look={avatarLook} size={56} />
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
      </Accordion>

      <Accordion glyph="gear" title="Settings" summary="Email, photo wall, sound effects and theme">
        <div className="stack">
          <label className="check">
            <input type="checkbox" checked={user.emailOptIn} onChange={(e) => toggleEmail(e.target.checked)} />
            <span>
              Email me announcements from YAC
              <small className="muted" style={{ display: 'block' }}>Event news and reminders. You’ll still see every message in the app.</small>
            </span>
          </label>
          <label className="check">
            <input type="checkbox" checked={!user.photoWallOptOut} onChange={(e) => togglePhotoWall(e.target.checked)} />
            <span>
              Show my approved event photos on photo walls
              <small className="muted" style={{ display: 'block' }}>Only photos you chose to share when you uploaded them. Turn off to hide all of them.</small>
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
      </Accordion>

      <InstallApp />

      <FeedbackForm />

      <nav className="link-grid" aria-label="More">
        <Link className="btn small ghost" to="/rules">📜 Rules</Link>
        <Link className="btn small ghost" to="/help">❓ Help</Link>
        <Link className="btn small ghost" to="/notifications" aria-label="Notifications">🔔 Alerts</Link>
      </nav>
      <button type="button" className="btn small ghost block" onClick={requestTour}>🧭 Replay the tour</button>

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
