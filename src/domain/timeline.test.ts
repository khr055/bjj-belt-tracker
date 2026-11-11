import { describe, expect, it } from 'vitest';
import { buildTimeline } from './timeline';
import type { Promotion } from './types';

const TODAY = '2026-11-11';

const HISTORY: Promotion[] = [
  { id: 'purple', belt: 'purple', stripes: 0, date: '2025-05-10' },
  { id: 'start', belt: 'white', stripes: 0, date: '2020-01-06' },
  { id: 'blue', belt: 'blue', stripes: 0, date: '2022-03-01' },
  { id: 'blue-1', belt: 'blue', stripes: 1, date: '2023-02-01' },
];

describe('buildTimeline', () => {
  it('orders promotions and ends each one where the next begins', () => {
    const { entries } = buildTimeline(HISTORY, { belt: 'purple', stripes: 0 }, TODAY);
    expect(entries.map((e) => [e.promotion.id, e.kind, e.endDate, e.ongoing])).toEqual([
      ['start', 'start', '2022-03-01', false],
      ['blue', 'belt', '2023-02-01', false],
      ['blue-1', 'stripe', '2025-05-10', false],
      ['purple', 'belt', TODAY, true],
    ]);
  });

  it('spans each belt from its first promotion to the next belt', () => {
    const timeline = buildTimeline(HISTORY, { belt: 'purple', stripes: 0 }, TODAY);
    expect(timeline.belts).toEqual([
      { belt: 'white', startDate: '2020-01-06', endDate: '2022-03-01', ongoing: false },
      { belt: 'blue', startDate: '2022-03-01', endDate: '2025-05-10', ongoing: false },
      { belt: 'purple', startDate: '2025-05-10', endDate: TODAY, ongoing: true },
    ]);
    expect(timeline.currentBeltSince).toBe('2025-05-10');
    expect(timeline.currentRankUndated).toBe(false);
  });

  it('keeps the current belt running when only a newer stripe is undated', () => {
    const timeline = buildTimeline(HISTORY, { belt: 'purple', stripes: 2 }, TODAY);
    expect(timeline.currentRankUndated).toBe(true);
    expect(timeline.entries.at(-1)).toMatchObject({ endDate: null, ongoing: false });
    expect(timeline.belts.at(-1)).toMatchObject({ belt: 'purple', endDate: TODAY, ongoing: true });
    expect(timeline.currentBeltSince).toBe('2025-05-10');
  });

  it('leaves the last belt open-ended when the current belt has no logged date', () => {
    const timeline = buildTimeline(HISTORY, { belt: 'brown', stripes: 0 }, TODAY);
    expect(timeline.currentRankUndated).toBe(true);
    expect(timeline.belts.at(-1)).toMatchObject({ belt: 'purple', endDate: null, ongoing: false });
    expect(timeline.currentBeltSince).toBeNull();
  });

  it('handles an empty history', () => {
    expect(buildTimeline([], null, TODAY)).toEqual({
      entries: [],
      belts: [],
      currentRankUndated: false,
      currentBeltSince: null,
    });
    expect(buildTimeline([], { belt: 'blue', stripes: 1 }, TODAY).currentRankUndated).toBe(true);
  });
});
