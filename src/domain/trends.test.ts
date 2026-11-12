import { describe, expect, it } from 'vitest';
import { addDays, formatShortDate, weekStart } from './dates';
import {
  axisMax,
  finishedWeeks,
  metricValue,
  weeklyAverage,
  weeklyStreak,
  weeklyTotals,
} from './trends';
import type { Session, TimeOff } from './types';

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
    expect(totals[0]).toEqual({ weekStart: '2026-09-21', sessions: 0, minutes: 0, rounds: 0, off: false, current: false });
    expect(totals[7]).toEqual({ weekStart: '2026-11-09', sessions: 0, minutes: 0, rounds: 0, off: false, current: true });
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
    expect(weeklyStreak([], TODAY)).toEqual({ weeks: 0, thisWeekLogged: false, thisWeekOff: false, weeksOff: 0 });
  });

  it('counts consecutive weeks ending this week', () => {
    const sessions = [session('2026-11-10'), session('2026-11-04'), session('2026-10-28')];
    expect(weeklyStreak(sessions, TODAY)).toEqual({ weeks: 3, thisWeekLogged: true, thisWeekOff: false, weeksOff: 0 });
  });

  it('stays alive when this week has no session yet', () => {
    const sessions = [session('2026-11-04'), session('2026-10-28')];
    expect(weeklyStreak(sessions, TODAY)).toEqual({ weeks: 2, thisWeekLogged: false, thisWeekOff: false, weeksOff: 0 });
  });

  it('stops at the first week with no session', () => {
    const sessions = [session('2026-11-10'), session('2026-11-04'), session('2026-10-21')];
    expect(weeklyStreak(sessions, TODAY).weeks).toBe(2);
  });

  it('is broken once a whole week has been missed', () => {
    expect(weeklyStreak([session('2026-10-28')], TODAY)).toEqual({ weeks: 0, thisWeekLogged: false, thisWeekOff: false, weeksOff: 0 });
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

describe('time off in the trends', () => {
  const off = (startDate: string, endDate?: string): TimeOff => ({
    id: startDate,
    startDate,
    ...(endDate ? { endDate } : {}),
    reason: 'injury',
  });

  it('marks the weeks that include any time off', () => {
    // Thursday 22 Oct to Tuesday 27 Oct touches two weeks.
    const weeks = weeklyTotals([], TODAY, 4, [off('2026-10-22', '2026-10-27')]);
    expect(weeks.map((week) => [week.weekStart, week.off])).toEqual([
      ['2026-10-19', true],
      ['2026-10-26', true],
      ['2026-11-02', false],
      ['2026-11-09', false],
    ]);
  });

  it('carries a streak across weeks off with no session', () => {
    const sessions = [session('2026-11-10'), session('2026-10-14'), session('2026-10-07')];
    // Without the time off, missing the weeks of 19 Oct to 2 Nov ends the streak.
    expect(weeklyStreak(sessions, TODAY)).toMatchObject({ weeks: 1, weeksOff: 0 });
    expect(weeklyStreak(sessions, TODAY, [off('2026-10-19', '2026-11-08')])).toEqual({
      weeks: 3,
      thisWeekLogged: true,
      thisWeekOff: false,
      weeksOff: 3,
    });
  });

  it('still ends a streak at a missed week that was not time off', () => {
    const sessions = [session('2026-11-10'), session('2026-10-14')];
    // Only the week of 19 Oct is covered; 26 Oct and 2 Nov were simply missed.
    expect(weeklyStreak(sessions, TODAY, [off('2026-10-19', '2026-10-25')])).toMatchObject({
      weeks: 1,
      weeksOff: 0,
    });
  });

  it('counts a week off that was trained in anyway', () => {
    const sessions = [session('2026-11-10'), session('2026-11-04'), session('2026-10-28')];
    expect(weeklyStreak(sessions, TODAY, [off('2026-11-02', '2026-11-03')])).toMatchObject({
      weeks: 3,
      weeksOff: 0,
    });
  });

  it('holds the streak through time off that is still going on', () => {
    const sessions = [session('2026-10-21'), session('2026-10-14')];
    expect(weeklyStreak(sessions, TODAY, [off('2026-10-26')])).toEqual({
      weeks: 2,
      thisWeekLogged: false,
      thisWeekOff: true,
      // The weeks of 26 Oct and 2 Nov, and this one.
      weeksOff: 3,
    });
  });

  it('does not count time off from before the first session', () => {
    expect(weeklyStreak([session('2026-11-10')], TODAY, [off('2020-01-01', '2026-11-01')])).toEqual({
      weeks: 1,
      thisWeekLogged: true,
      thisWeekOff: false,
      weeksOff: 0,
    });
  });

  it('leaves weeks off out of the finished weeks and the average', () => {
    const sessions = [
      session('2026-10-13'), // week of 12 Oct: 2
      session('2026-10-15'),
      session('2026-10-20'), // week of 19 Oct: 1, and off
      session('2026-11-03'), // week of 2 Nov: 2; the week of 26 Oct is off with none
      session('2026-11-05'),
    ];
    const timeOff = [off('2026-10-21', '2026-10-30')];
    expect(finishedWeeks(sessions, TODAY, 8, timeOff).map((week) => week.weekStart)).toEqual([
      '2026-10-12',
      '2026-11-02',
    ]);
    expect(weeklyAverage(sessions, TODAY)).toEqual({ sessions: 5 / 4, weeks: 4 });
    expect(weeklyAverage(sessions, TODAY, 8, timeOff)).toEqual({ sessions: 2, weeks: 2 });
  });
});

describe('metricValue', () => {
  it('gives a week in sessions, hours to one decimal place, or rounds', () => {
    const sessions: Session[] = [
      { ...session('2026-11-09', 100), rounds: 5 },
      { ...session('2026-11-10', 35) },
    ];
    const [week] = weeklyTotals(sessions, TODAY, 1);
    expect(metricValue(week, 'sessions')).toBe(2);
    expect(metricValue(week, 'hours')).toBe(2.3);
    expect(metricValue(week, 'rounds')).toBe(5);
  });
});
