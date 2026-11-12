import { addMonths, daysBetween } from './dates';
import { sortPromotions } from './promotions';
import { BELTS, MAX_DEGREES, type Belt, type Promotion, type Rank } from './types';

/**
 * Minimum time IBJJF requires at each adult belt before the next one (General System of
 * Graduation). White belt has no minimum. Black belt degrees have their own schedule, below.
 */
export const MINIMUM_MONTHS: Partial<Record<Belt, number>> = {
  blue: 24,
  purple: 18,
  brown: 12,
};

export const MINIMUM_LABELS: Partial<Record<Belt, string>> = {
  blue: '2 years',
  purple: '18 months',
  brown: '1 year',
};

export type TimeInGrade =
  /** Black belt: there is no next belt to work towards. */
  | { status: 'top-belt'; belt: Belt }
  /** White belt: IBJJF sets no minimum before the next belt. */
  | { status: 'no-minimum'; belt: Belt; nextBelt: Belt }
  /** No promotion at the current belt has been logged, so there is no start date. */
  | { status: 'start-unknown'; belt: Belt; nextBelt: Belt; requiredMonths: number }
  | {
      status: 'serving' | 'met';
      belt: Belt;
      nextBelt: Belt;
      requiredMonths: number;
      since: string;
      /** First day the minimum is satisfied. */
      eligibleOn: string;
      /** Share of the minimum served so far, from 0 to 1. */
      progress: number;
      /**
       * True when the earliest entry at this belt is a stripe, not the belt itself. The belt
       * was earned on or before `since`, so `eligibleOn` is the latest possible date.
       */
      approximate: boolean;
    };

export function timeInGrade(
  rank: Rank,
  promotions: Promotion[],
  today: string,
): TimeInGrade {
  const { belt } = rank;
  const nextBelt = BELTS[BELTS.indexOf(belt) + 1];
  if (!nextBelt) return { status: 'top-belt', belt };

  const requiredMonths = MINIMUM_MONTHS[belt];
  if (requiredMonths === undefined) return { status: 'no-minimum', belt, nextBelt };

  const first = sortPromotions(promotions).find((p) => p.belt === belt);
  if (!first) return { status: 'start-unknown', belt, nextBelt, requiredMonths };

  const since = first.date;
  const eligibleOn = addMonths(since, requiredMonths);
  const met = today >= eligibleOn;
  return {
    status: met ? 'met' : 'serving',
    belt,
    nextBelt,
    requiredMonths,
    since,
    eligibleOn,
    progress: met ? 1 : daysBetween(since, today) / daysBetween(since, eligibleOn),
    approximate: first.stripes > 0,
  };
}

/**
 * Minimum time IBJJF requires at each black belt degree before the next, by the degree held:
 * three years each up to the 3rd degree, then five years each up to the 6th.
 */
export const DEGREE_MONTHS = [36, 36, 36, 60, 60, 60] as const;

/** "3 years" or "5 years". */
export function formatYears(months: number): string {
  const years = months / 12;
  return `${years} ${years === 1 ? 'year' : 'years'}`;
}

export type TimeInDegree =
  /** 6th degree: the next is the coral belt, which the app does not model. */
  | { status: 'top-degree'; degree: number }
  /** The promotion to the current degree has not been logged, so there is no start date. */
  | { status: 'start-unknown'; degree: number; nextDegree: number; requiredMonths: number }
  | {
      status: 'serving' | 'met';
      degree: number;
      nextDegree: number;
      requiredMonths: number;
      /** The day the current degree, or the black belt itself, was awarded. */
      since: string;
      /** First day the minimum is satisfied. */
      eligibleOn: string;
      /** Share of the minimum served so far, from 0 to 1. */
      progress: number;
    };

/** Progress towards the next black belt degree, or null below black belt. */
export function timeInDegree(
  rank: Rank,
  promotions: Promotion[],
  today: string,
): TimeInDegree | null {
  if (rank.belt !== 'black') return null;
  const degree = rank.stripes;
  if (degree >= MAX_DEGREES) return { status: 'top-degree', degree };

  const nextDegree = degree + 1;
  const requiredMonths = DEGREE_MONTHS[degree];
  const awarded = promotions.find((p) => p.belt === 'black' && p.stripes === degree);
  if (!awarded) return { status: 'start-unknown', degree, nextDegree, requiredMonths };

  const since = awarded.date;
  const eligibleOn = addMonths(since, requiredMonths);
  const met = today >= eligibleOn;
  return {
    status: met ? 'met' : 'serving',
    degree,
    nextDegree,
    requiredMonths,
    since,
    eligibleOn,
    progress: met ? 1 : daysBetween(since, today) / daysBetween(since, eligibleOn),
  };
}
