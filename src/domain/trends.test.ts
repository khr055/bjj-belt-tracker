import { describe, expect, it } from 'vitest';
import { addDays, formatShortDate, weekStart } from './dates';
import { axisMax, weeklyAverage, weeklyStreak, weeklyTotals } from './trends';
import type { Session } from './types';

// Wednesday. Its week starts on Monday 9 Nov 2026.
const TODAY = '2026-11-11';

let nextId = 0;
function session(date: string, durationMinutes = 60): Session {
  nextId += 1;
  return { id: `s${nextId}`, date, durationMinutes, type: 'gi' };
}

describe('week helpers', () => {
  it('finds the Monday of any day in the week', () => {
    expect(weekStart('2026-11-09')).toBe('2026-11-09'); // Monday
    expect(weekStart('2026-11-11')).toBe('2026-11-09'); // Wednesday
    expect(weekStart('2026-11-15')).toBe('2026-11-09'); // Sunday
    expect(weekStart('2026-11-16')).toBe('2026-11-16'); // next Monday
    expect(weekStart('2027-01-01')).toBe('2026-12-28'); // across a year boundary
  });

  it('adds and subtracts days across months', () => {
    expect(addDays('2026-11-09', -7)).toBe('2026-11-02');
    expect(addDays('2026-11-02', -7)).toBe('2026-10-26');
    expect(addDays('2026-02-27', 3)).toBe('2026-03-02');
  });

  it('formats a date without its year', () => {
    expect(formatShortDate('2026-11-09')).toBe('9 Nov');
  });
});

describe('weeklyTotals', () => {
  it('returns one entry per week, oldest first, ending with the current week', () => {
    const totals = weeklyTotals([], TODAY);
    expect(totals).toHaveLength(8);
    expect(totals[0]).toEqual({ weekStart: '2026-09-21', sessions: 0, minutes: 0, current: false });
    expect(totals[7]).toEqual({ weekStart: '2026-11-09', sessions: 0, minutes: 0, current: true });
  });

  it('counts sessions and minutes in the week they fall in', () => {
    const totals = weeklyTotals(
      [
        session('2026-11-09', 90), // Monday, this week
        session('2026-11-11', 60), // today
        session('2026-11-08', 60), // Sunday, last week
        session('2026-11-02', 45), // Monday, last week
        session('2026-01-05', 60), // long before the window
      ],
      TODAY,
    );
    expect(totals[7]).toMatchObject({ sessions: 2, minutes: 150 });
    expect(totals[6]).toMatchObject({ weekStart: '2026-11-02', sessions: 2, minutes: 105 });
    expect(totals.slice(0, 6).every((week) => week.sessions === 0)).toBe(true);
  });
});

describe('weeklyStreak', () => {
  it('is zero with no sessions', () => {
    expect(weeklyStreak([], TODAY)).toEqual({ weeks: 0, thisWeekLogged: false });
  });

  it('counts consecutive weeks ending this week', () => {
    const sessions = [session('2026-11-10'), session('2026-11-04'), session('2026-10-28')];
    expect(weeklyStreak(sessions, TODAY)).toEqual({ weeks: 3, thisWeekLogged: true });
  });

  it('stays alive when this week has no session yet', () => {
    const sessions = [session('2026-11-04'), session('2026-10-28')];
    expect(weeklyStreak(sessions, TODAY)).toEqual({ weeks: 2, thisWeekLogged: false });
  });

  it('stops at the first week with no session', () => {
    const sessions = [session('2026-11-10'), session('2026-11-04'), session('2026-10-21')];
    expect(weeklyStreak(sessions, TODAY).weeks).toBe(2);
  });

  it('is broken once a whole week has been missed', () => {
    expect(weeklyStreak([session('2026-10-28')], TODAY)).toEqual({ weeks: 0, thisWeekLogged: false });
  });

  it('counts several sessions in one week once', () => {
    const sessions = [session('2026-11-09'), session('2026-11-10'), session('2026-11-11')];
    expect(weeklyStreak(sessions, TODAY).weeks).toBe(1);
  });
});

describe('weeklyAverage', () => {
  it('is unknown until a full week has passed since the first session', () => {
    expect(weeklyAverage([], TODAY)).toBeNull();
    expect(weeklyAverage([session('2026-11-10')], TODAY)).toBeNull();
  });

  it('averages finished weeks only, from the first session onwards', () => {
    const sessions = [
      session('2026-10-27'), // week of 26 Oct
      session('2026-10-29'),
      session('2026-10-30'),
      session('2026-11-03'), // week of 2 Nov
      session('2026-11-10'), // this week: left out
    ];
    expect(weeklyAverage(sessions, TODAY)).toEqual({ sessions: 2, weeks: 2 });
  });

  it('covers at most the finished weeks in the window, counting empty ones', () => {
    const sessions = [session('2026-01-05'), session('2026-11-03'), session('2026-11-05')];
    expect(weeklyAverage(sessions, TODAY)).toEqual({ sessions: 2 / 7, weeks: 7 });
  });
});

describe('axisMax', () => {
  it('rounds up to an even number of at least 2', () => {
    expect(axisMax([])).toBe(2);
    expect(axisMax([0, 1])).toBe(2);
    expect(axisMax([2, 3])).toBe(4);
    expect(axisMax([4])).toBe(4);
    expect(axisMax([7, 2])).toBe(8);
  });
});
