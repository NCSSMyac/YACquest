/**
 * 0026 welcome tour: a full-screen, 4-step pixel walkthrough (5 for staff) in the dashboard card style.
 * Lazy-loaded from Layout (src/components/Layout.tsx) — shown once after the first login, and again
 * whenever someone taps "Replay the tour" in Me or Help. Steps and numbers come from config (src/lib/tour.ts).
 */
import { useEffect, useRef, useState } from 'react';
import { PRIZE, TIER_POINTS, type Tier } from '../config';
import { prizeLine, questDates, tierExamples, tourSteps, type TourStep } from '../lib/tour';
import type { User } from '../types';
import { Avatar } from './Avatar';
import { PixelGlyph, type GlyphName } from './PixelGlyph';
import { AVATAR_NAMES, Sprite } from './Sprite';

const GLYPH: Record<TourStep['id'], GlyphName> = { points: 'coin', checkin: 'calendar', badges: 'star', prizes: 'chest', admin: 'shield' };
const TIER_GLYPH: Record<Tier, GlyphName> = { 1: 'star', 2: 'bolt', 3: 'chat' };

export default function WelcomeTour({ user, onClose }: { user: User; onClose: () => void }) {
  const steps = tourSteps(user.role !== 'participant');
  const [i, setI] = useState(0);
  const step = steps[i];
  const last = i === steps.length - 1;
  const box = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  // Lock the page behind, close on Escape, keep Tab inside the tour.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setI((n) => Math.min(n + 1, steps.length - 1));
      if (e.key === 'ArrowLeft') setI((n) => Math.max(n - 1, 0));
      if (e.key === 'Tab' && box.current) {
        const f = [...box.current.querySelectorAll<HTMLElement>('button, a[href]')].filter((el) => !el.hasAttribute('disabled'));
        if (!f.length) return;
        const first = f[0];
        const lastEl = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose, steps.length]);

  // Each step announces its title.
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [i]);

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      <div className="tour-box" ref={box}>
        <div className="tour-top">
          <span className="dash-eyebrow">Welcome to YACquest · {i + 1}/{steps.length}</span>
          <button type="button" className="tour-skip" onClick={onClose}>Skip</button>
        </div>
        <section className="panel dash-card tour-card" key={step.id}>
          <h2 className="dash-title" id="tour-title" ref={heading} tabIndex={-1}>
            <PixelGlyph name={GLYPH[step.id]} size={22} />
            <span className="dash-title-text">{step.title}</span>
          </h2>
          <StepBody step={step} user={user} />
        </section>
        <div className="tour-dots" role="group" aria-label="Tour steps">
          {steps.map((s, n) => (
            <button key={s.id} type="button" className={n === i ? 'on' : undefined} aria-label={`Step ${n + 1}: ${s.title}`} aria-current={n === i ? 'step' : undefined} onClick={() => setI(n)} />
          ))}
        </div>
        <div className="tour-nav">
          <button type="button" className="btn ghost" onClick={() => setI((n) => n - 1)} disabled={i === 0}>◀ Back</button>
          {last ? (
            <button type="button" className="btn green" onClick={onClose}>Let’s go!</button>
          ) : (
            <button type="button" className="btn" onClick={() => setI((n) => n + 1)}>Next ▶</button>
          )}
        </div>
      </div>
    </div>
  );
}

function Hero({ user, look, caption }: { user: User; look?: User['look']; caption?: string }) {
  return (
    <div className="tour-hero">
      <span className="bob"><Avatar id={user.avatar} look={look ?? user.look} campus={user.campus} size={76} /></span>
      {caption && <span className="tour-bubble">{caption}</span>}
    </div>
  );
}

function StepBody({ step, user }: { step: TourStep; user: User }) {
  const first = user.displayName.split(' ')[0];
  switch (step.id) {
    case 'points':
      return (
        <div className="tour-body">
          <Hero user={user} caption={`Hi ${first}! Every quest earns points.`} />
          <ul className="tour-tiers">
            {tierExamples().map((t) => (
              <li key={t.tier}>
                <PixelGlyph name={TIER_GLYPH[t.tier]} size={20} />
                <span className="tour-tier-main">
                  <b>Tier {t.tier} · {t.label}</b>
                  <small>{t.examples.join(' · ')}</small>
                </span>
                <span className={`chip t${t.tier}`}>+{t.points}</span>
              </li>
            ))}
          </ul>
        </div>
      );
    case 'checkin':
      return (
        <div className="tour-body">
          <div className="tour-qr-row">
            <MiniQr />
            <div className="tour-or">or</div>
            <div className="tour-pw" aria-hidden="true">YAK-1234</div>
          </div>
          <p>At every YAC event, <b>scan the QR code</b> at the door or <b>type the event password</b> in Quests → Events.</p>
          <p className="muted">Check-in opens 30 minutes before the start. RSVP and we’ll remind you an hour before. Events are worth +{TIER_POINTS[2]} or +{TIER_POINTS[1]}.</p>
        </div>
      );
    case 'badges':
      return (
        <div className="tour-body">
          <div className="tour-dress">
            <Avatar id={user.avatar} look={{ background: user.look?.background }} campus={user.campus} size={64} />
            <span className="tour-arrow" aria-hidden="true">▶</span>
            <span className="bob"><Avatar id={user.avatar} look={{ hat: 'party_hat', accessory: 'medal', background: 'sunset' }} campus={user.campus} size={76} title={`${AVATAR_NAMES[user.avatar]} in a party hat and medal`} /></span>
          </div>
          <p>Earn <b>badges</b> for check-ins, quests and streaks. They unlock <b>hats, accessories and backgrounds</b> for your {AVATAR_NAMES[user.avatar] ?? 'character'}.</p>
          <p className="muted">Dress up in Prize → Wardrobe. Your look shows on the leaderboards.</p>
        </div>
      );
    case 'prizes':
      return (
        <div className="tour-body">
          <ul className="tour-chests" aria-label={`${PRIZE.count} prizes`}>
            {Array.from({ length: PRIZE.count }, (_, n) => (
              <li key={n}><Sprite id="chest" size={40} /><span>#{n + 1}</span></li>
            ))}
          </ul>
          <p><b>{prizeLine()}</b></p>
          <p className="muted">The quest runs {questDates()}. Points must be earned fairly — the treasure map on Home shows how close you are.</p>
        </div>
      );
    case 'admin':
      return (
        <div className="tour-body">
          <div className="tour-admin">
            <span className="tour-admin-tab"><PixelGlyph name="shield" size={28} /><span>Admin</span></span>
          </div>
          <p>You’re on the YAC team! The <b>Admin</b> tab in the bottom bar has the review queue, events (QR codes, door mode, follow-ups), announcements and stats.</p>
          <p className="muted">Staff don’t compete for prizes, but you have your own Council badges and wardrobe.</p>
        </div>
      );
  }
}

/** A decorative 9×9 pixel "QR code" (not scannable). */
function MiniQr() {
  const rows = ['111010111', '101001101', '111011111', '000110000', '110101011', '001010100', '111001101', '101110001', '111010111'];
  return (
    <svg className="tour-qr" viewBox="-1 -1 11 11" width="64" height="64" shape-rendering="crispEdges" aria-hidden="true">
      <rect x="-1" y="-1" width="11" height="11" fill="#fff" />
      {rows.flatMap((r, y) => [...r].map((c, x) => (c === '1' ? <rect key={`${x}-${y}`} x={x} y={y} width="1.02" height="1.02" fill="#071a3a" /> : null)))}
    </svg>
  );
}
