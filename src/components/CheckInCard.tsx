import { useState } from 'react';
import { formatHours, SESSION_KIND_LABELS, SESSION_TYPE_LABELS, type SessionDefaults, type SessionInput } from '../domain/sessions';
import type { Session } from '../domain/types';

interface Props {
  sessions: Session[];
  /** The duration and type of the last session logged, which a check-in repeats. */
  defaults: SessionDefaults;
  today: string;
  onCheckIn(input: SessionInput): string | null;
}

/**
 * Checks in to today's class in one tap: a session for today, as long as the last one and in the
 * same gi or no-gi. Anything more (techniques, rounds, notes) is added by editing it afterwards
 * or by logging the session in full instead.
 */
export function CheckInCard({ sessions, defaults, today, onCheckIn }: Props) {
  const [error, setError] = useState<string | null>(null);
  const todays = sessions.filter((session) => session.date === today);
  const minutes = todays.reduce((sum, session) => sum + session.durationMinutes, 0);
  const what = `${defaults.durationMinutes} min ${SESSION_TYPE_LABELS[defaults.type]} ${SESSION_KIND_LABELS.class.toLowerCase()}`;

  return (
    <section className="card" aria-labelledby="check-in-heading">
      <h2 id="check-in-heading">Check in</h2>
      {todays.length > 0 ? (
        <p aria-live="polite">
          <strong>Checked in today.</strong> {todays.length === 1 ? '1 session' : `${todays.length} sessions`},{' '}
          {formatHours(minutes)} hours.
        </p>
      ) : (
        <p className="muted" aria-live="polite">
          At class? One tap records that you were here.
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        <button
          type="button"
          className={`button${todays.length === 0 ? ' button--primary' : ''}`}
          onClick={() =>
            setError(
              onCheckIn({
                date: today,
                durationMinutes: defaults.durationMinutes,
                type: defaults.type,
                kind: 'class',
              }),
            )
          }
        >
          {todays.length === 0 ? 'Check in to class' : 'Check in to another class'}
        </button>
      </div>
      <p className="hint">
        Records a {what} today, like your last one. To add techniques, rounds or notes, edit it on
        the Training tab or log the session below instead.
      </p>
    </section>
  );
}
