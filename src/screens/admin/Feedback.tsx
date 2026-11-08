import { useState } from 'react';
import * as api from '../../api';
import { FEEDBACK_LABELS } from '../../components/FeedbackForm';
import { Empty, ErrorText, Loading, Panel, useToast } from '../../components/ui';
import { ShowMore, useShowMore } from '../../components/Blocks';
import { campusName } from '../../config';
import { fmtDateTime } from '../../lib/format';
import { errorMessage, useAsync } from '../../lib/useAsync';
import type { FeedbackItem } from '../../types';
import { contextLines } from '../../lib/bugContext';

type Filter = 'new' | 'reviewed' | 'all';

/** Admin → Feedback: general feedback and prize ideas, newest first. Also summarized in the weekly email. */
export default function Feedback() {
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>('new');
  const list = useAsync(() => api.listFeedback(filter === 'all' ? undefined : filter, 100), [filter], { live: true });
  const [busyId, setBusyId] = useState<string | null>(null);
  const more = useShowMore(10);

  async function review(item: FeedbackItem) {
    setBusyId(item.id);
    try {
      await api.markFeedbackReviewed(item.kind, item.id);
      toast('Marked reviewed', 'success');
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="stack">
      <p className="muted" style={{ margin: 0 }}>Feedback and prize ideas from participants. New ones also appear in the weekly committee email.</p>
      <div className="tabs" role="tablist" aria-label="Feedback filter">
        {(['new', 'reviewed', 'all'] as Filter[]).map((f) => (
          <button key={f} role="tab" aria-selected={filter === f} onClick={() => { setFilter(f); more.reset(); }}>
            {f === 'new' ? 'New' : f === 'reviewed' ? 'Reviewed' : 'All'}
          </button>
        ))}
      </div>
      {list.loading && !list.data ? <Loading lines={3} /> : list.error ? <ErrorText error={list.error} /> : !list.data?.length ? (
        <Empty>{filter === 'new' ? 'All caught up! No new feedback.' : 'Nothing here yet.'}</Empty>
      ) : (
        <>
        <p className="list-count">{list.data.length} {filter === 'all' ? 'messages' : filter}</p>
        {list.data.slice(0, more.limit).map((f) => (
          <Panel key={`${f.kind}-${f.id}`} className="adm-item">
            <div className="stack" style={{ gap: 6 }}>
              <div className="spread">
                <span className={`chip ${f.kind === 'prize' ? 't1' : f.category === 'bug' ? 'rejected' : 't2'}`}>{FEEDBACK_LABELS[f.category]}</span>
                <small className="muted">{fmtDateTime(f.createdAt)}</small>
              </div>
              <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{f.message}</p>
              {f.context?.trying && <p style={{ margin: 0 }}><span className="muted">Trying to:</span> {f.context.trying}</p>}
              {f.context && (
                <details className="tech-details">
                  <summary>Technical details</summary>
                  <pre className="tech-pre">{contextLines(f.context).join('\n')}</pre>
                </details>
              )}
              <small className="muted">{f.anonymous || !f.campus ? 'Anonymous' : `${f.displayName} · @${f.handle} · ${campusName(f.campus)}`}</small>
              {f.status === 'reviewed' ? (
                <small className="muted">✓ Reviewed{f.reviewedByName ? ` by ${f.reviewedByName}` : ''}{f.reviewedAt ? ` · ${fmtDateTime(f.reviewedAt)}` : ''}</small>
              ) : (
                <button className="btn small green" style={{ alignSelf: 'flex-start' }} disabled={busyId === f.id} onClick={() => review(f)}>Mark reviewed</button>
              )}
            </div>
          </Panel>
        ))}
        <ShowMore shown={Math.min(more.limit, list.data.length)} total={list.data.length} step={10} onMore={() => more.more(list.data?.length ?? 0)} />
        </>
      )}
    </div>
  );
}
