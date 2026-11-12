import { useId, useState, type FormEvent } from 'react';
import {
  MAX_NOTES_LENGTH,
  MAX_ROUNDS,
  withTypedName,
  SESSION_KIND_LABELS,
  SESSION_TYPE_LABELS,
  type SessionDefaults,
  type SessionInput,
} from '../domain/sessions';
import {
  SESSION_KINDS,
  SESSION_TYPES,
  type Session,
  type SessionType,
  type Technique,
} from '../domain/types';
import { CaughtPicker } from './CaughtPicker';
import { TechniquePicker } from './TechniquePicker';

interface Props {
  /** The session being edited; omit to log a new one. */
  initial?: Session;
  /** Duration, type and kind pre-filled for a new session. */
  defaults: SessionDefaults;
  /** The journal, so the techniques worked on can be ticked. */
  techniques: Technique[];
  /** What the practitioner has been caught with before, most common first. */
  caughtBefore: string[];
  today: string;
  onSubmit(input: SessionInput): string | null;
  onCancel?(): void;
}

const DURATION_PRESETS = [60, 90, 120];

export function SessionForm({
  initial,
  defaults,
  techniques,
  caughtBefore,
  today,
  onSubmit,
  onCancel,
}: Props) {
  const id = useId();
  const [date, setDate] = useState(initial?.date ?? today);
  const [duration, setDuration] = useState(String(initial?.durationMinutes ?? defaults.durationMinutes));
  const [type, setType] = useState<SessionType>(initial?.type ?? defaults.type);
  // A session saved before kinds were recorded keeps none until one is chosen.
  const [kind, setKind] = useState(initial ? initial.kind : defaults.kind);
  const [rounds, setRounds] = useState(initial?.rounds === undefined ? '' : String(initial.rounds));
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [techniqueIds, setTechniqueIds] = useState(initial?.techniqueIds ?? []);
  const [landedIds, setLandedIds] = useState(initial?.landedIds ?? []);
  const [caughtWith, setCaughtWith] = useState(initial?.caughtWith ?? []);
  const [caughtTyped, setCaughtTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const minutes = Number(duration);
    const problem = onSubmit({
      date,
      durationMinutes: minutes,
      type,
      kind,
      rounds: rounds.trim() === '' ? undefined : Number(rounds),
      notes,
      techniqueIds,
      landedIds,
      // A name typed but not added with the button is still meant for this session.
      caughtWith: withTypedName(caughtWith, caughtTyped, caughtBefore),
    });
    setError(problem);
    // A new session keeps its date, duration, type and kind so the next class can be logged
    // straight away. The rounds, notes and techniques belong to the class just logged, so they
    // are cleared.
    setSaved(problem || initial ? null : `Logged ${minutes} min ${SESSION_TYPE_LABELS[type]} session.`);
    if (!problem && !initial) {
      setRounds('');
      setNotes('');
      setTechniqueIds([]);
      setLandedIds([]);
      setCaughtWith([]);
      setCaughtTyped('');
    }
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
      <fieldset className="choices">
        <legend>Kind</legend>
        <div className="choices__row">
          {SESSION_KINDS.map((option) => (
            <label key={option} className="chip">
              <input
                type="radio"
                name={`${id}-kind`}
                checked={kind === option}
                onChange={() => setKind(option)}
              />
              {SESSION_KIND_LABELS[option]}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="field">
        <label htmlFor={`${id}-rounds`}>
          Rounds rolled <span className="muted">(optional)</span>
        </label>
        <input
          id={`${id}-rounds`}
          type="number"
          inputMode="numeric"
          min={0}
          max={MAX_ROUNDS}
          step={1}
          value={rounds}
          onChange={(event) => setRounds(event.target.value)}
        />
      </div>
      <TechniquePicker techniques={techniques} selected={techniqueIds} onChange={setTechniqueIds} />
      <TechniquePicker
        techniques={techniques}
        selected={landedIds}
        onChange={setLandedIds}
        legend="Landed in rolling"
        // What was worked on today, and what already lands, are the likely ones.
        likely={(technique) =>
          techniqueIds.includes(technique.id) || technique.status === 'landing'
        }
      />
      <CaughtPicker
        suggestions={caughtBefore}
        selected={caughtWith}
        onChange={setCaughtWith}
        typed={caughtTyped}
        onTypedChange={setCaughtTyped}
      />
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
