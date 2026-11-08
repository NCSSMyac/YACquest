/**
 * YACquest — send-emails (Supabase Edge Function, Deno)
 *
 * Sends the weekly committee report and prize alerts that the database puts in
 * `email_outbox` (see supabase/migrations/0004_emails_and_audit.sql and docs/BACKEND.md).
 *
 * DEPLOY (no command line needed — full steps in docs/SETUP.md, "Weekly email + prize alerts"):
 *   1. Supabase → Edge Functions → Deploy a new function → Via Editor → name it `send-emails`,
 *      paste this whole file, Deploy.
 *   2. Edge Functions → Secrets: SMTP_USER (the YAC Gmail), SMTP_PASS (its 16-letter app password),
 *      optional SMTP_HOST (default smtp.gmail.com), SMTP_PORT (default 465), SMTP_FROM_NAME (default YACquest).
 *      SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.
 *   3. Integrations → Cron: run it every 10 minutes (`*\/10 * * * *`), POST.
 *
 * Each run: remove files of deleted accounts (0027, storage_purge_queue) → queue this week's report if it's due → claim up to 20 waiting emails →
 * send each one (recipients in BCC so they don't see each other) → record sent/failed.
 * Failed emails are retried by later runs (up to 5 tries); chairs can also press Retry.
 */
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';
import nodemailer from 'npm:nodemailer@6.9.16';

type OutboxRow = {
  id: string;
  kind: string;
  to_emails: string[] | null;
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async () => {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return json({ error: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are missing.' }, 500);

  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // 1. Queue this week's report if it's due (the database decides and never double-queues).
  const due = await db.rpc('enqueue_weekly_report_if_due');
  if (due.error) return json({ error: `enqueue_weekly_report_if_due: ${due.error.message}` }, 500);
  const enqueuedWeekly = due.data === true;

  // 1b. (0027) Remove uploaded files of deleted accounts through the Storage API (plain SQL can't delete files).
  //     Never blocks the emails: on any error it just tries again next run.
  let purged = 0;
  try {
    const q = await db.rpc('claim_storage_purge', { p_limit: 100 });
    const items = (q.error ? [] : (q.data ?? [])) as { id: number; bucket_id: string; name: string }[];
    if (q.error && !/claim_storage_purge/.test(q.error.message)) console.error('claim_storage_purge', q.error.message);
    const byBucket = new Map<string, typeof items>();
    for (const it of items) byBucket.set(it.bucket_id, [...(byBucket.get(it.bucket_id) ?? []), it]);
    for (const [bucket, list] of byBucket) {
      const rm = await db.storage.from(bucket).remove(list.map((i) => i.name));
      if (rm.error) { console.error('storage remove failed', bucket, rm.error.message); continue; }
      const done = await db.rpc('finish_storage_purge', { p_ids: list.map((i) => i.id) });
      if (done.error) console.error('finish_storage_purge', done.error.message);
      else purged += list.length;
    }
  } catch (e) {
    console.error('storage purge failed', e);
  }

  // 2. Claim a batch of emails to send.
  const batch = await db.rpc('claim_email_batch', { p_limit: 20 });
  if (batch.error) return json({ error: `claim_email_batch: ${batch.error.message}` }, 500);
  const rows = (batch.data ?? []) as OutboxRow[];

  const mark = async (id: string, ok: boolean, error: string | null) => {
    const res = await db.rpc('mark_email_result', { p_id: id, p_ok: ok, p_error: error });
    if (res.error) console.error('mark_email_result failed', id, res.error.message);
  };

  if (!rows.length) return json({ enqueuedWeekly, purged, sent: 0, failed: 0 });

  // 3. SMTP settings (Edge Function secrets).
  const host = Deno.env.get('SMTP_HOST') || 'smtp.gmail.com';
  const port = Number(Deno.env.get('SMTP_PORT') || 465);
  const user = Deno.env.get('SMTP_USER') || '';
  const pass = (Deno.env.get('SMTP_PASS') || '').replace(/\s+/g, ''); // Google shows app passwords with spaces
  const fromName = Deno.env.get('SMTP_FROM_NAME') || 'YACquest';

  if (!user || !pass) {
    const msg = 'Email isn’t set up: add the SMTP_USER and SMTP_PASS secrets to the send-emails Edge Function (see docs/SETUP.md).';
    for (const r of rows) await mark(r.id, false, msg);
    return json({ enqueuedWeekly, sent: 0, failed: rows.length, error: msg }, 500);
  }

  const transport = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
  const from = `"${fromName.replace(/"/g, '')}" <${user}>`;

  let sent = 0;
  let failed = 0;
  for (const r of rows) {
    const bcc = (r.to_emails ?? []).filter(Boolean);
    if (!bcc.length) {
      await mark(r.id, false, 'No recipients.');
      failed++;
      continue;
    }
    try {
      await transport.sendMail({
        from,
        to: from, // the sender; real recipients are in BCC so they don't see each other
        bcc,
        subject: r.subject ?? 'YACquest',
        text: r.body_text ?? undefined,
        html: r.body_html ?? undefined,
      });
      await mark(r.id, true, null);
      sent++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('send failed', r.id, msg);
      await mark(r.id, false, msg);
      failed++;
    }
  }
  transport.close();

  return json({ enqueuedWeekly, purged, sent, failed });
});
