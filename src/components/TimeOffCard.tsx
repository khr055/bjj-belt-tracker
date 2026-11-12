import { useId, useState, type FormEvent } from 'react';
import { formatDate } from '../domain/dates';
import { MAX_NOTES_LENGTH } from '../domain/sessions';
import {
  currentTimeOff,
  REASON_LABELS,
  returnedOn,
  sortTimeOff,
  type TimeOffInput,
} from '../domain/timeOff';
import {
  TIME_OFF_REASONS,
  type Session,
  type TimeOff,
  type TimeOffReason,
} from '../domain/types';
import { ConfirmDelete } from './ConfirmDelete';

interface Props {
  timeOff: TimeOff[];
  /** To notice training logged during time off that was never ended. */
  sessions: Session[];
  today: string;
  onAdd(input: TimeOffInput): string | null;
  onUpdate(id: string, input: TimeOffInput): string | null;
  onDelete(id: string): void;
}

type Mode = { kind: 'idle' } | { kind: 'add' } | { kind: 'edit'; id: string };
const IDLE: Mode = { kind: 'idle' };

/**
 * "3 Nov 2026 to 17 Nov 2026", "3 Nov 2026" for a single day, "Since 3 Nov 2026" while it is
 * going on, or "From 3 Nov 2026" when it has yet to start.
 */
function describeDates(period: TimeOff, today: string): string {
  if (period.endDate === undefined) {
    return `${period.startDate > today ? 'From' : 'Since'} ${formatDate(period.startDate)}`;
  }
  if (period.endDate === period.startDate) return formatDate(period.startDate);
  return `${formatDate(period.startDate)} to ${formatDate(period.endDate)}`;
}

interface FormProps {
  initial?: TimeOff;
  today: string;
  onSubmit(input: TimeOffInput): string | null;
  onCancel(): void;
}

function TimeOffForm({ initial, today, onSubmit, onCancel }: FormProps) {
  const id = useId();
  const [startDate, setStartDate] = useState(initial?.startDate ?? today);
  const [endDate, setEndDate] = useState(initial?.endDate ?? '');
  const [reason, setReason] = useState<TimeOffReason>(initial?.reason ?? 'injury');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [error, setError] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(onSubmit({ startDate, endDate: endDate || undefined, reason, notes }));
  };

  return (
    <form className="form" onSubmit={submit} aria-label={initial ? 'Edit time off' : 'Add time off'}>
      <div className="field-row">
        <div className="field">
          <label htmlFor={`${id}-start`}>First day off</label>
          <input
            id={`${id}-start`}
            type="date"
            value={startDate}
            required
            onChange={(event) => setStartDate(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor={`${id}-end`}>
            Last day off <span className="muted">(optional)</span>
          </label>
          <input
            id={`${id}-end`}
            type="date"
            value={endDate}
            min={startDate}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </div>
      </div>
      <p className="hint">Leave the last day blank while you are still off.</p>
      <fieldset className="choices">
        <legend>Reason</legend>
        <div className="choices__row">
          {TIME_OFF_REASONS.map((option) => (
            <label key={option} className="chip">
              <input
                type="radio"
                name={`${id}-reason`}
                checked={reason === option}
                onChange={() => setReason(option)}
              />
              {REASON_LABELS[option]}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="field">
        <label htmlFor={`${id}-notes`}>
          Notes <span className="muted">(optional)</span>
        </label>
        <textarea
          id={`${id}-notes`}
          rows={2}
          maxLength={MAX_NOTES_LENGTH}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        <button type="submit" className="button button--primary">
          {initial ? 'Save changes' : 'Save time off'}
        </button>
        <button type="button" className="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function TimeOffCard({ timeOff, sessions, today, onAdd, onUpdate, onDelete }: Props) {
  const [mode, setMode] = useState<Mode>(IDLE);
  const current = currentTimeOff(timeOff, today);
  // Every period with no last day that has been trained since, oldest first: an old one that was
  // forgotten matters as much as the one covering today.
  const overtaken = sortTimeOff(timeOff)
    .reverse()
    .flatMap((period) => {
      const back = returnedOn(period, sessions, today);
      return back ? [{ period, back }] : [];
    });

  const closeOnSuccess = (problem: string | null) => {
    if (!problem) setMode(IDLE);
    return problem;
  };

  return (
    <section className="card" aria-labelledby="time-off-heading">
      <div className="card__header">
        <h2 id="time-off-heading">Time off</h2>
        {mode.kind !== 'add' && (
          <button
            type="button"
            className="button button--small"
            onClick={() => setMode({ kind: 'add' })}
          >
            Add time off
          </button>
        )}
      </div>

      {mode.kind === 'add' && (
        <TimeOffForm
          today={today}
          onSubmit={(input) => closeOnSuccess(onAdd(input))}
          onCancel={() => setMode(IDLE)}
        />
      )}

      {current && !overtaken.some(({ period }) => period.id === current.id) && (
        <p className="notice">
          You are on time off ({REASON_LABELS[current.reason].toLowerCase()}). This week doesn't
          count against your streak or goal.
        </p>
      )}

      {overtaken.map(({ period, back }) => (
        <div key={period.id} className="notice">
          <p>
            Your time off since {formatDate(period.startDate)} has no last day, but you trained on{' '}
            {formatDate(back.firstSession)}. Until it is ended, every week counts as time off.
          </p>
          <div className="actions">
            <button
              type="button"
              className="button button--small"
              aria-label={`End time off from ${formatDate(period.startDate)} on ${formatDate(back.lastDayOff)}`}
              onClick={() => {
                const { id, ...rest } = period;
                onUpdate(id, { ...rest, endDate: back.lastDayOff });
                // This period's edit form, left open, would save its own blank last day over
                // this. Any other form that is open is left alone, with what was typed in it.
                if (mode.kind === 'edit' && mode.id === id) setMode(IDLE);
              }}
            >
              End it on {formatDate(back.lastDayOff)}
            </button>
          </div>
        </div>
      ))}

      {timeOff.length === 0 && mode.kind !== 'add' && (
        <p className="muted">
          Injured, ill or away? Log the time off and those weeks won't break your streak or count
          against your weekly goal and average.
        </p>
      )}

      {timeOff.length > 0 && (
        <ul className="list" aria-label="Time off">
          {sortTimeOff(timeOff).map((period) => {
            const label = `time off from ${formatDate(period.startDate)}`;
            if (mode.kind === 'edit' && mode.id === period.id) {
              return (
                <li key={period.id} className="list__item list__item--editing">
                  <TimeOffForm
                    initial={period}
                    today={today}
                    onSubmit={(input) => closeOnSuccess(onUpdate(period.id, input))}
                    onCancel={() => setMode(IDLE)}
                  />
                </li>
              );
            }
            return (
              <li key={period.id} className="list__item list__item--stacked">
                <div className="list__row">
                  <div className="list__main">
                    <strong>{describeDates(period, today)}</strong>
                    <span className="muted">{REASON_LABELS[period.reason]}</span>
                  </div>
                  {period.startDate > today ? (
                    <span className="list__value">Planned</span>
                  ) : (
                    period.endDate === undefined && <span className="list__value">Ongoing</span>
                  )}
                </div>
                {period.notes && <p className="list__detail list__notes">{period.notes}</p>}
                <div className="actions actions--tight">
                  <button
                    type="button"
                    className="button button--small"
                    aria-label={`Edit ${label}`}
                    onClick={() => setMode({ kind: 'edit', id: period.id })}
                  >
                    Edit
                  </button>
                  <ConfirmDelete label={label} onConfirm={() => onDelete(period.id)} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
