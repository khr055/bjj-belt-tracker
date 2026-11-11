import { BELTS, MAX_STRIPES, type Belt, type Rank } from './types';

export const BELT_LABELS: Record<Belt, string> = {
  white: 'White',
  blue: 'Blue',
  purple: 'Purple',
  brown: 'Brown',
  black: 'Black',
};

/** Orders every belt/stripe combination from white with no stripes upwards. */
export function rankValue(rank: Rank): number {
  return BELTS.indexOf(rank.belt) * (MAX_STRIPES + 1) + rank.stripes;
}

export function isValidRank(rank: { belt?: unknown; stripes?: unknown }): boolean {
  return (
    BELTS.includes(rank.belt as Belt) &&
    Number.isInteger(rank.stripes) &&
    (rank.stripes as number) >= 0 &&
    (rank.stripes as number) <= MAX_STRIPES
  );
}

export function formatRank(rank: Rank): string {
  const belt = `${BELT_LABELS[rank.belt]} belt`;
  if (rank.stripes === 0) return belt;
  return `${belt}, ${rank.stripes} ${rank.stripes === 1 ? 'stripe' : 'stripes'}`;
}

/** The rank a practitioner would normally be promoted to next. */
export function nextRank(rank: Rank): Rank {
  if (rank.stripes < MAX_STRIPES) return { belt: rank.belt, stripes: rank.stripes + 1 };
  const nextBelt = BELTS[BELTS.indexOf(rank.belt) + 1];
  return nextBelt ? { belt: nextBelt, stripes: 0 } : rank;
}
