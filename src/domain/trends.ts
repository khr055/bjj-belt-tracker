import { addDays, weekStart } from './dates';
import { isWeekOff } from './timeOff';
import type { Session, TimeOff } from './types';

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
  /** True when any day of the week was time off. */
  off: boolean;
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
  timeOff: TimeOff[] = [],
): WeekTotal[] {
  const totals = totalsByWeek(sessions);
  const thisWeek = weekStart(today);
  return Array.from({ length: weeks }, (_, index) => {
    const week = addDays(thisWeek, (index - (weeks - 1)) * 7);
    const total = totals.get(week) ?? { sessions: 0, minutes: 0, rounds: 0 };
    return {
      weekStart: week,
      ...total,
      current: week === thisWeek,
      off: isWeekOff(timeOff, week, today),
    };
  });
}

export interface WeeklyStreak {
  /** Weeks in a row with at least one session. */
  weeks: number;
  /** False while the current week has no session yet; the streak survives until the week ends. */
  thisWeekLogged: boolean;
  /** True when the current week includes time off, so no session is expected of it. */
  thisWeekOff: boolean;
  /** Weeks with time off and no session that the streak carries across. */
  weeksOff: number;
}

/**
 * A week with time off and no session neither adds to the streak nor ends it. A week with time
 * off that was trained in anyway counts like any other.
 */
export function weeklyStreak(
  sessions: Session[],
  today: string,
  timeOff: TimeOff[] = [],
): WeeklyStreak {
  const totals = totalsByWeek(sessions);
  const thisWeek = weekStart(today);
  const thisWeekLogged = totals.has(thisWeek);
  const thisWeekOff = isWeekOff(timeOff, thisWeek, today);
  // Nothing before the first session can be part of a streak, which also ends the walk back.
  const firstWeek = [...totals.keys()].sort()[0];

  let weeks = 0;
  let weeksOff = 0;
  let skipped = 0;
  let week = thisWeekLogged ? thisWeek : addDays(thisWeek, -7);
  while (firstWeek !== undefined && week >= firstWeek) {
    if (totals.has(week)) {
      weeks += 1;
      // Time off only counts as carried across once there is training on its far side.
      weeksOff += skipped;
      skipped = 0;
    } else if (isWeekOff(timeOff, week, today)) {
      skipped += 1;
    } else {
      break;
    }
    week = addDays(week, -7);
  }
  // Time off this week, with nothing logged yet, is carried across too.
  if (weeks > 0 && !thisWeekLogged && thisWeekOff) weeksOff += 1;
  return { weeks, thisWeekLogged, thisWeekOff, weeksOff };
}

export interface WeeklyAverage {
  sessions: number;
  /** How many finished weeks the average covers. */
  weeks: number;
}

/**
 * The finished weeks in the trend window. The current week is left out because it is
 * incomplete, and so are weeks before the first session ever logged, so someone new to the app
 * isn't measured against weeks they weren't using it. Weeks with time off are left out as well.
 */
export function finishedWeeks(
  sessions: Session[],
  today: string,
  weeks: number = TREND_WEEKS,
  timeOff: TimeOff[] = [],
): WeekTotal[] {
  if (sessions.length === 0) return [];
  const firstWeek = sessions.map((s) => weekStart(s.date)).sort()[0];
  return weeklyTotals(sessions, today, weeks, timeOff).filter(
    (week) => !week.current && !week.off && week.weekStart >= firstWeek,
  );
}

/** Average sessions per week over the finished weeks in the trend window. */
export function weeklyAverage(
  sessions: Session[],
  today: string,
  weeks: number = TREND_WEEKS,
  timeOff: TimeOff[] = [],
): WeeklyAverage | null {
  const finished = finishedWeeks(sessions, today, weeks, timeOff);
  if (finished.length === 0) return null;
  const total = finished.reduce((sum, week) => sum + week.sessions, 0);
  return { sessions: total / finished.length, weeks: finished.length };
}

/** A y-axis maximum that is even and at least 2, so the midpoint tick is a whole number. */
export function axisMax(values: number[]): number {
  return Math.max(2, Math.ceil(Math.max(0, ...values) / 2) * 2);
}

/** What the weekly chart can show. */
export const TREND_METRICS = ['sessions', 'hours', 'rounds'] as const;
export type TrendMetric = (typeof TREND_METRICS)[number];

export const METRIC_LABELS: Record<TrendMetric, string> = {
  sessions: 'Sessions',
  hours: 'Hours',
  rounds: 'Rounds',
};

/** A week's figure for the chart. Hours are to one decimal place, as they are shown elsewhere. */
export function metricValue(week: WeekTotal, metric: TrendMetric): number {
  if (metric === 'hours') return Math.round(week.minutes / 6) / 10;
  return metric === 'rounds' ? week.rounds : week.sessions;
}
