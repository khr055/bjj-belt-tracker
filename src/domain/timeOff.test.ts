import { describe, expect, it } from 'vitest';
import {
  addTimeOff,
  currentTimeOff,
  deleteTimeOff,
  isDayOff,
  isWeekOff,
  MAX_TIME_OFF,
  sortTimeOff,
  updateTimeOff,
  type TimeOffInput,
} from './timeOff';
import { emptyData, type AppData, type TimeOff } from './types';

// Wednesday. Its week starts on Monday 9 Nov 2026.
const TODAY = '2026-11-11';
const RIB: TimeOffInput = { startDate: '2026-10-05', endDate: '2026-10-18', reason: 'injury' };

function mustAdd(data: AppData, input: TimeOffInput): AppData {
  const result = addTimeOff(data, input);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

function off(startDate: string, endDate?: string): TimeOff {
  return { id: startDate, startDate, ...(endDate ? { endDate } : {}), reason: 'travel' };
}

describe('logging time off', () => {
  it('adds a period, tidying its notes', () => {
    const data = mustAdd(emptyData(), { ...RIB, notes: '  Cracked rib ' });
    expect(data.timeOff).toEqual([{ id: data.timeOff[0].id, ...RIB, notes: 'Cracked rib' }]);
    expect(mustAdd(emptyData(), { ...RIB, notes: '  ' }).timeOff[0]).not.toHaveProperty('notes');
  });

  it('leaves the last day off while the time off is still going on', () => {
    const data = mustAdd(emptyData(), { startDate: '2026-11-01', reason: 'illness' });
    expect(data.timeOff[0]).not.toHaveProperty('endDate');
  });

  it('accepts time off planned for the future and a single day', () => {
    expect(addTimeOff(emptyData(), { startDate: '2026-12-20', endDate: '2027-01-03', reason: 'travel' }).ok).toBe(true);
    expect(addTimeOff(emptyData(), { startDate: TODAY, endDate: TODAY, reason: 'other' }).ok).toBe(true);
  });

  it.each([
    [{ ...RIB, startDate: 'last week' }, 'first day off'],
    [{ ...RIB, endDate: 'soon' }, 'last day off'],
    [{ ...RIB, endDate: '2026-10-04' }, "can't be before"],
    [{ ...RIB, reason: 'holiday' }, 'reason'],
    [{ ...RIB, notes: 'x'.repeat(501) }, '500 characters'],
  ])('rejects %j', (input, message) => {
    const result = addTimeOff(emptyData(), input as TimeOffInput);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain(message);
  });

  it('holds a limited number of periods', () => {
    let data = emptyData();
    for (let index = 0; index < MAX_TIME_OFF; index += 1) data = mustAdd(data, RIB);
    expect(addTimeOff(data, RIB).ok).toBe(false);
  });

  it('edits and deletes a period', () => {
    const data = mustAdd(emptyData(), { startDate: '2026-11-01', reason: 'illness' });
    const { id } = data.timeOff[0];
    const ended = updateTimeOff(data, id, { startDate: '2026-11-01', endDate: '2026-11-06', reason: 'illness' });
    expect(ended.ok && ended.value.timeOff).toEqual([
      { id, startDate: '2026-11-01', endDate: '2026-11-06', reason: 'illness' },
    ]);
    expect(updateTimeOff(data, 'gone', RIB).ok).toBe(false);
    expect(updateTimeOff(data, id, { ...RIB, endDate: '2020-01-01' }).ok).toBe(false);
    expect(deleteTimeOff(data, id).timeOff).toEqual([]);
  });

  it('lists the most recent first', () => {
    const periods = [off('2026-03-01', '2026-03-08'), off('2026-10-05'), off('2026-06-01', '2026-06-02')];
    expect(sortTimeOff(periods).map((period) => period.startDate)).toEqual([
      '2026-10-05',
      '2026-06-01',
      '2026-03-01',
    ]);
  });
});

describe('which days and weeks are off', () => {
  it('covers the first and last day and everything between', () => {
    const periods = [off('2026-10-05', '2026-10-18')];
    expect(isDayOff(periods, '2026-10-04', TODAY)).toBe(false);
    expect(isDayOff(periods, '2026-10-05', TODAY)).toBe(true);
    expect(isDayOff(periods, '2026-10-18', TODAY)).toBe(true);
    expect(isDayOff(periods, '2026-10-19', TODAY)).toBe(false);
  });

  it('runs time off with no last day up to today', () => {
    const periods = [off('2026-11-02')];
    expect(isDayOff(periods, TODAY, TODAY)).toBe(true);
    expect(isDayOff(periods, '2026-11-12', TODAY)).toBe(false);
    expect(currentTimeOff(periods, TODAY)).toEqual(periods[0]);
    expect(currentTimeOff([off('2026-10-05', '2026-10-18')], TODAY)).toBeNull();
    expect(currentTimeOff([off('2026-12-20')], TODAY)).toBeNull();
  });

  it('counts a week as off when any day of it was', () => {
    // Sunday 18 Oct is the last day of the week starting 12 Oct.
    const periods = [off('2026-10-18', '2026-10-19')];
    expect(isWeekOff(periods, '2026-10-05', TODAY)).toBe(false);
    expect(isWeekOff(periods, '2026-10-12', TODAY)).toBe(true);
    expect(isWeekOff(periods, '2026-10-19', TODAY)).toBe(true);
    expect(isWeekOff(periods, '2026-10-26', TODAY)).toBe(false);
  });
});
