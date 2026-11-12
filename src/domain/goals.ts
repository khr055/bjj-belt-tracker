import { weekStart } from './dates';
import { finishedWeeks, TREND_WEEKS } from './trends';
import type { AppData, Result, Session } from './types';

export const MAX_WEEKLY_GOAL = 7;

export function isValidGoal(goal: unknown): goal is number {
  return typeof goal === 'number' && Number.isInteger(goal) && goal >= 1 && goal <= MAX_WEEKLY_GOAL;
}

/** Sets how many sessions a week to aim for; null clears the goal. */
export function setWeeklyGoal(data: AppData, goal: number | null): Result<AppData> {
  if (goal !== null && !isValidGoal(goal)) {
    return { ok: false, error: `Choose a goal between 1 and ${MAX_WEEKLY_GOAL} sessions a week.` };
  }
  return { ok: true, value: { ...data, weeklyGoal: goal } };
}

export interface GoalProgress {
  goal: number;
  /** Sessions logged so far in the week containing today. */
  done: number;
  remaining: number;
  met: boolean;
}

export function goalProgress(sessions: Session[], goal: number, today: string): GoalProgress {
  const thisWeek = weekStart(today);
  const done = sessions.filter((session) => weekStart(session.date) === thisWeek).length;
  return { goal, done, remaining: Math.max(0, goal - done), met: done >= goal };
}

export interface GoalRecord {
  /** Finished weeks that reached the goal. */
  met: number;
  /** Finished weeks counted, starting from the first session ever logged. */
  weeks: number;
}

/** How often the goal was reached over the finished weeks in the trend window. */
export function goalRecord(
  sessions: Session[],
  goal: number,
  today: string,
  weeks: number = TREND_WEEKS,
): GoalRecord | null {
  const finished = finishedWeeks(sessions, today, weeks);
  if (finished.length === 0) return null;
  return { met: finished.filter((week) => week.sessions >= goal).length, weeks: finished.length };
}
