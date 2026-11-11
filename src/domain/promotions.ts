import { formatDate, isIsoDate } from './dates';
import { formatRank, isValidRank, rankValue } from './rank';
import { newId, type AppData, type Promotion, type Rank, type Result } from './types';

export type PromotionInput = Omit<Promotion, 'id'>;

/** Oldest first; promotions on the same day are ordered by rank. */
export function sortPromotions(promotions: Promotion[]): Promotion[] {
  return [...promotions].sort(
    (a, b) => a.date.localeCompare(b.date) || rankValue(a) - rankValue(b),
  );
}

export function highestPromotion(promotions: Promotion[]): Promotion | null {
  return promotions.reduce<Promotion | null>(
    (best, p) => (best === null || rankValue(p) > rankValue(best) ? p : best),
    null,
  );
}

/**
 * Checks a promotion against the rest of the history. Back-dated entries are fine as long as
 * the history still climbs: a higher rank can never be dated before a lower one.
 */
export function validatePromotion(
  input: PromotionInput,
  others: Promotion[],
  today: string,
): string | null {
  if (!isValidRank(input)) return 'Choose a belt and between 0 and 4 stripes.';
  if (!isIsoDate(input.date)) return 'Enter a valid promotion date.';
  if (input.date > today) return "A promotion can't be dated in the future.";

  const value = rankValue(input);
  for (const other of others) {
    const otherValue = rankValue(other);
    const otherLabel = `${formatRank(other)} (${formatDate(other.date)})`;
    if (otherValue === value) {
      return `You've already logged ${otherLabel}.`;
    }
    if (otherValue < value && other.date > input.date) {
      return `${formatRank(input)} can't be dated before ${otherLabel}.`;
    }
    if (otherValue > value && other.date < input.date) {
      return `${formatRank(input)} can't be dated after ${otherLabel}.`;
    }
  }
  return null;
}

function clean(input: PromotionInput): PromotionInput {
  const promotedBy = input.promotedBy?.trim();
  const academy = input.academy?.trim();
  return {
    belt: input.belt,
    stripes: input.stripes,
    date: input.date,
    ...(promotedBy ? { promotedBy } : {}),
    ...(academy ? { academy } : {}),
  };
}

/** A logged promotion can raise the current rank but never lowers it. */
function raiseRank(current: Rank | null, promotions: Promotion[]): Rank | null {
  const top = highestPromotion(promotions);
  if (!top) return current;
  if (current && rankValue(current) >= rankValue(top)) return current;
  return { belt: top.belt, stripes: top.stripes };
}

export function addPromotion(
  data: AppData,
  input: PromotionInput,
  today: string,
): Result<AppData> {
  const error = validatePromotion(input, data.promotions, today);
  if (error) return { ok: false, error };
  const promotions = [...data.promotions, { id: newId(), ...clean(input) }];
  return { ok: true, value: { ...data, promotions, rank: raiseRank(data.rank, promotions) } };
}

export function updatePromotion(
  data: AppData,
  id: string,
  input: PromotionInput,
  today: string,
): Result<AppData> {
  if (!data.promotions.some((p) => p.id === id)) {
    return { ok: false, error: 'That promotion no longer exists.' };
  }
  const others = data.promotions.filter((p) => p.id !== id);
  const error = validatePromotion(input, others, today);
  if (error) return { ok: false, error };
  const promotions = data.promotions.map((p) => (p.id === id ? { id, ...clean(input) } : p));
  return { ok: true, value: { ...data, promotions, rank: raiseRank(data.rank, promotions) } };
}

/** Deleting leaves the current rank alone; the practitioner can correct it by hand. */
export function deletePromotion(data: AppData, id: string): AppData {
  return { ...data, promotions: data.promotions.filter((p) => p.id !== id) };
}

export function setRank(data: AppData, rank: Rank): Result<AppData> {
  if (!isValidRank(rank)) {
    return { ok: false, error: 'Choose a belt and between 0 and 4 stripes.' };
  }
  const top = highestPromotion(data.promotions);
  if (top && rankValue(rank) < rankValue(top)) {
    return {
      ok: false,
      error: `Your history has a promotion to ${formatRank(top)}. Delete it from the timeline first if it was a mistake.`,
    };
  }
  return { ok: true, value: { ...data, rank: { belt: rank.belt, stripes: rank.stripes } } };
}
