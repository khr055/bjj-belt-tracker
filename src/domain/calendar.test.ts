import { describe, expect, it } from 'vitest';
import {
  describeDay,
  formatLongDate,
  formatMonth,
  formatMonthSummary,
  isDayEmpty,
  isSameMonth,
  monthDays,
  monthOf,
  moveDay,
  nextMonth,
  previousMonth,
  WEEKDAYS,
  type CalendarDay,
  type CalendarMonth,
} from './calendar';
import { summarize } from './sessions';
import { emptyData, type AppData, type Competition, type Session, type TimeOff } from './types';

// Thursday.
const TODAY = '2026-11-12';

let nextId = 0;
function session(date: string, extra: Partial<Session> = {}): Session {
  nextId += 1;
  return { id: `s${nextId}`, date, durationMinutes: 60, type: 'gi', ...extra };
}

function competition(date: string, name: string): Competition {
  return { id: name, date, name, type: 'gi', matches: [] };
}

function month(year: number, monthNumber: number, data: Partial<AppData> = {}, today = TODAY) {
  return monthDays(year, monthNumber, { ...emptyData(), ...data }, today);
}

function days(calendar: CalendarMonth): CalendarDay[] {
  return calendar.weeks.flat().filter((day): day is CalendarDay => day !== null);
}

function day(calendar: CalendarMonth, date: string): CalendarDay {
  const found = days(calendar).find((candidate) => candidate.date === date);
  if (!found) throw new Error(`${date} is not in ${calendar.title}`);
  return found;
}

/** The dates that are time off, as days of the month. */
function daysOff(calendar: CalendarMonth): number[] {
  return days(calendar)
    .filter((candidate) => candidate.timeOff.length > 0)
    .map((candidate) => candidate.day);
}

describe('monthDays: the shape of the grid', () => {
  it('starts weeks on Monday', () => {
    expect(WEEKDAYS.map((weekday) => weekday.short)).toEqual([
      'Mon',
      'Tue',
      'Wed',
      'Thu',
      'Fri',
      'Sat',
      'Sun',
    ]);
  });

  it('lays out a month that starts on a Monday with no blanks before the 1st', () => {
    const june = month(2026, 6);
    expect(june.title).toBe('June 2026');
    expect(june.weeks).toHaveLength(5);
    expect(june.weeks.every((week) => week.length === 7)).toBe(true);
    expect(june.weeks[0].map((cell) => cell?.day)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    // 30 June is a Tuesday.
    expect(june.weeks[4].map((cell) => cell?.day ?? null)).toEqual([
      29,
      30,
      null,
      null,
      null,
      null,
      null,
    ]);
  });

  it('lays out a month that starts on a Sunday with six blanks before the 1st', () => {
    const november = month(2026, 11);
    expect(november.weeks).toHaveLength(6);
    expect(november.weeks[0].map((cell) => cell?.day ?? null)).toEqual([
      null,
      null,
      null,
      null,
      null,
      null,
      1,
    ]);
    expect(november.weeks[1][0]?.date).toBe('2026-11-02');
    expect(november.weeks[5].map((cell) => cell?.day ?? null)).toEqual([
      30,
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
    expect(days(november)).toHaveLength(30);
  });

  it('fits a 28-day February that starts on a Monday into exactly four weeks', () => {
    const february = month(2027, 2);
    expect(february.weeks).toHaveLength(4);
    expect(february.weeks.flat().every((cell) => cell !== null)).toBe(true);
    expect(february.weeks[3][6]?.date).toBe('2027-02-28');
  });

  it('gives February 29 days in a leap year', () => {
    const february = month(2028, 2);
    expect(days(february)).toHaveLength(29);
    // 1 February 2028 is a Tuesday, and so is the 29th.
    expect(february.weeks[0][0]).toBeNull();
    expect(february.weeks[0][1]?.date).toBe('2028-02-01');
    expect(february.weeks[4][1]?.date).toBe('2028-02-29');
    expect(days(month(2026, 2))).toHaveLength(28);
  });

  it('marks today, and only in its own month', () => {
    expect(days(month(2026, 11)).filter((candidate) => candidate.isToday)).toEqual([
      expect.objectContaining({ date: TODAY, day: 12 }),
    ]);
    expect(days(month(2026, 10)).some((candidate) => candidate.isToday)).toBe(false);
    expect(days(month(2027, 11)).some((candidate) => candidate.isToday)).toBe(false);
  });
});

describe('month navigation', () => {
  it('moves across the end of the year in both directions', () => {
    expect(nextMonth({ year: 2026, month: 12 })).toEqual({ year: 2027, month: 1 });
    expect(previousMonth({ year: 2027, month: 1 })).toEqual({ year: 2026, month: 12 });
  });

  it('moves within a year', () => {
    expect(nextMonth({ year: 2026, month: 11 })).toEqual({ year: 2026, month: 12 });
    expect(previousMonth({ year: 2026, month: 3 })).toEqual({ year: 2026, month: 2 });
  });

  it('finds the month of a date and names it', () => {
    expect(monthOf('2026-11-12')).toEqual({ year: 2026, month: 11 });
    expect(monthOf('2027-01-01')).toEqual({ year: 2027, month: 1 });
    expect(formatMonth({ year: 2027, month: 1 })).toBe('January 2027');
    expect(formatLongDate('2026-11-02')).toBe('2 November 2026');
    expect(isSameMonth(monthOf('2026-11-01'), monthOf('2026-11-30'))).toBe(true);
    expect(isSameMonth(monthOf('2026-11-30'), monthOf('2027-11-30'))).toBe(false);
  });
});

describe('monthDays: sessions', () => {
  it('puts sessions on the first and last day of the month, and nowhere else', () => {
    const first = session('2026-10-01');
    const last = session('2026-10-31');
    const data = { sessions: [first, last, session('2026-09-30'), session('2026-11-01')] };

    const october = month(2026, 10, data);
    expect(day(october, '2026-10-01').sessions).toEqual([first]);
    expect(day(october, '2026-10-31').sessions).toEqual([last]);
    expect(days(october).filter((candidate) => candidate.sessions.length > 0)).toHaveLength(2);
    expect(october.total).toMatchObject({ sessions: 2, minutes: 120 });

    expect(month(2026, 9, data).total.sessions).toBe(1);
    expect(month(2026, 11, data).total.sessions).toBe(1);
  });

  it('keeps several sessions on one day, in the order they were logged', () => {
    const morning = session('2026-11-10', { durationMinutes: 90, rounds: 4 });
    const evening = session('2026-11-10', { type: 'nogi', kind: 'open-mat', rounds: 6 });
    const november = month(2026, 11, { sessions: [morning, session('2026-11-11'), evening] });

    expect(day(november, '2026-11-10').sessions).toEqual([morning, evening]);
    expect(november.total).toEqual(summarize([morning, session('2026-11-11'), evening]));
    expect(november.total).toMatchObject({ sessions: 3, minutes: 210, rounds: 10 });
  });

  it('does not mix up the same month in different years', () => {
    const data = { sessions: [session('2025-11-12')] };
    expect(month(2026, 11, data).total.sessions).toBe(0);
    expect(month(2025, 11, data).total.sessions).toBe(1);
  });
});

describe('monthDays: time off', () => {
  it('shades time off that spans a month boundary in both months', () => {
    const trip: TimeOff = {
      id: 'trip',
      startDate: '2026-09-29',
      endDate: '2026-10-02',
      reason: 'travel',
    };
    expect(daysOff(month(2026, 9, { timeOff: [trip] }))).toEqual([29, 30]);
    const october = month(2026, 10, { timeOff: [trip] });
    expect(daysOff(october)).toEqual([1, 2]);
    expect(day(october, '2026-10-01').timeOff).toEqual([trip]);
    expect(daysOff(month(2026, 11, { timeOff: [trip] }))).toEqual([]);
  });

  it('runs time off with no last day up to today and no further', () => {
    const injury: TimeOff = { id: 'injury', startDate: '2026-10-30', reason: 'injury' };
    expect(daysOff(month(2026, 10, { timeOff: [injury] }))).toEqual([30, 31]);
    expect(daysOff(month(2026, 11, { timeOff: [injury] }))).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
    expect(daysOff(month(2026, 12, { timeOff: [injury] }))).toEqual([]);
  });

  it('shades planned time off that has a last day, and not planned time off without one', () => {
    const planned: TimeOff = {
      id: 'planned',
      startDate: '2026-12-24',
      endDate: '2027-01-02',
      reason: 'travel',
    };
    expect(daysOff(month(2026, 12, { timeOff: [planned] }))).toEqual([24, 25, 26, 27, 28, 29, 30, 31]);
    expect(daysOff(month(2027, 1, { timeOff: [planned] }))).toEqual([1, 2]);

    const openEnded: TimeOff = { id: 'open', startDate: '2026-12-24', reason: 'other' };
    expect(daysOff(month(2026, 12, { timeOff: [openEnded] }))).toEqual([]);
  });

  it('lists every period that covers a day', () => {
    const injury: TimeOff = { id: 'a', startDate: '2026-11-01', endDate: '2026-11-05', reason: 'injury' };
    const travel: TimeOff = { id: 'b', startDate: '2026-11-05', endDate: '2026-11-06', reason: 'travel' };
    const november = month(2026, 11, { timeOff: [injury, travel] });
    expect(day(november, '2026-11-05').timeOff).toEqual([injury, travel]);
    expect(day(november, '2026-11-06').timeOff).toEqual([travel]);
  });
});

describe('monthDays: promotions and competitions', () => {
  it('puts each on its day, including a competition still to come', () => {
    const stripe = { id: 'p1', belt: 'blue', stripes: 1, date: '2026-11-12' } as const;
    const open = competition('2026-11-28', 'Winter Open');
    const november = month(2026, 11, {
      promotions: [stripe, { id: 'p0', belt: 'blue', stripes: 0, date: '2025-11-12' }],
      competitions: [open, competition('2026-12-28', 'Later')],
    });
    expect(day(november, '2026-11-12').promotions).toEqual([stripe]);
    expect(day(november, '2026-11-28').competitions).toEqual([open]);
    expect(days(november).filter((candidate) => !isDayEmpty(candidate))).toHaveLength(2);
  });
});

describe('formatMonthSummary', () => {
  it('says when the month has no sessions', () => {
    expect(formatMonthSummary(summarize([]))).toBe('No sessions this month');
  });

  it('gives sessions and hours, and rounds only when some are recorded', () => {
    expect(formatMonthSummary(summarize([session('2026-11-02', { durationMinutes: 90 })]))).toBe(
      '1 session · 1.5 hours',
    );
    expect(formatMonthSummary(summarize([session('2026-11-02')]))).toBe('1 session · 1 hour');
    expect(
      formatMonthSummary(
        summarize([
          session('2026-11-02', { durationMinutes: 90, rounds: 5 }),
          session('2026-11-03', { durationMinutes: 45, rounds: 0 }),
          session('2026-11-04'),
        ]),
      ),
    ).toBe('3 sessions · 3.3 hours · 5 rounds');
    expect(formatMonthSummary(summarize([session('2026-11-02', { rounds: 1 })]))).toBe(
      '1 session · 1 hour · 1 round',
    );
  });
});

describe('describeDay', () => {
  it('states the date and everything on it', () => {
    const november = month(
      2026,
      11,
      {
        sessions: [session('2026-11-12'), session('2026-11-12'), session('2026-11-13')],
        timeOff: [{ id: 't', startDate: '2026-11-12', endDate: '2026-11-12', reason: 'illness' }],
        promotions: [{ id: 'p', belt: 'blue', stripes: 1, date: '2026-11-12' }],
        competitions: [competition('2026-11-14', 'Open'), competition('2026-11-14', 'Absolute')],
      },
      '2026-11-20',
    );
    expect(describeDay(day(november, '2026-11-12'))).toBe(
      '12 November 2026: 2 sessions, time off, promotion',
    );
    expect(describeDay(day(november, '2026-11-13'))).toBe('13 November 2026: 1 session');
    expect(describeDay(day(november, '2026-11-14'))).toBe('14 November 2026: 2 competitions');
    expect(describeDay(day(november, '2026-11-15'))).toBe('15 November 2026: nothing logged');
    expect(isDayEmpty(day(november, '2026-11-15'))).toBe(true);
    expect(isDayEmpty(day(november, '2026-11-13'))).toBe(false);
  });

  it('says which day is today', () => {
    const november = month(2026, 11, { sessions: [session(TODAY)] });
    expect(describeDay(day(november, TODAY))).toBe('12 November 2026 (today): 1 session');
  });
});

describe('moveDay', () => {
  it('moves by a day or a week, across months and years', () => {
    expect(moveDay('2026-11-12', 'ArrowLeft')).toBe('2026-11-11');
    expect(moveDay('2026-11-30', 'ArrowRight')).toBe('2026-12-01');
    expect(moveDay('2026-11-03', 'ArrowUp')).toBe('2026-10-27');
    expect(moveDay('2026-12-28', 'ArrowDown')).toBe('2027-01-04');
  });

  it('moves to the Monday and Sunday of the week', () => {
    expect(moveDay('2026-11-12', 'Home')).toBe('2026-11-09');
    expect(moveDay('2026-11-12', 'End')).toBe('2026-11-15');
  });

  it('moves by a month, keeping to the shorter month', () => {
    expect(moveDay('2026-12-12', 'PageDown')).toBe('2027-01-12');
    expect(moveDay('2026-03-31', 'PageUp')).toBe('2026-02-28');
  });

  it('leaves other keys alone', () => {
    expect(moveDay('2026-11-12', 'Enter')).toBeNull();
    expect(moveDay('2026-11-12', 'a')).toBeNull();
  });
});
