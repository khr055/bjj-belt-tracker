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
  type Technique,
} from './types';

export type SessionInput = Omit<Session, 'id'>;

export const MAX_SESSION_MINUTES = 600;
export const DEFAULT_SESSION_MINUTES = 60;
export const MAX_NOTES_LENGTH = 500;
export const MAX_SESSION_TECHNIQUES = 20;

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
  if ((input.notes ?? '').trim().length > MAX_NOTES_LENGTH) {
    return `Keep notes to ${MAX_NOTES_LENGTH} characters or fewer.`;
  }
  if (new Set(input.techniqueIds ?? []).size > MAX_SESSION_TECHNIQUES) {
    return `Choose up to ${MAX_SESSION_TECHNIQUES} techniques for a session.`;
  }
  return null;
}

/** The ids that name a technique in the journal, each once, in the order given. */
export function knownTechniqueIds(ids: unknown, techniques: Technique[]): string[] {
  if (!Array.isArray(ids)) return [];
  const known = new Set(techniques.map((technique) => technique.id));
  return [...new Set(ids)].filter((id): id is string => typeof id === 'string' && known.has(id));
}

/** A technique deleted while the form was open is quietly left off the session. */
function pick(input: SessionInput, techniques: Technique[]): SessionInput {
  const notes = input.notes?.trim();
  const techniqueIds = knownTechniqueIds(input.techniqueIds, techniques);
  return {
    date: input.date,
    durationMinutes: input.durationMinutes,
    type: input.type,
    ...(notes ? { notes } : {}),
    ...(techniqueIds.length > 0 ? { techniqueIds } : {}),
  };
}

export function addSession(data: AppData, input: SessionInput, today: string): Result<AppData> {
  const error = validateSession(input, today);
  if (error) return { ok: false, error };
  return {
    ok: true,
    value: { ...data, sessions: [...data.sessions, { id: newId(), ...pick(input, data.techniques) }] },
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
      sessions: data.sessions.map((s) => (s.id === id ? { id, ...pick(input, data.techniques) } : s)),
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

export interface SessionFilter {
  type: SessionType | 'all';
  /** Words to look for in the notes and in the names of the techniques worked on. */
  text: string;
}

export const NO_FILTER: SessionFilter = { type: 'all', text: '' };

export function isFiltering(filter: SessionFilter): boolean {
  return filter.type !== 'all' || filter.text.trim() !== '';
}

/** The techniques a session worked on, in the order they were ticked. */
export function sessionTechniques(session: Session, techniques: Technique[]): Technique[] {
  const byId = new Map(techniques.map((technique) => [technique.id, technique]));
  return (session.techniqueIds ?? []).flatMap((id) => byId.get(id) ?? []);
}

/**
 * Keeps sessions of the chosen type where every word searched for appears in the notes or in
 * the name of a technique worked on.
 */
export function filterSessions(
  sessions: Session[],
  filter: SessionFilter,
  techniques: Technique[] = [],
): Session[] {
  const words = filter.text.toLowerCase().split(/\s+/).filter(Boolean);
  return sessions.filter((session) => {
    if (filter.type !== 'all' && session.type !== filter.type) return false;
    if (words.length === 0) return true;
    const names = sessionTechniques(session, techniques).map((technique) => technique.name);
    const text = [session.notes ?? '', ...names].join('\n').toLowerCase();
    return words.every((word) => text.includes(word));
  });
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
