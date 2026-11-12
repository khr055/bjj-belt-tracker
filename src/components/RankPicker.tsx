import { useId } from 'react';
import { BELT_LABELS, maxStripes } from '../domain/rank';
import { BELTS, type Rank } from '../domain/types';

interface Props {
  value: Rank;
  onChange(rank: Rank): void;
}

export function RankPicker({ value, onChange }: Props) {
  const name = useId();
  // A black belt holds degrees, and more of them than a coloured belt holds stripes.
  const black = value.belt === 'black';
  const unit = black ? 'degree' : 'stripe';
  const counts = Array.from({ length: maxStripes(value.belt) + 1 }, (_, index) => index);
  return (
    <>
      <fieldset className="choices">
        <legend>Belt</legend>
        <div className="choices__row">
          {BELTS.map((belt) => (
            <label key={belt} className="chip">
              <input
                type="radio"
                name={`${name}-belt`}
                checked={value.belt === belt}
                // Stripes a new belt cannot hold are brought down to the most it can.
                onChange={() =>
                  onChange({ belt, stripes: Math.min(value.stripes, maxStripes(belt)) })
                }
              />
              <span className={`chip__swatch chip__swatch--${belt}`} aria-hidden="true" />
              {BELT_LABELS[belt]}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="choices">
        <legend>{black ? 'Degrees' : 'Stripes'}</legend>
        <div className="choices__row">
          {counts.map((stripes) => (
            <label key={stripes} className="chip chip--number">
              <input
                type="radio"
                name={`${name}-stripes`}
                aria-label={stripes === 1 ? `1 ${unit}` : `${stripes} ${unit}s`}
                checked={value.stripes === stripes}
                onChange={() => onChange({ ...value, stripes })}
              />
              {stripes}
            </label>
          ))}
        </div>
      </fieldset>
    </>
  );
}
