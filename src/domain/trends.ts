import { addDays, weekStart } from './dates';
import type { Session } from './types';

export const TREND_WEEKS = 8;

export interface WeekTotal {
  /** The Monday the week starts on. */
  weekStart: string;
  sessions: number;
  minutes: number;
  /** Rounds rolled, over the sessions that record them. */
  rounds: number;
  /** True for the week containing today, which is still in progress. */
  current: boolean;
}

type Totals = Pick<WeekTotal, 'sessions' | 'minutes' | 'rounds'>;

function totalsByWeek(sessions: Session[]): Map<string, Totals> {
  const totals = new Map<string, Totals>();
  for (const session of sessions) {
    const week = weekStart(session.date);
    const total = totals.get(week) ?? { sessions: 0, minutes: 0, rounds: 0 };
    total.sessions += 1;
    total.minutes += session.durationMinutes;
    total.rounds += session.rounds ?? 0;
    totals.set(week, total);
  }
  return totals;
}

/** One entry per week, oldest first, ending with the current week. Empty weeks are included. */
export function weeklyTotals(
  sessions: Session[],
  today: string,
  weeks: number = TREND_WEEKS,
): WeekTotal[] {
  const totals = totalsByWeek(sessions);
  const thisWeek = weekStart(today);
  return Array.from({ length: weeks }, (_, index) => {
    const week = addDays(thisWeek, (index - (weeks - 1)) * 7);
    const total = totals.get(week) ?? { sessions: 0, minutes: 0, rounds: 0 };
    return { weekStart: week, ...total, current: week === thisWeek };
  });
}

export interface WeeklyStreak {
  /** Weeks in a row with at least one session. */
  weeks: number;
  /** False while the current week has no session yet; the streak survives until the week ends. */
  thisWeekLogged: boolean;
}

export function weeklyStreak(sessions: Session[], today: string): WeeklyStreak {
  const totals = totalsByWeek(sessions);
  const thisWeek = weekStart(today);
  const thisWeekLogged = totals.has(thisWeek);

  let weeks = 0;
  let week = thisWeekLogged ? thisWeek : addDays(thisWeek, -7);
  while (totals.has(week)) {
    weeks += 1;
    week = addDays(week, -7);
  }
  return { weeks, thisWeekLogged };
}

export interface WeeklyAverage {
  sessions: number;
  /** How many finished weeks the average covers. */
  weeks: number;
}

/**
 * The finished weeks in the trend window. The current week is left out because it is
 * incomplete, and so are weeks before the first session ever logged, so someone new to the app
 * isn't measured against weeks they weren't using it.
 */
export function finishedWeeks(
  sessions: Session[],
  today: string,
  weeks: number = TREND_WEEKS,
): WeekTotal[] {
  if (sessions.length === 0) return [];
  const firstWeek = sessions.map((s) => weekStart(s.date)).sort()[0];
  return weeklyTotals(sessions, today, weeks).filter(
    (week) => !week.current && week.weekStart >= firstWeek,
  );
}

/** Average sessions per week over the finished weeks in the trend window. */
export function weeklyAverage(
  sessions: Session[],
  today: string,
  weeks: number = TREND_WEEKS,
): WeeklyAverage | null {
  const finished = finishedWeeks(sessions, today, weeks);
  if (finished.length === 0) return null;
  const total = finished.reduce((sum, week) => sum + week.sessions, 0);
  return { sessions: total / finished.length, weeks: finished.length };
}

/** A y-axis maximum that is even and at least 2, so the midpoint tick is a whole number. */
export function axisMax(values: number[]): number {
  return Math.max(2, Math.ceil(Math.max(0, ...values) / 2) * 2);
}
