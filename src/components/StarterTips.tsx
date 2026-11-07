/** "Start here" tips for brand-new adventurers (see src/lib/starterTips.ts). */
import { Link } from 'react-router-dom';
import { INSTAGRAM_URL } from '../config';
import { useAuth } from '../lib/auth';
import { starterTips } from '../lib/starterTips';
import { Panel, useToast } from './ui';

export function StarterTips({ title = '🧭 Start here' }: { title?: string }) {
  const { user } = useAuth();
  const toast = useToast();
  async function copy() {
    const code = user?.friendCode ?? '';
    try {
      await navigator.clipboard.writeText(code);
      toast('Friend code copied!', 'success');
    } catch {
      toast(`Couldn’t copy. Your code is ${code}`, 'error');
    }
  }
  return (
    <Panel title={title} tone="flat" className="starter-tips">
      <ul className="list">
        {starterTips(INSTAGRAM_URL).map((t) => (
          <li key={t.icon} className="starter-tip">
            <span aria-hidden className="starter-icon">{t.icon}</span>
            <span className="starter-text">{t.text}</span>
            {t.to === 'copy-code' ? (
              <button type="button" className="btn small ghost" onClick={copy} aria-label={`Copy your friend code ${user?.friendCode ?? ''}`}>{t.cta}</button>
            ) : t.to.startsWith('http') ? (
              <a className="btn small ghost" href={t.to} target="_blank" rel="noreferrer">{t.cta} ↗</a>
            ) : (
              <Link className="btn small ghost" to={t.to}>{t.cta}</Link>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
