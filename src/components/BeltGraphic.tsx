import { formatRank } from '../domain/rank';
import type { Rank } from '../domain/types';

interface Props {
  rank: Rank;
  size?: 'large' | 'small';
}

/** A belt drawn end-on: the coloured belt, its rank bar, and one tape stripe per stripe earned. */
export function BeltGraphic({ rank, size = 'large' }: Props) {
  return (
    <div className={`belt belt--${rank.belt} belt--${size}`} role="img" aria-label={formatRank(rank)}>
      <div className="belt__bar">
        {Array.from({ length: rank.stripes }, (_, index) => (
          <span key={index} className="belt__stripe" />
        ))}
      </div>
    </div>
  );
}
