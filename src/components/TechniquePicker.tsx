import { useState } from 'react';
import { isWorkingOn, sortTechniques } from '../domain/techniques';
import type { Technique } from '../domain/types';

interface Props {
  techniques: Technique[];
  selected: string[];
  onChange(ids: string[]): void;
}

/**
 * Ticks the techniques a session worked on. The ones being worked on are offered first, since
 * those are the likely ones; the rest are a tap away.
 */
export function TechniquePicker({ techniques, selected, onChange }: Props) {
  const [showAll, setShowAll] = useState(false);
  if (techniques.length === 0) return null;

  const sorted = sortTechniques(techniques);
  const offered = sorted.filter(
    (technique) => isWorkingOn(technique) || selected.includes(technique.id),
  );
  // With nothing being worked on there would be nothing to tick, so everything is shown.
  const everything = showAll || offered.length === 0;
  const shown = everything ? sorted : offered;
  const hidden = sorted.length - shown.length;

  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((other) => other !== id) : [...selected, id]);

  return (
    <fieldset className="choices">
      <legend>
        Techniques worked on <span className="muted">(optional)</span>
      </legend>
      <div className="choices__row">
        {shown.map((technique) => (
          <label key={technique.id} className="chip chip--wrap">
            <input
              type="checkbox"
              checked={selected.includes(technique.id)}
              onChange={() => toggle(technique.id)}
            />
            {technique.name}
          </label>
        ))}
        {hidden > 0 && (
          <button type="button" className="chip chip--button" onClick={() => setShowAll(true)}>
            Show {hidden} more
          </button>
        )}
      </div>
    </fieldset>
  );
}
