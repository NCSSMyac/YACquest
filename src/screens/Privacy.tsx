/**
 * Privacy summary (0027). Public: reachable logged out from Login/Signup and from Help and Me.
 * Keep this in step with the database (supabase/migrations) — docs/BACKEND.md lists what each table holds.
 */
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/Layout';
import { Panel } from '../components/ui';
import { Accordion } from '../components/Blocks';
import { CONTACT_EMAILS } from '../config';
import { useAuth } from '../lib/auth';

export const PRIVACY_UPDATED = 'November 7, 2026';

export default function Privacy() {
  const { user } = useAuth();
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
            <li>We don’t sell your data and there are no ads or trackers.</li>
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
            <li><b>Your choices:</b> “Email me announcements” on or off, photo-wall on or off, whether you’ve seen the welcome tour.</li>
            <li><b>Friend codes:</b> your code, and who signed up with it (so the bonus goes to the right people).</li>
            <li><b>Prize winners only:</b> name, email, phone and mailing address to deliver the gift card.</li>
          </ul>
        </Accordion>

        <Accordion icon="👀" title="Who can see what" summary="Players, the YAC team, YACquest Chairs">
          <ul className="privacy-list">
            <li><b>Other players</b> see your display name, campus, character and points on the leaderboards, and the photos you chose to share on a photo wall. Friends who used your code see each other’s display name, campus, character and whether they came to an event.</li>
            <li><b>The YAC team (admins and YACquest Chairs)</b> also see your email and username, your uploads (to review them), your points history, check-ins and RSVPs, and feedback you send (without your name if you sent it anonymously). They can keep short private <b>staff notes</b> about players to help with questions; only staff can see these.</li>
            <li><b>YACquest Chairs only</b> see prize winners’ delivery info, the staff action log (who changed points, roles or events), the email log, and can export the player list.</li>
          </ul>
        </Accordion>

        <Accordion icon="📸" title="Screenshots and event photos" summary="Private storage; photo wall only if you opt in">
          <p>Uploads go to a <b>private</b> storage folder. Only you and the YAC team can open them, through links that expire after an hour. The YAC team looks at them to approve points.</p>
          <p style={{ margin: 0 }}>An event photo appears on that event’s photo wall only if you ticked “Show my photo on the event photo wall” when uploading, it was approved, and you haven’t turned photo walls off in Me → Settings. Staff can hide any photo from the wall.</p>
        </Accordion>

        <Accordion icon="🎁" title="Prize winners’ delivery info" summary="Only YACquest Chairs; only to send the gift card">
          <p style={{ margin: 0 }}>If you win, you send your name, email, phone and mailing address. Only YACquest Chairs can see it (in the app and in a prize alert email), and it’s used <b>only</b> to deliver your gift card.</p>
        </Accordion>

        <Accordion icon="💬" title="Feedback and problem reports" summary="Optionally anonymous; reports include a few tech details">
          <p><b>Feedback</b> goes to the YAC team in Admin → Feedback and a weekly staff email. If you tick “Send anonymously”, staff see “Anonymous” instead of your name (the database still links it to your account, to stop spam).</p>
          <p style={{ margin: 0 }}><b>🐞 Report a problem</b> also attaches: the page you were on, the app version, your browser and system (like “Chrome 130 · Android”), screen size, online or offline, light or dark theme, the time, and the last few error messages. Never your password, email or login tokens. Only staff can see these details.</p>
        </Accordion>

        <Accordion icon="✉️" title="Emails and notifications" summary="From the YAC Gmail; turn announcements off any time">
          <p style={{ margin: 0 }}>Emails come from the YAC Gmail account: sign-up and password emails, event reminders and follow-ups, and announcements. Turn off announcement emails in Me → Settings (you’ll still see them in the app). The app keeps an <b>email log</b> (recipients, subject, sent or failed) that only YACquest Chairs can see. Staff get a weekly report email with the leaderboard, people close to the prize and recent feedback.</p>
        </Accordion>

        <Accordion icon="🗄️" title="Where it’s stored" summary="Supabase (US East) · GitHub Pages · Gmail">
          <ul className="privacy-list">
            <li><b>Supabase</b> (data center in the US East region) holds the database, the logins and the uploads.</li>
            <li><b>GitHub Pages</b> hosts the website itself. It doesn’t receive your game data.</li>
            <li><b>Gmail</b> (the YAC account) sends the emails.</li>
          </ul>
        </Accordion>

        <Accordion icon="⏳" title="How long we keep it" summary="Archived at the yearly reset; deleted when you delete your account">
          <p style={{ margin: 0 }}>At the end of each school year the cycle is archived: everyone’s points go back to 0 and the old points history and winners are kept as that year’s record. Your account stays until you delete it.</p>
        </Accordion>

        <Accordion icon="🗑️" title="Deleting your account" summary="What’s removed and what stays (anonymously)" id="delete">
          <p><b>Removed right away:</b> your login, email, username, display name, campus and character; your points history, check-ins, RSVPs and streak; your uploads (the files are wiped from storage within about 10 minutes); notifications; feedback, prize ideas and problem reports; badges and unlocks; staff notes about you; your address in the email log.</p>
          <p><b>Stays, without your name:</b> if you won a prize, the spot number stays filled (as “Deleted account”, delivery info erased) so the prize count stays right. Staff action-log entries about you stay, with your name replaced by “Deleted account”, and one line says “An account was deleted”. Points the YAC team gave others are not affected. Your points leave the leaderboard and Campus Cup.</p>
          <p style={{ margin: 0 }}><b>Can’t be undone by us:</b> copies of past emails already in people’s inboxes (like a weekly staff report that mentioned your display name). If your prize is still on its way, email the YACquest Chairs first so we can finish delivering it.</p>
          {user && <p style={{ margin: '8px 0 0' }}><Link to="/me?section=account">Go to Me → Account</Link></p>}
        </Accordion>

        <Accordion icon="🍪" title="Cookies and local storage" summary="Your login session and preferences only">
          <p style={{ margin: 0 }}>No cookies for tracking and no analytics. The app saves a few things in your browser: your login session, theme, sound on/off, which tour and pop-ups you’ve already seen, and a pending event check-in if you scanned a QR code while logged out. Logging out clears the session.</p>
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
