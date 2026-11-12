import { useId, useState, type FormEvent } from 'react';
import { MAX_NOTES_LENGTH } from '../domain/sessions';
import {
  MAX_LINK_LENGTH,
  MAX_TECHNIQUE_NAME_LENGTH,
  POSITION_LABELS,
  STATUS_LABELS,
  type TechniqueInput,
} from '../domain/techniques';
import {
  POSITIONS,
  TECHNIQUE_STATUSES,
  type Position,
  type Technique,
  type TechniqueStatus,
} from '../domain/types';

interface Props {
  /** The technique being edited; omit to add a new one. */
  initial?: Technique;
  onSubmit(input: TechniqueInput): string | null;
  onCancel(): void;
}

export function TechniqueForm({ initial, onSubmit, onCancel }: Props) {
  const id = useId();
  const [name, setName] = useState(initial?.name ?? '');
  const [position, setPosition] = useState<Position | undefined>(initial?.position);
  const [status, setStatus] = useState<TechniqueStatus>(initial?.status ?? 'learning');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [link, setLink] = useState(initial?.link ?? '');
  const [error, setError] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    // An unchosen position reaches the rules as it is, and they ask for one.
    setError(onSubmit({ name, position: position as Position, status, notes, link }));
  };

  return (
    <form
      className="form"
      onSubmit={submit}
      aria-label={initial ? 'Edit technique' : 'Add technique'}
    >
      <div className="field">
        <label htmlFor={`${id}-name`}>Technique name</label>
        <input
          id={`${id}-name`}
          type="text"
          value={name}
          maxLength={MAX_TECHNIQUE_NAME_LENGTH}
          autoComplete="off"
          required
          aria-describedby={`${id}-name-hint`}
          onChange={(event) => setName(event.target.value)}
        />
        <p className="hint" id={`${id}-name-hint`}>
          For example: Knee cut pass, or Armbar from closed guard.
        </p>
      </div>
      <fieldset className="choices">
        <legend>Position</legend>
        <div className="choices__row">
          {POSITIONS.map((option) => (
            <label key={option} className="chip">
              <input
                type="radio"
                name={`${id}-position`}
                checked={position === option}
                onChange={() => setPosition(option)}
              />
              {POSITION_LABELS[option]}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="choices">
        <legend>How far along</legend>
        <div className="choices__row">
          {TECHNIQUE_STATUSES.map((option) => (
            <label key={option} className="chip">
              <input
                type="radio"
                name={`${id}-status`}
                checked={status === option}
                onChange={() => setStatus(option)}
              />
              {STATUS_LABELS[option]}
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
      <div className="field">
        <label htmlFor={`${id}-link`}>
          Link <span className="muted">(optional)</span>
        </label>
        <input
          id={`${id}-link`}
          type="text"
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoComplete="off"
          value={link}
          maxLength={MAX_LINK_LENGTH}
          aria-describedby={`${id}-link-hint`}
          onChange={(event) => setLink(event.target.value)}
        />
        <p className="hint" id={`${id}-link-hint`}>
          A web page about it, such as an instructional video.
        </p>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        <button type="submit" className="button button--primary">
          {initial ? 'Save changes' : 'Save technique'}
        </button>
        <button type="button" className="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
