import { useId, useState, type KeyboardEvent } from 'react';
import { MAX_CAUGHT, MAX_CAUGHT_LENGTH, sameName } from '../domain/sessions';

interface Props {
  /** Names used on earlier sessions, most common first, offered as one-tap choices. */
  suggestions: string[];
  selected: string[];
  onChange(names: string[]): void;
}

/** Suggestions shown before the rest are asked for. */
const OFFERED = 6;

/**
 * Records what the practitioner was caught with in rolling. These are the other person's
 * submissions, so they are plain names and not techniques from the journal; names used before
 * are offered so the same one is spelt the same way each time.
 */
export function CaughtPicker({ suggestions, selected, onChange }: Props) {
  const id = useId();
  const [text, setText] = useState('');
  const isSelected = (name: string) => selected.some((other) => sameName(other, name));
  // What is ticked is always shown, whether or not it was suggested.
  const shown = [
    ...suggestions.slice(0, OFFERED),
    ...selected.filter((name) => !suggestions.slice(0, OFFERED).some((s) => sameName(s, name))),
  ];
  const full = selected.length >= MAX_CAUGHT;

  const toggle = (name: string) =>
    onChange(
      isSelected(name) ? selected.filter((other) => !sameName(other, name)) : [...selected, name],
    );

  const add = () => {
    const name = text.trim().replace(/\s+/g, ' ');
    if (!name || full) return;
    // A name used before keeps the spelling it already has.
    const known = suggestions.find((other) => sameName(other, name)) ?? name;
    if (!isSelected(known)) onChange([...selected, known]);
    setText('');
  };

  // Enter adds the name; it must not log the whole session.
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    add();
  };

  return (
    <fieldset className="choices">
      <legend>
        Caught with <span className="muted">(optional)</span>
      </legend>
      {shown.length > 0 && (
        <div className="choices__row">
          {shown.map((name) => (
            <label key={name.toLowerCase()} className="chip chip--wrap">
              <input
                type="checkbox"
                checked={isSelected(name)}
                disabled={full && !isSelected(name)}
                onChange={() => toggle(name)}
              />
              {name}
            </label>
          ))}
        </div>
      )}
      <div className="field-row field-row--add">
        <div className="field">
          <label htmlFor={`${id}-other`} className="muted">
            Add a submission you were caught with
          </label>
          <input
            id={`${id}-other`}
            type="text"
            value={text}
            maxLength={MAX_CAUGHT_LENGTH}
            autoComplete="off"
            disabled={full}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={onKeyDown}
          />
        </div>
        <button type="button" className="button button--small" disabled={full} onClick={add}>
          Add
        </button>
      </div>
    </fieldset>
  );
}
