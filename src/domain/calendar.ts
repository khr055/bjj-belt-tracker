import { addDays, addMonths, daysBetween, weekStart } from './dates';
import { formatHours, formatRounds, summarize, type MatTime } from './sessions';
import { isDayOff } from './timeOff';
import type { AppData, Competition, Promotion, Session, TimeOff } from './types';

/** A calendar month: `month` runs from 1 (January) to 12. */
export interface YearMonth {
  year: number;
  month: number;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** Column headings, in the order the grid shows them: weeks start on Monday. */
export const WEEKDAYS = [
  { short: 'Mon', long: 'Monday' },
  { short: 'Tue', long: 'Tuesday' },
  { short: 'Wed', long: 'Wednesday' },
  { short: 'Thu', long: 'Thursday' },
  { short: 'Fri', long: 'Friday' },
  { short: 'Sat', long: 'Saturday' },
  { short: 'Sun', long: 'Sunday' },
] as const;

function firstDay({ year, month }: YearMonth): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`;
}

/** The month a date falls in. */
export function monthOf(date: string): YearMonth {
  return { year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) };
}

export function previousMonth(current: YearMonth): YearMonth {
  return monthOf(addMonths(firstDay(current), -1));
}

export function nextMonth(current: YearMonth): YearMonth {
  return monthOf(addMonths(firstDay(current), 1));
}

export function isSameMonth(a: YearMonth, b: YearMonth): boolean {
  return a.year === b.year && a.month === b.month;
}

/** "November 2026". */
export function formatMonth({ year, month }: YearMonth): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

/** The date in full, such as "12 November 2026". */
export function formatLongDate(date: string): string {
  return `${Number(date.slice(8, 10))} ${formatMonth(monthOf(date))}`;
}

/** One day of the month and everything recorded on it. */
export interface CalendarDay {
  date: string;
  /** The day of the month, from 1. */
  day: number;
  isToday: boolean;
  /** In the order they were logged. */
  sessions: Session[];
  /** The periods of time off that cover the day. Empty when it was not a day off. */
  timeOff: TimeOff[];
  promotions: Promotion[];
  competitions: Competition[];
}

export interface CalendarMonth extends YearMonth {
  /** "November 2026". */
  title: string;
  /** Monday to Sunday, seven cells a week. Null where the day belongs to another month. */
  weeks: (CalendarDay | null)[][];
  /** Mat time over the sessions dated in the month. */
  total: MatTime;
}

type CalendarData = Pick<AppData, 'sessions' | 'timeOff' | 'promotions' | 'competitions'>;

/**
 * The weeks of a month with what happened on each day. Time off with no last day runs up to
 * today and no further, as it does everywhere else; time off planned with a last day covers its
 * days even when they are still to come.
 */
export function monthDays(
  year: number,
  month: number,
  data: CalendarData,
  today: string,
): CalendarMonth {
  const first = firstDay({ year, month });
  const length = daysBetween(first, addMonths(first, 1));
  const cells: (CalendarDay | null)[] = Array.from(
    { length: daysBetween(weekStart(first), first) },
    () => null,
  );

  for (let day = 1; day <= length; day += 1) {
    const date = addDays(first, day - 1);
    cells.push({
      date,
      day,
      isToday: date === today,
      sessions: data.sessions.filter((session) => session.date === date),
      timeOff: data.timeOff.filter((period) => isDayOff([period], date, today)),
      promotions: data.promotions.filter((promotion) => promotion.date === date),
      competitions: data.competitions.filter((competition) => competition.date === date),
    });
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (CalendarDay | null)[][] = [];
  for (let start = 0; start < cells.length; start += 7) weeks.push(cells.slice(start, start + 7));

  return {
    year,
    month,
    title: formatMonth({ year, month }),
    weeks,
    total: summarize(
      data.sessions.filter((session) => isSameMonth(monthOf(session.date), { year, month })),
    ),
  };
}

/** "9 sessions · 13.5 hours · 24 rounds", with rounds only when some are recorded. */
export function formatMonthSummary(total: MatTime): string {
  if (total.sessions === 0) return 'No sessions this month';
  return [
    `${total.sessions} ${total.sessions === 1 ? 'session' : 'sessions'}`,
    `${formatHours(total.minutes)} ${total.minutes === 60 ? 'hour' : 'hours'}`,
    total.rounds > 0 && formatRounds(total.rounds),
  ]
    .filter(Boolean)
    .join(' · ');
}

function counted(count: number, one: string, many: string): string | false {
  if (count === 0) return false;
  return count === 1 ? one : `${count} ${many}`;
}

/** Whether anything at all is recorded on the day. */
export function isDayEmpty(day: CalendarDay): boolean {
  return (
    day.sessions.length === 0 &&
    day.timeOff.length === 0 &&
    day.promotions.length === 0 &&
    day.competitions.length === 0
  );
}

/**
 * A day in words, for people who cannot see the grid: "12 November 2026: 2 sessions, time off,
 * promotion", or "13 November 2026: nothing logged". Today says so after the date.
 */
export function describeDay(day: CalendarDay): string {
  const facts = [
    counted(day.sessions.length, '1 session', 'sessions'),
    day.timeOff.length > 0 && 'time off',
    counted(day.promotions.length, 'promotion', 'promotions'),
    counted(day.competitions.length, 'competition', 'competitions'),
  ].filter(Boolean);
  const date = `${formatLongDate(day.date)}${day.isToday ? ' (today)' : ''}`;
  return `${date}: ${facts.length > 0 ? facts.join(', ') : 'nothing logged'}`;
}

/**
 * Where a key press moves from a day in the grid: the arrow keys by a day or a week, Home and
 * End to the Monday and Sunday of the week, Page Up and Page Down by a month. Null for any other
 * key. The day moved to may be in another month.
 */
export function moveDay(date: string, key: string): string | null {
  switch (key) {
    case 'ArrowLeft':
      return addDays(date, -1);
    case 'ArrowRight':
      return addDays(date, 1);
    case 'ArrowUp':
      return addDays(date, -7);
    case 'ArrowDown':
      return addDays(date, 7);
    case 'Home':
      return weekStart(date);
    case 'End':
      return addDays(weekStart(date), 6);
    case 'PageUp':
      return addMonths(date, -1);
    case 'PageDown':
      return addMonths(date, 1);
    default:
      return null;
  }
}
