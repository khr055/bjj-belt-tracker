import { isIsoDate } from './dates';
import { sortPromotions } from './promotions';
import {
  newId,
  SESSION_TYPES,
  type AppData,
  type Promotion,
  type Result,
  type Session,
  type SessionType,
} from './types';

export type SessionInput = Omit<Session, 'id'>;

export const MAX_SESSION_MINUTES = 600;
export const DEFAULT_SESSION_MINUTES = 60;

export const SESSION_TYPE_LABELS: Record<SessionType, string> = { gi: 'Gi', nogi: 'No-gi' };

export function validateSession(input: SessionInput, today: string): string | null {
  if (!isIsoDate(input.date)) return 'Enter a valid session date.';
  if (input.date > today) return "A session can't be dated in the future.";
  if (
    !Number.isInteger(input.durationMinutes) ||
    input.durationMinutes < 1 ||
    input.durationMinutes > MAX_SESSION_MINUTES
  ) {
    return `Enter a duration between 1 and ${MAX_SESSION_MINUTES} minutes.`;
  }
  if (!SESSION_TYPES.includes(input.type)) return 'Choose gi or no-gi.';
  return null;
}

function pick(input: SessionInput): SessionInput {
  return { date: input.date, durationMinutes: input.durationMinutes, type: input.type };
}

export function addSession(data: AppData, input: SessionInput, today: string): Result<AppData> {
  const error = validateSession(input, today);
  if (error) return { ok: false, error };
  return {
    ok: true,
    value: { ...data, sessions: [...data.sessions, { id: newId(), ...pick(input) }] },
  };
}

export function updateSession(
  data: AppData,
  id: string,
  input: SessionInput,
  today: string,
): Result<AppData> {
  if (!data.sessions.some((s) => s.id === id)) {
    return { ok: false, error: 'That session no longer exists.' };
  }
  const error = validateSession(input, today);
  if (error) return { ok: false, error };
  return {
    ok: true,
    value: {
      ...data,
      sessions: data.sessions.map((s) => (s.id === id ? { id, ...pick(input) } : s)),
    },
  };
}

export function deleteSession(data: AppData, id: string): AppData {
  return { ...data, sessions: data.sessions.filter((s) => s.id !== id) };
}

/** Newest date first; sessions on the same day show the most recently logged first. */
export function sortSessions(sessions: Session[]): Session[] {
  return sessions
    .map((session, index) => ({ session, index }))
    .sort((a, b) => b.session.date.localeCompare(a.session.date) || b.index - a.index)
    .map(({ session }) => session);
}

/** Pre-fills the next session from the last one logged, so a regular class is one tap. */
export function sessionDefaults(sessions: Session[]): Pick<Session, 'durationMinutes' | 'type'> {
  const last = sessions[sessions.length - 1];
  return {
    durationMinutes: last?.durationMinutes ?? DEFAULT_SESSION_MINUTES,
    type: last?.type ?? 'gi',
  };
}

export interface MatTime {
  sessions: number;
  minutes: number;
  giSessions: number;
  nogiSessions: number;
}

export function summarize(sessions: Session[]): MatTime {
  return sessions.reduce<MatTime>(
    (total, s) => ({
      sessions: total.sessions + 1,
      minutes: total.minutes + s.durationMinutes,
      giSessions: total.giSessions + (s.type === 'gi' ? 1 : 0),
      nogiSessions: total.nogiSessions + (s.type === 'nogi' ? 1 : 0),
    }),
    { sessions: 0, minutes: 0, giSessions: 0, nogiSessions: 0 },
  );
}

export interface MatTimeStats {
  allTime: MatTime;
  /** Null until at least one promotion has been logged. */
  sinceLastPromotion: { promotion: Promotion; total: MatTime } | null;
}

/**
 * Sessions on the promotion date itself count towards the new rank, so a "started training"
 * entry includes the first class.
 */
export function matTimeStats(data: Pick<AppData, 'promotions' | 'sessions'>): MatTimeStats {
  const sorted = sortPromotions(data.promotions);
  const last = sorted[sorted.length - 1];
  return {
    allTime: summarize(data.sessions),
    sinceLastPromotion: last
      ? { promotion: last, total: summarize(data.sessions.filter((s) => s.date >= last.date)) }
      : null,
  };
}

/** Hours to one decimal place, e.g. 90 minutes -> "1.5". */
export function formatHours(minutes: number): string {
  return String(Math.round(minutes / 6) / 10);
}
