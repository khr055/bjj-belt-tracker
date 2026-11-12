import { BELTS, MAX_DEGREES, MAX_STRIPES, type Belt, type Rank } from './types';

export const BELT_LABELS: Record<Belt, string> = {
  white: 'White',
  blue: 'Blue',
  purple: 'Purple',
  brown: 'Brown',
  black: 'Black',
};

/** The most stripes a belt holds: four on a coloured belt, six degrees on a black belt. */
export function maxStripes(belt: Belt): number {
  return belt === 'black' ? MAX_DEGREES : MAX_STRIPES;
}

const ORDINALS = ['', '1st', '2nd', '3rd', '4th', '5th', '6th'];

/** "1st", "2nd" and so on, for a black belt degree. */
export function ordinal(degree: number): string {
  return ORDINALS[degree] ?? `${degree}th`;
}

export const INVALID_RANK =
  'Choose a belt and its stripes: up to 4 on a coloured belt, or up to 6 degrees on a black belt.';

/**
 * Orders every belt/stripe combination from white with no stripes upwards. Black is the top
 * belt, so its extra degrees do not run into another belt's values.
 */
export function rankValue(rank: Rank): number {
  return BELTS.indexOf(rank.belt) * (MAX_STRIPES + 1) + rank.stripes;
}

export function isValidRank(rank: { belt?: unknown; stripes?: unknown }): boolean {
  return (
    BELTS.includes(rank.belt as Belt) &&
    Number.isInteger(rank.stripes) &&
    (rank.stripes as number) >= 0 &&
    (rank.stripes as number) <= maxStripes(rank.belt as Belt)
  );
}

export function formatRank(rank: Rank): string {
  const belt = `${BELT_LABELS[rank.belt]} belt`;
  if (rank.stripes === 0) return belt;
  if (rank.belt === 'black') return `${belt}, ${ordinal(rank.stripes)} degree`;
  return `${belt}, ${rank.stripes} ${rank.stripes === 1 ? 'stripe' : 'stripes'}`;
}

/** The rank a practitioner would normally be promoted to next. */
export function nextRank(rank: Rank): Rank {
  if (rank.stripes < maxStripes(rank.belt)) return { belt: rank.belt, stripes: rank.stripes + 1 };
  const nextBelt = BELTS[BELTS.indexOf(rank.belt) + 1];
  return nextBelt ? { belt: nextBelt, stripes: 0 } : rank;
}
