import { formatDate, formatDuration } from '../domain/dates';
import { BELT_LABELS } from '../domain/rank';
import { MINIMUM_LABELS, timeInGrade } from '../domain/timeInGrade';
import type { Promotion, Rank } from '../domain/types';

interface Props {
  rank: Rank;
  promotions: Promotion[];
  today: string;
}

export function TimeInGradeCard({ rank, promotions, today }: Props) {
  const grade = timeInGrade(rank, promotions, today);
  const belt = BELT_LABELS[grade.belt].toLowerCase();
  const minimum = MINIMUM_LABELS[grade.belt];

  let body;
  if (grade.status === 'top-belt') {
    body = (
      <p className="muted">
        Black belt degrees have their own time requirements, which this app doesn't track yet.
      </p>
    );
  } else if (grade.status === 'no-minimum') {
    body = (
      <p className="muted">
        IBJJF sets no minimum time at {belt} belt before{' '}
        {BELT_LABELS[grade.nextBelt].toLowerCase()} belt.
      </p>
    );
  } else if (grade.status === 'start-unknown') {
    body = (
      <p className="muted">
        IBJJF requires {minimum} at {belt} belt. Log your promotion to {belt} belt in the timeline
        to see how far along you are.
      </p>
    );
  } else {
    const percent = Math.round(grade.progress * 100);
    const served = formatDuration(grade.since, today);
    body = (
      <>
        <progress
          className="meter"
          max={100}
          value={percent}
          aria-label={`IBJJF minimum time at ${belt} belt`}
        />
        {grade.status === 'met' ? (
          <p>
            <strong>Minimum met.</strong> You've spent {served} at {belt} belt; IBJJF requires{' '}
            {minimum}, which you reached {grade.approximate ? 'by' : 'on'}{' '}
            {formatDate(grade.eligibleOn)}.
          </p>
        ) : (
          <p>
            <strong>{served}</strong> of the {minimum} IBJJF requires at {belt} belt. You reach the
            minimum {grade.approximate ? 'by' : 'on'} {formatDate(grade.eligibleOn)}, in{' '}
            {formatDuration(today, grade.eligibleOn)}.
          </p>
        )}
        {grade.approximate && (
          <p className="muted">
            Counted from your earliest {belt} belt entry, a stripe on {formatDate(grade.since)}.
            Log the belt promotion itself for an exact date.
          </p>
        )}
      </>
    );
  }

  return (
    <section className="card" aria-labelledby="grade-heading">
      <h2 id="grade-heading">Time in grade</h2>
      {body}
      {grade.status !== 'top-belt' && (
        <p className="hint">
          Minimum time is only one requirement. Promotion is your professor's decision.
        </p>
      )}
    </section>
  );
}
