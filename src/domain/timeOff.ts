import { addDays, daysBetween, isIsoDate } from './dates';
import { MAX_NOTES_LENGTH } from './sessions';
import {
  newId,
  TIME_OFF_REASONS,
  type AppData,
  type Result,
  type TimeOff,
  type TimeOffReason,
} from './types';

export type TimeOffInput = Omit<TimeOff, 'id'>;

export const MAX_TIME_OFF = 100;

export const REASON_LABELS: Record<TimeOffReason, string> = {
  injury: 'Injury',
  illness: 'Illness',
  travel: 'Travel',
  other: 'Other',
};

export function validateTimeOff(input: TimeOffInput): string | null {
  if (!isIsoDate(input.startDate)) return 'Enter a valid first day off.';
  if (input.endDate !== undefined) {
    if (!isIsoDate(input.endDate)) return 'Enter a valid last day off, or leave it blank.';
    if (input.endDate < input.startDate) return "The last day off can't be before the first.";
  }
  if (!TIME_OFF_REASONS.includes(input.reason)) return 'Choose a reason.';
  if ((input.notes ?? '').trim().length > MAX_NOTES_LENGTH) {
    return `Keep notes to ${MAX_NOTES_LENGTH} characters or fewer.`;
  }
  return null;
}

function clean(input: TimeOffInput): TimeOffInput {
  const notes = input.notes?.trim();
  return {
    startDate: input.startDate,
    ...(input.endDate ? { endDate: input.endDate } : {}),
    reason: input.reason,
    ...(notes ? { notes } : {}),
  };
}

export function addTimeOff(data: AppData, input: TimeOffInput): Result<AppData> {
  const error = validateTimeOff(input);
  if (error) return { ok: false, error };
  if (data.timeOff.length >= MAX_TIME_OFF) {
    return { ok: false, error: `The app can hold up to ${MAX_TIME_OFF} periods of time off.` };
  }
  return { ok: true, value: { ...data, timeOff: [...data.timeOff, { id: newId(), ...clean(input) }] } };
}

export function updateTimeOff(data: AppData, id: string, input: TimeOffInput): Result<AppData> {
  if (!data.timeOff.some((period) => period.id === id)) {
    return { ok: false, error: 'That time off no longer exists.' };
  }
  const error = validateTimeOff(input);
  if (error) return { ok: false, error };
  return {
    ok: true,
    value: {
      ...data,
      timeOff: data.timeOff.map((period) => (period.id === id ? { id, ...clean(input) } : period)),
    },
  };
}

export function deleteTimeOff(data: AppData, id: string): AppData {
  return { ...data, timeOff: data.timeOff.filter((period) => period.id !== id) };
}

/** Most recent first. */
export function sortTimeOff(timeOff: TimeOff[]): TimeOff[] {
  return [...timeOff].sort((a, b) => b.startDate.localeCompare(a.startDate));
}

/** Time off with no last day runs up to today: it has not ended, but nor is the future known. */
function lastDay(period: TimeOff, today: string): string {
  return period.endDate ?? today;
}

/** Whether the day falls in a period of time off. */
export function isDayOff(timeOff: TimeOff[], day: string, today: string): boolean {
  return timeOff.some((period) => period.startDate <= day && day <= lastDay(period, today));
}

/** The period of time off that today falls in, if any. */
export function currentTimeOff(timeOff: TimeOff[], today: string): TimeOff | null {
  return (
    sortTimeOff(timeOff).find(
      (period) => period.startDate <= today && today <= lastDay(period, today),
    ) ?? null
  );
}

/** Whether any day of the week starting on the given Monday was time off. */
export function isWeekOff(timeOff: TimeOff[], weekStart: string, today: string): boolean {
  const weekEnd = addDays(weekStart, 6);
  return timeOff.some(
    (period) => period.startDate <= weekEnd && lastDay(period, today) >= weekStart,
  );
}

/**
 * How many of the days from `from` to `to`, both included, were time off. Periods that overlap
 * are not counted twice.
 */
export function daysOffBetween(timeOff: TimeOff[], from: string, to: string, today: string): number {
  if (from > to) return 0;
  // Each period, cut down to the range, in date order.
  const spans = timeOff
    .map((period) => ({
      start: period.startDate > from ? period.startDate : from,
      end: lastDay(period, today) < to ? lastDay(period, today) : to,
    }))
    .filter((span) => span.start <= span.end)
    .sort((a, b) => a.start.localeCompare(b.start));

  let days = 0;
  let counted = ''; // The last day counted so far.
  for (const span of spans) {
    if (span.end <= counted) continue;
    const start = counted !== '' && span.start <= counted ? addDays(counted, 1) : span.start;
    days += daysBetween(start, span.end) + 1;
    counted = span.end;
  }
  return days;
}
