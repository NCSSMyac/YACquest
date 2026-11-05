import { useState, type FormEvent } from 'react';
import * as api from '../api';
import { errorMessage } from '../lib/useAsync';
import type { FeedbackCategory } from '../types';
import { ErrorText, Panel, useToast } from './ui';

export const FEEDBACK_LABELS: Record<FeedbackCategory | 'prize', string> = {
  idea: 'Idea',
  bug: 'Bug / problem',
  event: 'Event idea',
  other: 'Other',
  prize: 'Prize idea',
};

/** "Send feedback" box. Goes to Admin → Feedback and the weekly committee email. */
export function FeedbackForm() {
  const toast = useToast();
  const [category, setCategory] = useState<FeedbackCategory>('idea');
  const [message, setMessage] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (message.trim().length < 3) return setErr('Tell us a bit more (at least 3 characters).');
    setBusy(true);
    try {
      await api.submitFeedback(category, message);
      setMessage('');
      toast('Thanks! The YAC team will see it.', 'success');
    } catch (e2) {
      setErr(errorMessage(e2));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="💬 Send feedback">
      <form className="stack" onSubmit={send}>
        <label className="field">
          <span>What kind?</span>
          <select value={category} onChange={(e) => setCategory(e.target.value as FeedbackCategory)}>
            {(['idea', 'bug', 'event', 'other'] as FeedbackCategory[]).map((c) => (
              <option key={c} value={c}>{FEEDBACK_LABELS[c]}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Your message</span>
          <textarea rows={3} value={message} maxLength={1000} onChange={(e) => setMessage(e.target.value)} placeholder="What's working, what's not, or what you'd love to see." />
          <small className="muted">{message.length}/1000 · The YAC team reads every message.</small>
        </label>
        <ErrorText error={err} />
        <button className="btn blue" disabled={busy}>{busy ? 'Sending…' : 'Send feedback'}</button>
      </form>
    </Panel>
  );
}
