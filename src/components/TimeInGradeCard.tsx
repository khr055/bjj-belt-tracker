import { formatDate, formatDuration } from '../domain/dates';
import { BELT_LABELS, ordinal } from '../domain/rank';
import {
  formatYears,
  MINIMUM_LABELS,
  timeInDegree,
  timeInGrade,
  type TimeInDegree,
} from '../domain/timeInGrade';
import type { Promotion, Rank } from '../domain/types';

interface Props {
  rank: Rank;
  promotions: Promotion[];
  today: string;
  /** Set when a coach is reading about a student, so the card speaks of "they" and not "you". */
  forCoach?: boolean;
}

/** The words that differ between a person reading about themselves and a coach reading about them. */
function voice(forCoach: boolean) {
  return forCoach
    ? {
        have: "They've",
        reach: 'They reach',
        reached: 'they reached',
        their: 'their',
        toSee: 'Record their promotion to',
        where: 'to see how far along they are',
        hint: 'Minimum time is only one requirement. Promotion is your decision.',
        degreeHint: 'Minimum time is only one requirement. Degrees are also registered with the federation.',
      }
    : {
        have: "You've",
        reach: 'You reach',
        reached: 'you reached',
        their: 'your',
        toSee: 'Log your promotion to',
        where: 'in the timeline to see how far along you are',
        hint: "Minimum time is only one requirement. Promotion is your professor's decision.",
        degreeHint:
          'Minimum time is only one requirement. Degrees are awarded by your professor and registered with the federation.',
      };
}

/** Progress towards the next black belt degree. */
function DegreeBody({
  degree,
  today,
  forCoach,
}: {
  degree: TimeInDegree;
  today: string;
  forCoach: boolean;
}) {
  const words = voice(forCoach);
  if (degree.status === 'top-degree') {
    return (
      <p className="muted">
        The 7th degree is the coral belt, which this app doesn't track.
      </p>
    );
  }
  const held = degree.degree === 0 ? 'black belt' : `the ${ordinal(degree.degree)} degree`;
  const next = `${ordinal(degree.nextDegree)} degree`;
  const minimum = formatYears(degree.requiredMonths);
  if (degree.status === 'start-unknown') {
    return (
      <p className="muted">
        IBJJF requires {minimum} at {held} before the {next}. {words.toSee}{' '}
        {degree.degree === 0 ? 'black belt' : held} {words.where}.
      </p>
    );
  }
  const served = formatDuration(degree.since, today);
  return (
    <>
      <progress
        className="meter"
        max={100}
        value={Math.round(degree.progress * 100)}
        aria-label={`IBJJF minimum time before the ${next}`}
      />
      {degree.status === 'met' ? (
        <p>
          <strong>Minimum met.</strong> {words.have} spent {served} at {held}; IBJJF requires {minimum}{' '}
          before the {next}, which {words.reached} on {formatDate(degree.eligibleOn)}.
        </p>
      ) : (
        <p>
          <strong>{served}</strong> of the {minimum} IBJJF requires at {held} before the {next}.
          {words.reach} the minimum on {formatDate(degree.eligibleOn)}, in{' '}
          {formatDuration(today, degree.eligibleOn)}.
        </p>
      )}
    </>
  );
}

export function TimeInGradeCard({ rank, promotions, today, forCoach = false }: Props) {
  const words = voice(forCoach);
  const degree = timeInDegree(rank, promotions, today);
  if (degree) {
    return (
      <section className="card" aria-labelledby="grade-heading">
        <h2 id="grade-heading">Time in grade</h2>
        <DegreeBody degree={degree} today={today} forCoach={forCoach} />
        {degree.status !== 'top-degree' && (
          <p className="hint">{words.degreeHint}</p>
        )}
      </section>
    );
  }

  const grade = timeInGrade(rank, promotions, today);
  const belt = BELT_LABELS[grade.belt].toLowerCase();
  const minimum = MINIMUM_LABELS[grade.belt];

  let body;
  if (grade.status === 'top-belt') {
    body = (
      // Black belt is handled above, by degree.
      <p className="muted">There is no belt above this one to work towards.</p>
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
        IBJJF requires {minimum} at {belt} belt. {words.toSee} {belt} belt {words.where}.
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
            <strong>Minimum met.</strong> {words.have} spent {served} at {belt} belt; IBJJF requires{' '}
            {minimum}, which {words.reached} {grade.approximate ? 'by' : 'on'}{' '}
            {formatDate(grade.eligibleOn)}.
          </p>
        ) : (
          <p>
            <strong>{served}</strong> of the {minimum} IBJJF requires at {belt} belt. {words.reach} the
            minimum {grade.approximate ? 'by' : 'on'} {formatDate(grade.eligibleOn)}, in{' '}
            {formatDuration(today, grade.eligibleOn)}.
          </p>
        )}
        {grade.approximate && (
          <p className="muted">
            Counted from {words.their} earliest {belt} belt entry, a stripe on {formatDate(grade.since)}.
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
        <p className="hint">{words.hint}</p>
      )}
    </section>
  );
}
