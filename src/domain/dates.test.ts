import { describe, expect, it } from 'vitest';
import { calendarDiff, daysBetween, formatDate, formatDuration, isIsoDate, todayIso } from './dates';

describe('isIsoDate', () => {
  it('accepts real calendar days only', () => {
    expect(isIsoDate('2024-02-29')).toBe(true);
    expect(isIsoDate('2023-02-29')).toBe(false);
    expect(isIsoDate('2024-13-01')).toBe(false);
    expect(isIsoDate('1/2/2024')).toBe(false);
    expect(isIsoDate(20240101)).toBe(false);
  });
});

describe('todayIso', () => {
  it('uses the local calendar day', () => {
    expect(todayIso(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });
});

describe('calendarDiff', () => {
  it('counts whole years, months and leftover days', () => {
    expect(calendarDiff('2022-03-15', '2024-06-20')).toEqual({ years: 2, months: 3, days: 5 });
  });

  it('borrows a month when the end day is earlier in the month', () => {
    expect(calendarDiff('2024-01-20', '2024-03-05')).toEqual({ years: 0, months: 1, days: 14 });
  });

  it('clamps to the end of shorter months', () => {
    expect(calendarDiff('2024-01-31', '2024-03-01')).toEqual({ years: 0, months: 1, days: 1 });
  });

  it('is zero when the end is not after the start', () => {
    expect(calendarDiff('2024-05-01', '2024-05-01')).toEqual({ years: 0, months: 0, days: 0 });
    expect(calendarDiff('2024-05-02', '2024-05-01')).toEqual({ years: 0, months: 0, days: 0 });
  });
});

describe('formatDuration', () => {
  it('picks the two most useful units', () => {
    expect(formatDuration('2022-03-15', '2024-06-20')).toBe('2 yr 3 mo');
    expect(formatDuration('2022-03-15', '2024-03-20')).toBe('2 yr');
    expect(formatDuration('2024-01-01', '2024-06-13')).toBe('5 mo 12 d');
    expect(formatDuration('2024-01-01', '2024-03-01')).toBe('2 mo');
    expect(formatDuration('2024-01-01', '2024-01-10')).toBe('9 days');
    expect(formatDuration('2024-01-01', '2024-01-02')).toBe('1 day');
    expect(formatDuration('2024-01-01', '2024-01-01')).toBe('0 days');
  });
});

describe('daysBetween and formatDate', () => {
  it('counts days across a leap day', () => {
    expect(daysBetween('2024-02-28', '2024-03-01')).toBe(2);
  });

  it('formats a date for display', () => {
    expect(formatDate('2026-03-12')).toBe('12 Mar 2026');
  });
});
