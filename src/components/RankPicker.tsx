import { useId } from 'react';
import { BELT_LABELS } from '../domain/rank';
import { BELTS, MAX_STRIPES, type Rank } from '../domain/types';

interface Props {
  value: Rank;
  onChange(rank: Rank): void;
}

const STRIPE_COUNTS = Array.from({ length: MAX_STRIPES + 1 }, (_, index) => index);

export function RankPicker({ value, onChange }: Props) {
  const name = useId();
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
                onChange={() => onChange({ ...value, belt })}
              />
              <span className={`chip__swatch chip__swatch--${belt}`} aria-hidden="true" />
              {BELT_LABELS[belt]}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="choices">
        <legend>Stripes</legend>
        <div className="choices__row">
          {STRIPE_COUNTS.map((stripes) => (
            <label key={stripes} className="chip chip--number">
              <input
                type="radio"
                name={`${name}-stripes`}
                aria-label={stripes === 1 ? '1 stripe' : `${stripes} stripes`}
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
