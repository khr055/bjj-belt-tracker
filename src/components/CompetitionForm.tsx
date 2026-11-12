import { useId, useState, type FormEvent } from 'react';
import { MAX_NAME_LENGTH, MEDAL_LABELS, type CompetitionInput } from '../domain/competitions';
import { MAX_NOTES_LENGTH, SESSION_TYPE_LABELS } from '../domain/sessions';
import { MEDALS, SESSION_TYPES, type Competition, type Medal, type SessionType } from '../domain/types';

interface Props {
  /** The competition being edited; omit to log a new one. */
  initial?: Competition;
  today: string;
  onSubmit(input: CompetitionInput): string | null;
  onCancel(): void;
}

export function CompetitionForm({ initial, today, onSubmit, onCancel }: Props) {
  const id = useId();
  const [name, setName] = useState(initial?.name ?? '');
  const [date, setDate] = useState(initial?.date ?? today);
  const [type, setType] = useState<SessionType>(initial?.type ?? 'gi');
  const [division, setDivision] = useState(initial?.division ?? '');
  const [medal, setMedal] = useState<Medal | undefined>(initial?.medal);
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  // A competition that hasn't happened yet has no medal to record.
  const stillToCome = date > today;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(
      onSubmit({ name, date, type, division, medal: stillToCome ? undefined : medal, notes }),
    );
  };

  return (
    <form
      className="form"
      onSubmit={submit}
      aria-label={initial ? 'Edit competition' : 'Log competition'}
    >
      <div className="field">
        <label htmlFor={`${id}-name`}>Competition name</label>
        <input
          id={`${id}-name`}
          type="text"
          value={name}
          maxLength={MAX_NAME_LENGTH}
          autoComplete="off"
          required
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor={`${id}-date`}>Competition date</label>
        <input
          id={`${id}-date`}
          type="date"
          value={date}
          required
          aria-describedby={`${id}-date-hint`}
          onChange={(event) => setDate(event.target.value)}
        />
        <p className="hint" id={`${id}-date-hint`}>
          {stillToCome
            ? 'This will be listed as upcoming. You can add matches from the day.'
            : 'Use a future date for a competition you have entered.'}
        </p>
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
        <label htmlFor={`${id}-division`}>
          Division <span className="muted">(optional)</span>
        </label>
        <input
          id={`${id}-division`}
          type="text"
          value={division}
          maxLength={MAX_NAME_LENGTH}
          autoComplete="off"
          aria-describedby={`${id}-division-hint`}
          onChange={(event) => setDivision(event.target.value)}
        />
        <p className="hint" id={`${id}-division-hint`}>
          For example: Adult, blue belt, middleweight.
        </p>
      </div>
      {!stillToCome && (
        <fieldset className="choices">
          <legend>Medal</legend>
          <div className="choices__row">
            <label className="chip">
              <input
                type="radio"
                name={`${id}-medal`}
                checked={medal === undefined}
                onChange={() => setMedal(undefined)}
              />
              No medal
            </label>
            {MEDALS.map((option) => (
              <label key={option} className="chip">
                <input
                  type="radio"
                  name={`${id}-medal`}
                  checked={medal === option}
                  onChange={() => setMedal(option)}
                />
                {MEDAL_LABELS[option]}
              </label>
            ))}
          </div>
        </fieldset>
      )}
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
          {initial ? 'Save changes' : 'Save competition'}
        </button>
        <button type="button" className="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
