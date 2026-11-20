/**
 * 0034 "Mystery outfit" teaser: for an upcoming special series (within 14 days) the reward outfit shows as
 * a dark silhouette with a sparkly "?" — Home (with RSVP) and the public Login / Sign-up screens (sign up).
 * Never more than the silhouette. Hidden once the player owns the whole outfit. Reduced motion: no sparkle.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../../api';
import { campusName, type CampusId } from '../../config';
import { useAuth } from '../../lib/auth';
import { homeTeaser, publicTeaser, setItems, startsLabel } from '../../lib/promo';
import { useAsync, errorMessage } from '../../lib/useAsync';
import { lookOf } from '../reward/lookOf';
import type { AvatarId } from '../../types';
import { Avatar } from '../Avatar';
import { useToast } from '../ui';

/** The outfit on a character as a solid silhouette (no background), with a "?" sparkle. */
export function MysterySilhouette({ outfitSet, avatar = 'yak', size = 72 }: { outfitSet: string; avatar?: AvatarId; size?: number }) {
  const look = { ...lookOf(setItems(outfitSet)), background: undefined };
  return (
    <span className="mystery-art" style={{ width: size, height: size }} aria-hidden="true">
      <span className="mystery-shadow"><Avatar id={avatar} look={look} size={size} title="" /></span>
      <span className="mystery-q">?</span>
      <span className="mystery-spark s1">✦</span>
      <span className="mystery-spark s2">✧</span>
      <span className="mystery-spark s3">✦</span>
    </span>
  );
}

/** Home: RSVP to the next event of the series at my campus (or an all-campus one). */
export function HomeMysteryTeaser() {
  const { user } = useAuth();
  const toast = useToast();
  const events = useAsync(() => api.listEvents('upcoming'), [], { live: true });
  const unlocks = useAsync(() => api.myUnlocks(), [], { live: true });
  const [busy, setBusy] = useState(false);
  if (!user || !events.data || !unlocks.data) return null;
  const t = homeTeaser(events.data, unlocks.data, user.campus, Date.now());
  if (!t) return null;
  const target = t.rsvp ? events.data.find((e) => e.id === t.rsvp!.id) : undefined;
  const going = !!target?.myRsvp;
  async function rsvp() {
    if (!target) return;
    setBusy(true);
    try {
      await api.setRsvp(target.id, true);
      toast(`You’re going to ${target.title}! See you there ${t!.emoji}`, 'success');
      void events.reload();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel dash-card mystery-card" aria-labelledby="mystery-title">
      <MysterySilhouette outfitSet={t.outfitSet} avatar={user.avatar} size={76} />
      <div className="mystery-text">
        <h2 id="mystery-title" className="mystery-head"><span aria-hidden="true">🎁 </span>Mystery outfit unlocks at {t.name}</h2>
        <p className="mystery-sub">
          {target ? <>RSVP now so you’re ready to scan! {target.campus === 'all' ? 'All campuses' : campusName(target.campus as CampusId)} {startsLabel(target.startsAt, Date.now())}.</> : <>It {startsLabel(t.startsAt, Date.now())}. Check in to unlock it!</>}
        </p>
        {target && (
          going ? (
            <span className="chip approved mystery-going">✓ You’re going</span>
          ) : (
            <button type="button" className="btn small mystery-btn" onClick={rsvp} disabled={busy}>
              {busy ? 'Saving…' : 'RSVP'}<span className="sr-only">: {target.title}</span>
            </button>
          )
        )}
      </div>
    </section>
  );
}

/** Login / Sign-up (logged out): just the silhouette, the series name and when. */
export function PublicMysteryTeaser({ cta = true }: { cta?: boolean }) {
  const { data } = useAsync(() => api.rewardTeaser(), []);
  const t = publicTeaser(data, Date.now());
  if (!t) return null;
  return (
    <section className="panel mystery-card public" aria-labelledby="mystery-public-title">
      <MysterySilhouette outfitSet={t.outfitSet} size={68} />
      <div className="mystery-text">
        <h2 id="mystery-public-title" className="mystery-head"><span aria-hidden="true">🎁 </span>Mystery outfit unlocks at {t.name}</h2>
        <p className="mystery-sub">Sign up now so you’re ready to scan! {t.name} {startsLabel(t.startsAt, Date.now())} {t.emoji}</p>
        {cta && <Link to="/signup" className="btn small mystery-btn">Sign up</Link>}
      </div>
    </section>
  );
}
