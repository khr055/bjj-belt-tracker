import { formatShortDate } from '../domain/dates';
import { formatUntrained, STALE_DAYS, techniqueFocus } from '../domain/techniques';
import type { Session, Technique, TimeOff } from '../domain/types';

interface Props {
  techniques: Technique[];
  sessions: Session[];
  /** Days off do not count towards a technique going stale. */
  timeOff: TimeOff[];
  today: string;
}

/** Names listed in each row before the rest are counted. */
const LISTED = 3;

function listed(names: string[]): string {
  const rest = names.length - LISTED;
  return names.slice(0, LISTED).join(', ') + (rest > 0 ? ` and ${rest} more` : '');
}

/** What is being worked on at the moment, and what has not been trained for a while. */
export function TechniqueFocusCard({ techniques, sessions, timeOff, today }: Props) {
  const { counts, recent, stale } = techniqueFocus({ techniques, sessions, timeOff }, today);
  const workingOn = counts.learning + counts.drilling;

  return (
    <section className="card" aria-labelledby="focus-heading">
      <h2 id="focus-heading">Techniques</h2>
      <div className="stat" role="group" aria-label="Working on">
        <p className="eyebrow">Working on</p>
        <p className="stat__figures">
          <span className="stat__number">{workingOn}</span>{' '}
          {workingOn === 1 ? 'technique' : 'techniques'}
        </p>
        <p className="muted">
          {counts.learning} learning · {counts.drilling} drilling · {counts.landing} landing in
          rolling
        </p>
      </div>
      {(recent.length > 0 || stale.length > 0) && (
        <dl className="facts">
          {recent.length > 0 && (
            <div>
              <dt>Recent</dt>
              <dd>
                {listed(
                  recent.map(
                    ({ technique, lastTrained }) =>
                      `${technique.name} (${formatShortDate(lastTrained)})`,
                  ),
                )}
              </dd>
            </div>
          )}
          {stale.length > 0 && (
            <div>
              <dt>Stale</dt>
              <dd>
                {listed(
                  stale.map(
                    ({ technique, ...wait }) => `${technique.name} (${formatUntrained(wait)})`,
                  ),
                )}
              </dd>
            </div>
          )}
        </dl>
      )}
      {stale.length > 0 && (
        <p className="hint">
          Stale means not trained for {STALE_DAYS} days or more
          {timeOff.length > 0 ? ', not counting time off.' : '.'}
        </p>
      )}
      {workingOn > 0 && recent.length === 0 && stale.length === 0 && (
        <p className="muted">Tick a technique when you log a session to see it here.</p>
      )}
    </section>
  );
}
