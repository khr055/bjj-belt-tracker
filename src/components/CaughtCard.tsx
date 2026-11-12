import { formatShortDate } from '../domain/dates';
import { caughtTally } from '../domain/sessions';
import type { Session } from '../domain/types';

interface Props {
  sessions: Session[];
}

/** Rows shown: the handful that catch you most. */
const LISTED = 5;

function count(amount: number, noun: string): string {
  return `${amount} ${noun}${amount === 1 ? '' : 's'}`;
}

/** What the practitioner gets caught with most, which is where the gaps in their game show. */
export function CaughtCard({ sessions }: Props) {
  const tally = caughtTally(sessions);
  if (tally.length === 0) return null;
  const rest = tally.length - LISTED;

  return (
    <section className="card" aria-labelledby="caught-heading">
      <h2 id="caught-heading">Caught with</h2>
      <ol className="list" aria-label="What you are caught with most">
        {tally.slice(0, LISTED).map((entry) => (
          <li key={entry.name.toLowerCase()} className="list__item">
            <div className="list__main">
              <strong className="list__detail">{entry.name}</strong>
              <span className="muted">Last on {formatShortDate(entry.last)}</span>
            </div>
            <span className="list__value">{count(entry.sessions, 'session')}</span>
          </li>
        ))}
      </ol>
      <p className="hint">
        Counted by session, from the sessions where you recorded it
        {rest > 0 ? `. ${count(rest, 'other')} not shown.` : '.'}
      </p>
    </section>
  );
}
