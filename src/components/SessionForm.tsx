import { useId, useState, type FormEvent } from 'react';
import { MAX_NOTES_LENGTH, SESSION_TYPE_LABELS, type SessionInput } from '../domain/sessions';
import { SESSION_TYPES, type Session, type SessionType } from '../domain/types';

interface Props {
  /** The session being edited; omit to log a new one. */
  initial?: Session;
  /** Duration and type pre-filled for a new session. */
  defaults: Pick<Session, 'durationMinutes' | 'type'>;
  today: string;
  onSubmit(input: SessionInput): string | null;
  onCancel?(): void;
}

const DURATION_PRESETS = [60, 90, 120];

export function SessionForm({ initial, defaults, today, onSubmit, onCancel }: Props) {
  const id = useId();
  const [date, setDate] = useState(initial?.date ?? today);
  const [duration, setDuration] = useState(String(initial?.durationMinutes ?? defaults.durationMinutes));
  const [type, setType] = useState<SessionType>(initial?.type ?? defaults.type);
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const minutes = Number(duration);
    const problem = onSubmit({ date, durationMinutes: minutes, type, notes });
    setError(problem);
    // A new session keeps its date, duration and type so the next class can be logged straight
    // away. The notes belong to the class just logged, so they are cleared.
    setSaved(problem || initial ? null : `Logged ${minutes} min ${SESSION_TYPE_LABELS[type]} session.`);
    if (!problem && !initial) setNotes('');
  };

  return (
    <form className="form" onSubmit={submit} aria-label={initial ? 'Edit session' : 'Log session'}>
      <div className="field-row">
        <div className="field">
          <label htmlFor={`${id}-date`}>Session date</label>
          <input
            id={`${id}-date`}
            type="date"
            value={date}
            max={today}
            required
            onChange={(event) => setDate(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor={`${id}-duration`}>Duration (minutes)</label>
          <input
            id={`${id}-duration`}
            type="number"
            inputMode="numeric"
            min={1}
            max={600}
            step={1}
            value={duration}
            required
            onChange={(event) => setDuration(event.target.value)}
          />
        </div>
      </div>
      <div className="choices__row" role="group" aria-label="Duration presets">
        {DURATION_PRESETS.map((minutes) => (
          <button
            key={minutes}
            type="button"
            className="chip chip--button"
            aria-pressed={duration === String(minutes)}
            onClick={() => setDuration(String(minutes))}
          >
            {minutes} min
          </button>
        ))}
      </div>
      <fieldset className="choices">
        <legend>Type</legend>
        <div className="choices__row">
          {SESSION_TYPES.map((option) => (
            <label key={option} className="chip">
              <input
                type="radio"
                name={`${id}-type`}
                checked={type === option}
                onChange={() => setType(option)}
              />
              {SESSION_TYPE_LABELS[option]}
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
          {initial ? 'Save changes' : 'Log session'}
        </button>
        {onCancel && (
          <button type="button" className="button" onClick={onCancel}>
            Cancel
          </button>
        )}
        <span className="saved" role="status">
          {saved}
        </span>
      </div>
    </form>
  );
}
