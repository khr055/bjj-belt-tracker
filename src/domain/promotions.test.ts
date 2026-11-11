import { describe, expect, it } from 'vitest';
import {
  addPromotion,
  deletePromotion,
  setRank,
  sortPromotions,
  updatePromotion,
  type PromotionInput,
} from './promotions';
import { formatRank, nextRank, rankValue } from './rank';
import { emptyData, type AppData } from './types';

const TODAY = '2026-11-11';

function mustAdd(data: AppData, input: PromotionInput): AppData {
  const result = addPromotion(data, input, TODAY);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

function errorOf(result: { ok: boolean; error?: string }): string {
  if (result.ok) throw new Error('expected a rejection');
  return result.error ?? '';
}

describe('rank helpers', () => {
  it('orders stripes within a belt and belts above stripes', () => {
    expect(rankValue({ belt: 'white', stripes: 4 })).toBeLessThan(
      rankValue({ belt: 'blue', stripes: 0 }),
    );
    expect(rankValue({ belt: 'blue', stripes: 1 })).toBeLessThan(
      rankValue({ belt: 'blue', stripes: 2 }),
    );
  });

  it('formats ranks', () => {
    expect(formatRank({ belt: 'blue', stripes: 0 })).toBe('Blue belt');
    expect(formatRank({ belt: 'blue', stripes: 1 })).toBe('Blue belt, 1 stripe');
    expect(formatRank({ belt: 'purple', stripes: 3 })).toBe('Purple belt, 3 stripes');
  });

  it('suggests the next rank', () => {
    expect(nextRank({ belt: 'white', stripes: 2 })).toEqual({ belt: 'white', stripes: 3 });
    expect(nextRank({ belt: 'white', stripes: 4 })).toEqual({ belt: 'blue', stripes: 0 });
    expect(nextRank({ belt: 'black', stripes: 4 })).toEqual({ belt: 'black', stripes: 4 });
  });
});

describe('setRank', () => {
  it('sets and edits the current rank', () => {
    const first = setRank(emptyData(), { belt: 'blue', stripes: 2 });
    expect(first.ok && first.value.rank).toEqual({ belt: 'blue', stripes: 2 });
    const second = first.ok ? setRank(first.value, { belt: 'white', stripes: 4 }) : first;
    expect(second.ok && second.value.rank).toEqual({ belt: 'white', stripes: 4 });
  });

  it('rejects stripe counts outside 0 to 4', () => {
    expect(setRank(emptyData(), { belt: 'blue', stripes: 5 }).ok).toBe(false);
    expect(setRank(emptyData(), { belt: 'blue', stripes: -1 }).ok).toBe(false);
    expect(setRank(emptyData(), { belt: 'blue', stripes: 1.5 }).ok).toBe(false);
  });

  it('refuses to drop below the highest logged promotion', () => {
    const data = mustAdd(emptyData(), { belt: 'purple', stripes: 0, date: '2025-01-10' });
    expect(errorOf(setRank(data, { belt: 'blue', stripes: 4 }))).toContain('Purple belt');
    expect(setRank(data, { belt: 'purple', stripes: 1 }).ok).toBe(true);
  });
});

describe('addPromotion', () => {
  it('updates the current rank when the promotion is higher', () => {
    const start: AppData = { ...emptyData(), rank: { belt: 'white', stripes: 3 } };
    const data = mustAdd(start, {
      belt: 'white',
      stripes: 4,
      date: '2026-05-01',
      promotedBy: '  Professor Silva ',
      academy: ' ',
    });
    expect(data.rank).toEqual({ belt: 'white', stripes: 4 });
    expect(data.promotions[0]).toMatchObject({ promotedBy: 'Professor Silva' });
    expect(data.promotions[0]).not.toHaveProperty('academy');
  });

  it('accepts back-dated promotions without lowering the current rank', () => {
    const start: AppData = { ...emptyData(), rank: { belt: 'purple', stripes: 1 } };
    let data = mustAdd(start, { belt: 'purple', stripes: 0, date: '2024-06-01' });
    data = mustAdd(data, { belt: 'blue', stripes: 0, date: '2021-03-15' });
    data = mustAdd(data, { belt: 'white', stripes: 0, date: '2019-09-01' });
    expect(data.rank).toEqual({ belt: 'purple', stripes: 1 });
    expect(sortPromotions(data.promotions).map((p) => p.belt)).toEqual(['white', 'blue', 'purple']);
  });

  it('rejects a higher rank dated before a lower one', () => {
    const data = mustAdd(emptyData(), { belt: 'blue', stripes: 0, date: '2022-06-01' });
    const result = addPromotion(data, { belt: 'purple', stripes: 0, date: '2022-01-01' }, TODAY);
    expect(errorOf(result)).toBe("Purple belt can't be dated before Blue belt (1 Jun 2022).");
  });

  it('rejects a lower rank dated after a higher one', () => {
    const data = mustAdd(emptyData(), { belt: 'purple', stripes: 0, date: '2024-01-01' });
    const result = addPromotion(data, { belt: 'blue', stripes: 2, date: '2024-06-01' }, TODAY);
    expect(errorOf(result)).toContain("can't be dated after Purple belt");
  });

  it('rejects logging the same rank twice', () => {
    const data = mustAdd(emptyData(), { belt: 'blue', stripes: 1, date: '2023-01-01' });
    const result = addPromotion(data, { belt: 'blue', stripes: 1, date: '2023-02-01' }, TODAY);
    expect(errorOf(result)).toContain("already logged");
  });

  it('allows two different promotions on the same day', () => {
    let data = mustAdd(emptyData(), { belt: 'white', stripes: 3, date: '2023-01-01' });
    data = mustAdd(data, { belt: 'white', stripes: 4, date: '2023-01-01' });
    expect(sortPromotions(data.promotions).map((p) => p.stripes)).toEqual([3, 4]);
  });

  it('rejects future and malformed dates', () => {
    expect(
      errorOf(addPromotion(emptyData(), { belt: 'blue', stripes: 0, date: '2026-11-12' }, TODAY)),
    ).toContain('future');
    expect(
      errorOf(addPromotion(emptyData(), { belt: 'blue', stripes: 0, date: '2026-02-30' }, TODAY)),
    ).toContain('valid promotion date');
    expect(addPromotion(emptyData(), { belt: 'blue', stripes: 0, date: TODAY }, TODAY).ok).toBe(true);
  });
});

describe('updatePromotion and deletePromotion', () => {
  it('validates an edit against the other promotions, not itself', () => {
    let data = mustAdd(emptyData(), { belt: 'blue', stripes: 0, date: '2022-06-01' });
    data = mustAdd(data, { belt: 'purple', stripes: 0, date: '2024-06-01' });
    const blue = data.promotions[0];

    const moved = updatePromotion(data, blue.id, { belt: 'blue', stripes: 0, date: '2022-07-01' }, TODAY);
    expect(moved.ok && moved.value.promotions[0].date).toBe('2022-07-01');

    const tooLate = updatePromotion(data, blue.id, { belt: 'blue', stripes: 0, date: '2025-01-01' }, TODAY);
    expect(errorOf(tooLate)).toContain("can't be dated after Purple belt");
  });

  it('keeps the current rank when a promotion is deleted', () => {
    const data = mustAdd(emptyData(), { belt: 'blue', stripes: 0, date: '2022-06-01' });
    const after = deletePromotion(data, data.promotions[0].id);
    expect(after.promotions).toEqual([]);
    expect(after.rank).toEqual({ belt: 'blue', stripes: 0 });
  });
});
