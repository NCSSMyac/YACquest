/**
 * Privacy summary (0027). Public: reachable logged out from Login/Signup and from Help and Me.
 * Keep this in step with the database (supabase/migrations) — docs/BACKEND.md lists what each table holds.
 */
import type { MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/Layout';
import { Panel } from '../components/ui';
import { Accordion } from '../components/Blocks';
import { CONTACT_EMAILS } from '../config';
import { useAuth } from '../lib/auth';
import { EMAIL_PREF_ITEMS } from '../lib/emailWording';
import { RETENTION } from '../../supabase/functions/_shared/emailCore';

export const PRIVACY_UPDATED = 'November 20, 2026';

export default function Privacy() {
  const { user } = useAuth();
  // HashRouter owns the URL hash, so the in-page link opens and scrolls to the section itself.
  const openEmails = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    const el = document.getElementById('emails');
    if (el instanceof HTMLDetailsElement) el.open = true;
    el?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };
  const mail = `mailto:${CONTACT_EMAILS.join(',')}?subject=${encodeURIComponent('YACquest privacy question')}`;
  return (
    <div className="app-shell" role="main" style={{ paddingTop: 16 }}>
      <div className="stack privacy">
        <PageHeader title="Privacy" back />
        <p className="muted" style={{ margin: '-6px 0 0', fontSize: 14 }}>Last updated {PRIVACY_UPDATED}</p>

        <Panel tone="gold">
          <h2 className="panel-title" style={{ marginBottom: 6 }}>The short version</h2>
          <ul className="privacy-list">
            <li>We keep only what the game needs: your account, your points and what you send us.</li>
            <li>Other players see your <b>display name, campus, character and points</b>. Never your email.</li>
            <li>The YAC team (staff) sees more so they can run the game: details below.</li>
            <li>We don’t sell your data. No ads, no analytics, no tracking cookies.</li>
            <li>Our optional member emails can tell us when they’re opened and which link was clicked. <a href="#emails" onClick={openEmails}>How that works</a>, and how to turn those emails off.</li>
            <li>You can <b>delete your account</b> any time in Me → Account.</li>
          </ul>
        </Panel>

        <Accordion icon="📋" title="What we collect" summary="Account, character, points, check-ins, uploads, feedback">
          <ul className="privacy-list">
            <li><b>Account:</b> email, username, display name and campus. Your password is handled by Supabase Auth: it’s stored scrambled (hashed), and nobody at YAC can see it.</li>
            <li><b>Your character:</b> the character and outfit you pick, badges and wardrobe unlocks.</li>
            <li><b>Points:</b> every points change (the points history in Me), including who on the YAC team added or removed points and why.</li>
            <li><b>Check-ins and RSVPs:</b> which events you RSVP’d to and checked into, and your monthly check-in streak.</li>
            <li><b>Uploads:</b> screenshots you send as quest proof and event photos, with your note.</li>
            <li><b>Feedback, prize ideas and problem reports</b> you send (see below).</li>
            <li><b>Notifications:</b> the messages the app shows you (approvals, announcements, prize news) and whether you read them.</li>
            <li><b>Your choices:</b> which emails you want ({EMAIL_PREF_ITEMS.map((i) => `“${i.label}”`).join(', ')}), photo-wall on or off, whether you’ve seen the welcome tour.</li>
            <li><b>Email activity:</b> which emails we sent you and whether they went out, and for optional member emails when you opened one or clicked a link (see “Emails” below).</li>
            <li><b>Friend codes:</b> your code, and who signed up with it (so the bonus goes to the right people).</li>
            <li><b>Prize winners only:</b> name, email, phone and mailing address to deliver the gift card.</li>
          </ul>
        </Accordion>

        <Accordion icon="👀" title="Who can see what" summary="Players, the YAC team, YACquest Chairs">
          <ul className="privacy-list">
            <li><b>Other players</b> see your display name, campus, character and points on the leaderboards, and the photos you chose to share on a photo wall. Friends who used your code see each other’s display name, campus, character and whether they came to an event.</li>
            <li><b>The YAC team (admins and YACquest Chairs)</b> also see your email and username, your uploads (to review them), your points history, check-ins and RSVPs, and feedback you send (without your name if you sent it anonymously). They can keep short private <b>staff notes</b> about players to help with questions; only staff can see these.</li>
            <li><b>Email stats (admins and YACquest Chairs):</b> how many people opened or clicked each email, and each person’s email history: what we sent them, whether it arrived, and whether they opened it or clicked a link.</li>
            <li><b>YACquest Chairs only</b> see prize winners’ delivery info in the app, the staff action log (who changed points, roles or events), the email delivery log, and can export the player list. The staff prize-alert list only gets an email saying a winner sent their details, never the details themselves (see below).</li>
          </ul>
        </Accordion>

        <Accordion icon="📸" title="Screenshots and event photos" summary="Private storage; photo wall only if you opt in">
          <p>Uploads go to a <b>private</b> storage folder. Only you and the YAC team can open them, through links that expire after an hour. The YAC team looks at them to approve points.</p>
          <p style={{ margin: 0 }}>An event photo appears on that event’s photo wall only if you ticked “Show my photo on the event photo wall” when uploading, it was approved, and you haven’t turned photo walls off in Me → Settings. Staff can hide any photo from the wall.</p>
        </Accordion>

        <Accordion icon="🎁" title="Prize winners’ delivery info" summary="Staff who send the gift card; only for that">
          <p>If you win, you send your name, email, phone and mailing address. It’s used <b>only</b> to deliver your gift card.</p>
          <p style={{ margin: 0 }}>Only the YACquest Chairs see it, in the app (Admin → Prizes). The staff <b>prize-alert list</b> (the YACquest Chairs, the admins, and any extra addresses a YACquest Chair adds, for example a YAC board member who helps send the cards) gets an email that you sent your details, with your display name, campus and prize spot, but <b>not</b> your name, email, phone, address or notes. Our copy of that email is emptied once your prize is marked delivered, or after {RETENTION.sensitiveBodyDays} days at the latest.</p>
        </Accordion>

        <Accordion icon="💬" title="Feedback and problem reports" summary="Optionally anonymous; reports include a few tech details">
          <p><b>Feedback</b> goes to the YAC team in Admin → Feedback and a weekly staff email. If you tick “Send anonymously”, staff see “Anonymous” instead of your name (the database still links it to your account, to stop spam).</p>
          <p style={{ margin: 0 }}><b>🐞 Report a problem</b> also attaches: the page you were on, the app version, your browser and system (like “Chrome 130 · Android”), screen size, online or offline, light or dark theme, the time, and the last few error messages. Never your password, email or login tokens. Only staff can see these details.</p>
        </Accordion>

        <Accordion icon="✉️" title="Emails and notifications" summary="Opens and clicks on optional emails; turn them off any time" id="emails">
          <p><b>Optional member emails</b> are announcements, event reminders, event follow-ups (“Thanks for coming!”) and your yearly Wrapped. They come from the YAC Gmail account, one email to you alone.</p>
          <p><b>What they record:</b> each one has a tiny invisible image that tells us when it was opened, and its links go through YACquest first so we know which link was clicked. We store the time, which link, and a shortened description of your browser or email app (its “user agent”, cut to 120 characters). We <b>don’t</b> store your IP address or your location. Opens are approximate: some email apps load images on their own, and some block them.</p>
          <p><b>Not tracked at all:</b> the email that confirms your address, password reset emails, and emails to the YAC team (weekly report, prize alerts).</p>
          <p><b>Who sees it:</b> admins and YACquest Chairs see open and click stats and each person’s email history. Staff also get a weekly report email with the leaderboard, people close to the prize and recent feedback.</p>
          <p style={{ margin: 0 }}><b>Turning them off:</b> you choose each kind in Me → Settings → Emails: {EMAIL_PREF_ITEMS.map((i) => `“${i.label}”`).join(', ')}. <b>Unsubscribe from these in one click</b> at the bottom of an email, or your email app’s Unsubscribe button, turns off just that kind. Sending an email with the subject “unsubscribe” to the address our emails come from (from the address you signed up with) turns them all off. You’ll still see everything in the app, and you can turn any of them back on in Me → Settings.</p>
        </Accordion>

        <Accordion icon="🗄️" title="Where it’s stored" summary="Supabase (US East) · GitHub Pages · Gmail">
          <ul className="privacy-list">
            <li><b>Supabase</b> (data center in the US East region) holds the database, the logins and the uploads.</li>
            <li><b>GitHub Pages</b> hosts the website itself. It doesn’t receive your game data.</li>
            <li><b>Gmail</b> (the YAC account) sends the emails.</li>
          </ul>
        </Accordion>

        <Accordion icon="⏳" title="How long we keep it" summary={`Game data archived yearly; email records ${RETENTION.logMonths} months`}>
          <p>At the end of each school year the cycle is archived: everyone’s points go back to 0 and the old points history and winners are kept as that year’s record. Your account stays until you delete it.</p>
          <p style={{ marginBottom: 4 }}>Email records are cleaned up automatically, once a day:</p>
          <ul className="privacy-list" style={{ margin: 0 }}>
            <li><b>Opens, clicks and the email log</b> (who we emailed, what and when): deleted after <b>{RETENTION.logMonths} months</b>.</li>
            <li><b>Prize-alert emails</b> (they name the winner, never their delivery details): their contents are erased as soon as the prize is marked delivered, and after <b>{RETENTION.sensitiveBodyDays} days</b> at the latest. Weekly staff reports (they name players and quote feedback) are erased after {RETENTION.sensitiveBodyDays} days too.</li>
            <li><b>Email confirmation links</b> and the confirmation email’s contents: deleted after {RETENTION.verifyTokenDays} days.</li>
            <li><b>Your unsubscribe link</b> keeps working for as long as you have an account, so old emails can still turn emails off.</li>
          </ul>
        </Accordion>

        <Accordion icon="🗑️" title="Deleting your account" summary="What’s removed and what stays (anonymously)" id="delete">
          <p><b>Removed right away:</b> your login, email, username, display name, campus and character; your points history, check-ins, RSVPs and streak; your uploads (the files are wiped from storage within about 10 minutes); notifications; feedback, prize ideas and problem reports; badges and unlocks; staff notes about you; your address in the email log.</p>
          <p><b>Stays, without your name:</b> if you won a prize, the spot number stays filled (as “Deleted account”, delivery info erased) so the prize count stays right. Staff action-log entries about you stay, with your name replaced by “Deleted account”, and one line says “An account was deleted”. Points the YAC team gave others are not affected. Your points leave the leaderboard and Campus Cup.</p>
          <p style={{ margin: 0 }}><b>Can’t be undone by us:</b> copies of past emails already in people’s inboxes (like a weekly staff report that mentioned your display name). If your prize is still on its way, email the YACquest Chairs first so we can finish delivering it.</p>
          {user && <p style={{ margin: '8px 0 0' }}><Link to="/me?section=account">Go to Me → Account</Link></p>}
        </Accordion>

        <Accordion icon="🍪" title="Cookies and local storage" summary="Your login session and preferences only">
          <p style={{ margin: 0 }}>No tracking cookies and no analytics. The app saves a few things in your browser: your login session, theme, sound on/off, which tour and pop-ups you’ve already seen, and a pending event check-in if you scanned a QR code while logged out. Logging out clears the session.</p>
        </Accordion>

        <Accordion icon="🚫" title="No selling, no ads" summary="Your data is only used to run YACquest">
          <p style={{ margin: 0 }}>We never sell or rent your information, show ads, or share it with sponsors. It’s used only to run YACquest and YAC events.</p>
        </Accordion>

        <Panel title="Questions?">
          <p>Email the YACquest Chairs about your data, a correction, or anything on this page:</p>
          <ul className="privacy-list" style={{ marginBottom: 10 }}>
            {CONTACT_EMAILS.map((e) => (
              <li key={e}><a className="wrap-anywhere" href={`mailto:${e}?subject=${encodeURIComponent('YACquest privacy question')}`}>{e}</a></li>
            ))}
          </ul>
          <a className="btn navy block" href={mail}>✉️ Email the YACquest Chairs</a>
          <p style={{ margin: '10px 0 0' }}>See also: <Link to="/rules">Rules</Link> · <Link to="/help">Help</Link></p>
        </Panel>

        <p className="muted center" style={{ fontSize: 13, margin: 0 }}>This page is a plain-language summary and is pending review by the NCSSM Foundation.</p>
      </div>
    </div>
  );
}
