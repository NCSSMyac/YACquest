import { playCoin, setSoundOn } from '../lib/sound';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import * as api from '../api';
import { CAMPUSES, type CampusId } from '../config';
import { AVATAR_IDS, AVATAR_NAMES } from '../components/Sprite';
import { Avatar } from '../components/Avatar';
import { ErrorText, Modal, Panel } from '../components/ui';
import { useAuth } from '../lib/auth';
import type { AvatarId } from '../types';
import { RulesContent } from './Rules';

type Errors = Partial<Record<'handle' | 'displayName' | 'email' | 'password' | 'campus' | 'friendCode' | 'form', string>>;

export default function Signup() {
  const { setUser } = useAuth();
  const nav = useNavigate();
  const [handle, setHandle] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [campus, setCampus] = useState<CampusId | ''>('');
  const [avatar, setAvatar] = useState<AvatarId>('yak');
  const [friendCode, setFriendCode] = useState('');
  const [sound, setSound] = useState(true);
  const [errors, setErrors] = useState<Errors>({});
  const [rulesOpen, setRulesOpen] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);

  function validate(): Errors {
    const e: Errors = {};
    if (!/^[a-zA-Z0-9_.]{3,20}$/.test(handle)) e.handle = 'Username: 3–20 letters, numbers, dots or underscores.';
    if (displayName.trim().length < 2 || displayName.length > 24) e.displayName = 'Display name: 2–24 characters.';
    if (!/^\S+@\S+\.\S+$/.test(email)) e.email = 'Enter a valid email.';
    if (password.length < 8) e.password = 'Password must be at least 8 characters.';
    if (!campus) e.campus = 'Pick your campus.';
    return e;
  }

  function review(e: FormEvent) {
    e.preventDefault();
    const v = validate();
    setErrors(v);
    if (Object.keys(v).length === 0) setRulesOpen(true);
  }

  async function create() {
    if (!campus) return;
    setBusy(true);
    try {
      setSoundOn(sound);
      const res = await api.signup({ handle, displayName, email, password, campus, avatar, friendCode: friendCode.trim() || undefined, acceptedRules: true });
      if (res.needsEmailConfirmation || !res.user) {
        nav('/check-email', { state: { email: email.trim() } });
        return;
      }
      setUser(res.user);
      nav('/');
    } catch (err) {
      const code = (err as api.ApiError).code;
      const msg = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setRulesOpen(false);
      setAgreed(false);
      setBusy(false);
      setErrors(['handle', 'displayName', 'email', 'password', 'friendCode'].includes(code) ? { [code]: msg } : { form: msg });
    }
  }

  return (
    <div className="app-shell" style={{ paddingTop: 16 }}>
      <form className="stack" onSubmit={review} noValidate>
        <div className="center">
          <h1 style={{ fontFamily: 'var(--font-pixel)', color: 'var(--gold-500)', textShadow: '2px 2px 0 var(--navy-900)' }}>New player</h1>
        </div>
        <Panel title="Your account">
          <div className="stack">
            <label className="field">
              <span>Username</span>
              <input className="input" value={handle} onChange={(e) => setHandle(e.target.value)} autoComplete="username" autoCapitalize="none" />
              <ErrorText error={errors.handle} />
            </label>
            <label className="field">
              <span>Display name (shown on leaderboards)</span>
              <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={24} />
              <ErrorText error={errors.displayName} />
            </label>
            <label className="field">
              <span>Email</span>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              <ErrorText error={errors.email} />
            </label>
            <label className="field">
              <span>Password (8+ characters)</span>
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
              <ErrorText error={errors.password} />
            </label>
          </div>
        </Panel>
        <Panel title="Your campus">
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="muted">Which campus are you at?</legend>
            <div className="stack" style={{ marginTop: 8 }}>
              {CAMPUSES.map((c) => (
                <label key={c.id} className="panel flat" style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer', margin: 0, borderColor: campus === c.id ? c.color : undefined, background: campus === c.id ? 'var(--cream)' : undefined }}>
                  <input type="radio" name="campus" value={c.id} checked={campus === c.id} onChange={() => setCampus(c.id)} />
                  <span style={{ width: 12, height: 32, background: c.color }} aria-hidden />
                  <span><b>{c.name}</b> <span className="muted">{c.city}</span></span>
                </label>
              ))}
            </div>
          </fieldset>
          <ErrorText error={errors.campus} />
        </Panel>
        <Panel title="Pick your character">
          <div role="radiogroup" aria-label="Character" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
            {AVATAR_IDS.map((id) => (
              <button
                type="button"
                key={id}
                role="radio"
                aria-checked={avatar === id}
                onClick={() => setAvatar(id)}
                className="panel flat"
                style={{ margin: 0, padding: 6, cursor: 'pointer', textAlign: 'center', background: avatar === id ? 'var(--gold-300)' : undefined, color: avatar === id ? 'var(--navy-900)' : 'var(--text)', minWidth: 0, borderColor: avatar === id ? 'var(--gold-500)' : undefined }}
              >
                <Avatar id={id} size={48} />
                <div style={{ fontSize: 13 }}>{AVATAR_NAMES[id]}</div>
              </button>
            ))}
          </div>
        </Panel>
        <Panel title="Friend code (optional)">
          <label className="field">
            <span>Did a friend invite you?</span>
            <input className="input" value={friendCode} onChange={(e) => setFriendCode(e.target.value)} placeholder="YAC-XXXX" autoCapitalize="characters" />
            <ErrorText error={errors.friendCode} />
          </label>
        </Panel>
        <Panel title="🔊 Sound effects">
          <label className="check">
            <input
              type="checkbox"
              checked={sound}
              onChange={(e) => {
                setSound(e.target.checked);
                setSoundOn(e.target.checked);
                if (e.target.checked) playCoin();
              }}
            />
            <span>Play fun 8-bit sounds when you earn points and badges. You can change this later in Me → Settings.</span>
          </label>
        </Panel>
        <ErrorText error={errors.form} />
        <button className="btn block">Next: read the rules</button>
        <p className="center">Already playing? <Link to="/login">Log in</Link></p>
      </form>

      <Modal open={rulesOpen} onClose={() => !busy && setRulesOpen(false)} title="Quest rules">
        <div className="stack">
          <RulesContent />
          <label className="check">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            <span>I agree to the rules</span>
          </label>
          <button className="btn block green" disabled={!agreed || busy} onClick={create}>{busy ? 'Creating…' : 'Create account'}</button>
          <button className="btn block ghost" type="button" disabled={busy} onClick={() => setRulesOpen(false)}>Go back</button>
        </div>
      </Modal>
    </div>
  );
}
