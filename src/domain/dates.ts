const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MS_PER_DAY = 86_400_000;

interface DateParts {
  year: number;
  month: number; // 1-12
  day: number;
}

function parseIsoDate(value: string): DateParts | null {
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  const real =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return real ? { year, month, day } : null;
}

function toUtc(parts: DateParts): number {
  return Date.UTC(parts.year, parts.month - 1, parts.day);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && parseIsoDate(value) !== null;
}

/** Today's date in the user's local time zone. */
export function todayIso(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

export function daysBetween(from: string, to: string): number {
  const start = parseIsoDate(from);
  const end = parseIsoDate(to);
  if (!start || !end) return 0;
  return Math.max(0, Math.round((toUtc(end) - toUtc(start)) / MS_PER_DAY));
}

export interface CalendarDiff {
  years: number;
  months: number;
  days: number;
}

/** Whole years and months between two dates, then the leftover days. */
export function calendarDiff(from: string, to: string): CalendarDiff {
  const start = parseIsoDate(from);
  const end = parseIsoDate(to);
  if (!start || !end || toUtc(end) <= toUtc(start)) return { years: 0, months: 0, days: 0 };

  let totalMonths = (end.year - start.year) * 12 + (end.month - start.month);
  if (end.day < start.day) totalMonths -= 1;

  // Step forward by whole months, clamping to the month's length (31 Jan + 1 month = 28/29 Feb).
  const anchorMonthIndex = start.month - 1 + totalMonths;
  const anchorYear = start.year + Math.floor(anchorMonthIndex / 12);
  const anchorMonth = (anchorMonthIndex % 12) + 1;
  const anchorDay = Math.min(start.day, daysInMonth(anchorYear, anchorMonth));
  const anchor = Date.UTC(anchorYear, anchorMonth - 1, anchorDay);

  return {
    years: Math.floor(totalMonths / 12),
    months: totalMonths % 12,
    days: Math.round((toUtc(end) - anchor) / MS_PER_DAY),
  };
}

/** Compact duration such as "2 yr 3 mo", "5 mo 12 d" or "9 days". */
export function formatDuration(from: string, to: string): string {
  const { years, months, days } = calendarDiff(from, to);
  if (years > 0) return months > 0 ? `${years} yr ${months} mo` : `${years} yr`;
  if (months > 0) return days > 0 ? `${months} mo ${days} d` : `${months} mo`;
  return days === 1 ? '1 day' : `${days} days`;
}

/** Display form such as "12 Mar 2026". */
export function formatDate(value: string): string {
  const parts = parseIsoDate(value);
  if (!parts) return value;
  return `${parts.day} ${MONTHS[parts.month - 1]} ${parts.year}`;
}
