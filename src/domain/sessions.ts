import { isIsoDate } from './dates';
import { sortPromotions } from './promotions';
import {
  newId,
  SESSION_KINDS,
  SESSION_TYPES,
  type AppData,
  type Promotion,
  type Result,
  type Session,
  type SessionKind,
  type SessionType,
  type Technique,
} from './types';

export type SessionInput = Omit<Session, 'id'>;

export const MAX_SESSION_MINUTES = 600;
export const DEFAULT_SESSION_MINUTES = 60;
export const MAX_NOTES_LENGTH = 500;
export const MAX_SESSION_TECHNIQUES = 20;
export const MAX_ROUNDS = 30;
export const MAX_CAUGHT = 10;
export const MAX_CAUGHT_LENGTH = 60;
export const DEFAULT_SESSION_KIND: SessionKind = 'class';

export const SESSION_TYPE_LABELS: Record<SessionType, string> = { gi: 'Gi', nogi: 'No-gi' };

export const SESSION_KIND_LABELS: Record<SessionKind, string> = {
  class: 'Class',
  'open-mat': 'Open mat',
  drilling: 'Drilling',
  private: 'Private lesson',
};

/** Names are the same whatever their case or spacing. */
export function sameName(a: string, b: string): boolean {
  const key = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();
  return key(a) === key(b);
}

/** Tidied names, each once, in the order given. Anything that is not text is left out. */
export function cleanCaught(names: unknown): string[] {
  if (!Array.isArray(names)) return [];
  const kept: string[] = [];
  for (const value of names) {
    if (typeof value !== 'string') continue;
    const name = value.trim().replace(/\s+/g, ' ');
    if (name && !kept.some((other) => sameName(other, name))) kept.push(name);
  }
  return kept;
}

/**
 * The names ticked, plus one typed but not yet added. A name used before, or already ticked,
 * keeps the spelling it has.
 */
export function withTypedName(selected: string[], typed: string, known: string[]): string[] {
  const [name] = cleanCaught([typed]);
  if (!name || selected.some((other) => sameName(other, name))) return selected;
  return [...selected, known.find((other) => sameName(other, name)) ?? name];
}

export function isValidRounds(rounds: unknown): rounds is number {
  return (
    typeof rounds === 'number' && Number.isInteger(rounds) && rounds >= 0 && rounds <= MAX_ROUNDS
  );
}

/** "1 round", "6 rounds". */
export function formatRounds(rounds: number): string {
  return `${rounds} ${rounds === 1 ? 'round' : 'rounds'}`;
}

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
  if (input.kind !== undefined && !SESSION_KINDS.includes(input.kind)) {
    return 'Choose what kind of session it was.';
  }
  if (input.rounds !== undefined && !isValidRounds(input.rounds)) {
    return `Enter between 0 and ${MAX_ROUNDS} rounds, or leave rounds blank.`;
  }
  if ((input.notes ?? '').trim().length > MAX_NOTES_LENGTH) {
    return `Keep notes to ${MAX_NOTES_LENGTH} characters or fewer.`;
  }
  if (new Set(input.techniqueIds ?? []).size > MAX_SESSION_TECHNIQUES) {
    return `Choose up to ${MAX_SESSION_TECHNIQUES} techniques for a session.`;
  }
  if (new Set(input.landedIds ?? []).size > MAX_SESSION_TECHNIQUES) {
    return `Choose up to ${MAX_SESSION_TECHNIQUES} techniques landed in a session.`;
  }
  const caught = cleanCaught(input.caughtWith);
  if (caught.length > MAX_CAUGHT) {
    return `Record up to ${MAX_CAUGHT} submissions you were caught with.`;
  }
  if (caught.some((name) => name.length > MAX_CAUGHT_LENGTH)) {
    return `Keep each submission to ${MAX_CAUGHT_LENGTH} characters or fewer.`;
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
  const landedIds = knownTechniqueIds(input.landedIds, techniques);
  const caughtWith = cleanCaught(input.caughtWith);
  return {
    date: input.date,
    durationMinutes: input.durationMinutes,
    type: input.type,
    ...(input.kind ? { kind: input.kind } : {}),
    ...(input.rounds !== undefined ? { rounds: input.rounds } : {}),
    ...(notes ? { notes } : {}),
    ...(techniqueIds.length > 0 ? { techniqueIds } : {}),
    ...(landedIds.length > 0 ? { landedIds } : {}),
    ...(caughtWith.length > 0 ? { caughtWith } : {}),
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

function named(ids: string[] | undefined, techniques: Technique[]): Technique[] {
  const byId = new Map(techniques.map((technique) => [technique.id, technique]));
  return (ids ?? []).flatMap((id) => byId.get(id) ?? []);
}

/** The techniques a session worked on, in the order they were ticked. */
export function sessionTechniques(session: Session, techniques: Technique[]): Technique[] {
  return named(session.techniqueIds, techniques);
}

/** The techniques landed in rolling in a session, in the order they were ticked. */
export function sessionLanded(session: Session, techniques: Technique[]): Technique[] {
  return named(session.landedIds, techniques);
}

/** "Gi · Open mat · 6 rounds", leaving out what the session does not record. */
export function describeSession(session: Session): string {
  return [
    SESSION_TYPE_LABELS[session.type],
    session.kind && SESSION_KIND_LABELS[session.kind],
    session.rounds !== undefined && formatRounds(session.rounds),
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * Keeps sessions of the chosen type where every word searched for appears in the notes, in the
 * kind of session, in the name of a technique worked on or landed, or in what the practitioner
 * was caught with.
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
    const names = [
      ...sessionTechniques(session, techniques),
      ...sessionLanded(session, techniques),
    ].map((technique) => technique.name);
    const kind = session.kind ? SESSION_KIND_LABELS[session.kind] : '';
    const text = [session.notes ?? '', kind, ...names, ...(session.caughtWith ?? [])]
      .join('\n')
      .toLowerCase();
    return words.every((word) => text.includes(word));
  });
}

export type SessionDefaults = Pick<Session, 'durationMinutes' | 'type'> & { kind: SessionKind };

/** Pre-fills the next session from the last one logged, so a regular class is one tap. */
export function sessionDefaults(sessions: Session[]): SessionDefaults {
  const last = sessions[sessions.length - 1];
  return {
    durationMinutes: last?.durationMinutes ?? DEFAULT_SESSION_MINUTES,
    type: last?.type ?? 'gi',
    kind: last?.kind ?? DEFAULT_SESSION_KIND,
  };
}

export interface MatTime {
  sessions: number;
  minutes: number;
  giSessions: number;
  nogiSessions: number;
  /** Rounds rolled, over the sessions that record them. */
  rounds: number;
}

export function summarize(sessions: Session[]): MatTime {
  return sessions.reduce<MatTime>(
    (total, s) => ({
      sessions: total.sessions + 1,
      minutes: total.minutes + s.durationMinutes,
      giSessions: total.giSessions + (s.type === 'gi' ? 1 : 0),
      nogiSessions: total.nogiSessions + (s.type === 'nogi' ? 1 : 0),
      rounds: total.rounds + (s.rounds ?? 0),
    }),
    { sessions: 0, minutes: 0, giSessions: 0, nogiSessions: 0, rounds: 0 },
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

export interface CaughtEntry {
  /** As it was spelt on the most recent session. */
  name: string;
  /** Sessions it was recorded on. */
  sessions: number;
  /** The date of the most recent of them. */
  last: string;
}

/**
 * What the practitioner has been caught with, most sessions first, then most recent, then by
 * name. A name counts once a session, and the same name in another case is the same name.
 */
export function caughtTally(sessions: Session[]): CaughtEntry[] {
  const entries = new Map<string, CaughtEntry>();
  for (const session of sessions) {
    for (const name of cleanCaught(session.caughtWith)) {
      const key = name.toLowerCase();
      const soFar = entries.get(key);
      const newer = !soFar || session.date >= soFar.last;
      entries.set(key, {
        name: newer ? name : soFar.name,
        sessions: (soFar?.sessions ?? 0) + 1,
        last: newer ? session.date : soFar.last,
      });
    }
  }
  return [...entries.values()].sort(
    (a, b) =>
      b.sessions - a.sessions ||
      b.last.localeCompare(a.last) ||
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  );
}
