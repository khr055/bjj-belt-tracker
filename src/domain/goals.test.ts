import { describe, expect, it } from 'vitest';
import { goalProgress, goalRecord, setWeeklyGoal } from './goals';
import { emptyData, type Session } from './types';

// Wednesday. Its week starts on Monday 9 Nov 2026.
const TODAY = '2026-11-11';

let nextId = 0;
function session(date: string): Session {
  nextId += 1;
  return { id: `s${nextId}`, date, durationMinutes: 60, type: 'gi' };
}

describe('setWeeklyGoal', () => {
  it('sets, changes and clears the goal', () => {
    const set = setWeeklyGoal(emptyData(), 3);
    expect(set.ok && set.value.weeklyGoal).toBe(3);
    const cleared = setWeeklyGoal({ ...emptyData(), weeklyGoal: 3 }, null);
    expect(cleared.ok && cleared.value.weeklyGoal).toBeNull();
  });

  it.each([0, 8, 2.5, -1, Number.NaN])('rejects a goal of %s sessions', (goal) => {
    const result = setWeeklyGoal(emptyData(), goal);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain('between 1 and 7');
  });
});

describe('goalProgress', () => {
  it('counts only sessions in the current week', () => {
    const sessions = [session('2026-11-08'), session('2026-11-09'), session('2026-11-11')];
    expect(goalProgress(sessions, 3, TODAY)).toEqual({ goal: 3, done: 2, remaining: 1, met: false });
  });

  it('is met at the goal and stays met beyond it', () => {
    const sessions = [session('2026-11-09'), session('2026-11-10'), session('2026-11-11')];
    expect(goalProgress(sessions, 3, TODAY)).toEqual({ goal: 3, done: 3, remaining: 0, met: true });
    expect(goalProgress(sessions, 2, TODAY)).toEqual({ goal: 2, done: 3, remaining: 0, met: true });
  });

  it('starts from nothing each week', () => {
    expect(goalProgress([session('2026-11-08')], 2, TODAY)).toMatchObject({ done: 0, remaining: 2 });
  });
});

describe('goalRecord', () => {
  it('is unknown until a full week has passed since the first session', () => {
    expect(goalRecord([], 2, TODAY)).toBeNull();
    expect(goalRecord([session('2026-11-10')], 2, TODAY)).toBeNull();
  });

  it('counts the finished weeks that reached the goal, leaving out this week', () => {
    const sessions = [
      session('2026-10-20'), // week of 19 Oct: 1
      session('2026-10-27'), // week of 26 Oct: 2
      session('2026-10-29'),
      session('2026-11-03'), // week of 2 Nov: 3
      session('2026-11-04'),
      session('2026-11-05'),
      session('2026-11-09'), // this week: left out
      session('2026-11-10'),
    ];
    expect(goalRecord(sessions, 2, TODAY)).toEqual({ met: 2, weeks: 3 });
    expect(goalRecord(sessions, 3, TODAY)).toEqual({ met: 1, weeks: 3 });
  });
});
