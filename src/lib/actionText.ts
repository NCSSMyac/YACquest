/** Friendly sentences for the chair-only admin activity log (src/screens/admin/ActivityLog.tsx). */
import { CAMPUSES } from '../config';
import type { AdminAction } from '../types';
import { activityById } from './activities';
import { EVENT_KINDS } from './eventKinds';
import { DAY_NAMES, hourLabel } from './validate';

const s = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const activityTitle = (id: unknown) => (id ? activityById(String(id))?.title ?? String(id) : '');
const campusLabel = (c: unknown) => (c === 'all' ? 'all campuses' : CAMPUSES.find((x) => x.id === c)?.name ?? s(c));
const possessive = (name: string) => (name.endsWith('s') ? `${name}’` : `${name}’s`);
const ROLE: Record<string, string> = { participant: 'a participant', admin: 'an admin', chair: 'a YACquest Chair' };

const SETTING_LABELS: Record<string, string> = {
  weeklyEnabled: 'weekly email on/off',
  weeklyDay: 'day',
  weeklyHour: 'time',
  nearGoalPoints: '“close to the prize” range',
  recipients: 'recipients',
  includeChairs: 'include YACquest Chairs',
  includeAdmins: 'include admins',
  prizeAlertsEnabled: 'prize alerts',
};

function settingsChange(details: Record<string, unknown>): string {
  const keys = Array.isArray(details.changed) ? (details.changed as unknown[]).map(String) : Array.isArray(details.keys) ? (details.keys as unknown[]).map(String) : Object.keys(details);
  const parts = keys.map((k) => {
    const label = SETTING_LABELS[k] ?? k;
    const v = details[k];
    if (k === 'weeklyDay' && typeof v === 'number') return `day → ${DAY_NAMES[v] ?? v}`;
    if (k === 'weeklyHour' && typeof v === 'number') return `time → ${hourLabel(v)}`;
    if (typeof v === 'boolean') return `${label} ${v ? 'on' : 'off'}`;
    if (typeof v === 'number') return `${label} → ${v}`;
    return label;
  });
  return parts.length ? ` (${parts.join(', ')})` : '';
}

/** Turns one log row into a plain-English sentence, e.g. “Iesha L. added +35 to Jade G. — Game win”. */
export function describeAction(a: AdminAction): string {
  const actor = a.actorName || 'System';
  const target = a.targetName || 'someone';
  const d = a.details ?? {};
  const reason = s(d.reason) ? ` — ${s(d.reason)}` : '';
  const amount = Number(d.amount);
  switch (a.action) {
    case 'account_deleted':
      return 'An account was deleted';
    case 'points_added':
      return `${actor} added +${Math.abs(amount) || '?'} to ${target}${reason}`;
    case 'points_removed':
      return `${actor} removed ${Math.abs(amount) || '?'} points from ${target}${reason}`;
    case 'submission_approved':
      return `${actor} approved ${possessive(target)} ${activityTitle(d.activityId) || 'submission'}`;
    case 'submission_rejected':
      return `${actor} rejected ${possessive(target)} ${activityTitle(d.activityId) || 'submission'}${reason}`;
    case 'role_changed': {
      const from = s(d.from);
      const to = s(d.to);
      if (to === 'chair') return `${actor} made ${target} a YACquest Chair`;
      if (from === 'chair' && to === 'admin') return a.actorName && a.actorName === a.targetName ? `${actor} stepped down from YACquest Chair to admin` : `${actor} moved ${target} from YACquest Chair to admin`;
      if (to === 'admin') return `${actor} made ${target} an admin`;
      if (from === 'admin' && to === 'participant') return `${actor} removed ${possessive(target)} admin access`;
      return `${actor} made ${target} ${ROLE[to] ?? to}`;
    }
    case 'event_created':
    case 'event_updated':
    case 'event_deleted': {
      const verb = a.action === 'event_created' ? 'created' : a.action === 'event_updated' ? 'edited' : 'deleted';
      const kind = EVENT_KINDS.find((k) => k.id === d.kind)?.label ?? '';
      const extra = [kind, d.campus ? campusLabel(d.campus) : ''].filter(Boolean).join(', ');
      return `${actor} ${verb} the event “${s(d.title) || 'untitled'}”${extra ? ` (${extra})` : ''}`;
    }
    case 'prize_fulfilled':
      return `${actor} marked ${possessive(target)} prize (spot #${s(d.spot) || '?'}) as delivered`;
    case 'prize_revoked':
      return `${target} lost prize spot #${s(d.spot) || '?'}${reason}${a.actorName ? ` (after a change by ${a.actorName})` : ''}`;
    case 'announcement_sent': {
      const campus = ({ duke: 'Duke', unc: 'UNC', ncsu: 'NC State' } as Record<string, string>)[s(d.campus)] ?? s(d.campus);
      const aud = d.audience === 'user' ? target : d.audience === 'campus' ? `${campus} members` : 'everyone';
      const mail = Number(d.emailed) > 0 ? ` (+ email to ${Number(d.emailed)})` : '';
      return `${actor} sent “${s(d.title)}” to ${aud}${mail}`;
    }
    case 'feedback_reviewed':
      return `${actor} marked ${target}’s ${d.kind === 'prize' ? 'prize idea' : 'feedback'} as reviewed${s(d.message) ? ` — “${s(d.message)}”` : ''}`;
    case 'user_renamed':
      return `${actor} renamed ${s(d.from) || target} to ${s(d.to) || target}`;
    case 'cycle_reset':
      return `${actor} ended the cycle${d.name ? ` “${s(d.name)}”` : ''} and reset everyone’s points`;
    case 'hero_crowned':
      return `${actor} crowned ${target} Hero of the Week${s(d.note) ? ` — “${s(d.note)}”` : ''}`;
    case 'hero_cleared':
      return d.reason === 'role_changed' ? `${possessive(target)} Hero of the Week reign ended (no longer staff)` : `${actor} cleared ${target} as Hero of the Week`;
    case 'staff_reward_granted':
      return d.reward === 'council_mvp' ? `${actor} named ${target} Council MVP (Golden Yak unlocked)` : `${actor} gave ${target} the ${s(d.name) || s(d.reward)}`;
    case 'player_note_added':
      return `${actor} added a staff note about ${target}`;
    case 'player_note_deleted':
      return `${actor} deleted a staff note about ${target}${s(d.authorName) && d.authorName !== a.actorName ? ` (written by ${s(d.authorName)})` : ''}`;
    case 'event_followup_sent': {
      const who = `${Number(d.attended) || 0} thanked, ${Number(d.missed) || 0} missed-you${Number(d.emailed) > 0 ? `, ${Number(d.emailed)} emailed` : ''}`;
      return d.automatic || !a.actorName
        ? `Automatic follow-up sent for “${s(d.title) || 'an event'}” (${who})`
        : `${actor} sent the follow-up for “${s(d.title) || 'an event'}” (${who})`;
    }
    case 'photo_hidden':
      return `${actor} hid ${possessive(target)} photo from the ${s(d.title) ? `“${s(d.title)}” ` : ''}photo wall`;
    case 'photo_unhidden':
      return `${actor} put ${possessive(target)} photo back on the ${s(d.title) ? `“${s(d.title)}” ` : ''}photo wall`;
    case 'report_settings_changed':
      return `${actor} changed the weekly email settings${settingsChange(d)}`;
    default:
      return `${actor}: ${a.action.replace(/_/g, ' ')}${a.targetName ? ` — ${a.targetName}` : ''}`;
  }
}

