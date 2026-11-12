import { addDays, daysBetween, isIsoDate } from './dates';
import { MAX_NOTES_LENGTH, sortSessions } from './sessions';
import { daysOffBetween } from './timeOff';
import {
  newId,
  POSITIONS,
  TECHNIQUE_STATUSES,
  type AppData,
  type Position,
  type Result,
  type Session,
  type Technique,
  type TechniqueStatus,
  type TimeOff,
} from './types';

export type TechniqueInput = Omit<Technique, 'id' | 'addedOn' | 'statusSince'>;

export const MAX_TECHNIQUE_NAME_LENGTH = 60;
export const MAX_TECHNIQUES = 300;
export const MAX_LINK_LENGTH = 500;
/** A technique still being worked on goes stale after this many days without training it. */
export const STALE_DAYS = 30;

export const POSITION_LABELS: Record<Position, string> = {
  standing: 'Standing',
  guard: 'Guard',
  passing: 'Guard passing',
  'half-guard': 'Half guard',
  'side-control': 'Side control',
  mount: 'Mount',
  back: 'Back',
  turtle: 'Turtle',
  legs: 'Leg entanglements',
  other: 'Other',
};

export const STATUS_LABELS: Record<TechniqueStatus, string> = {
  learning: 'Learning',
  drilling: 'Drilling',
  landing: 'Landing in rolling',
};

/**
 * A web link in the form it is stored: trimmed, with `https://` added when no scheme was typed.
 * Undefined for a blank; null for anything that is not an http or https address, which is all a
 * link may be, since it is opened when tapped.
 */
export function cleanLink(value: unknown): string | undefined | null {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return undefined;
  if (text.length > MAX_LINK_LENGTH || /\s/.test(text)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(withScheme);
    const web = url.protocol === 'http:' || url.protocol === 'https:';
    return web && url.hostname.includes('.') ? url.href : null;
  } catch {
    return null;
  }
}

/** The site a link goes to, such as "youtube.com", for showing in place of the whole address. */
export function linkHost(link: string): string {
  try {
    return new URL(link).hostname.replace(/^www\./, '');
  } catch {
    return link;
  }
}

/** Names are compared without regard to case or surrounding spaces. */
function nameKey(name: string): string {
  return name.trim().toLowerCase();
}

/** `others` are the techniques the name must not repeat. */
export function validateTechnique(input: TechniqueInput, others: Technique[]): string | null {
  if (typeof input.name !== 'string' || !input.name.trim()) return 'Enter the technique name.';
  if (input.name.trim().length > MAX_TECHNIQUE_NAME_LENGTH) {
    return `Keep the name to ${MAX_TECHNIQUE_NAME_LENGTH} characters or fewer.`;
  }
  if (!POSITIONS.includes(input.position)) return 'Choose a position.';
  if (!TECHNIQUE_STATUSES.includes(input.status)) return 'Choose how far along you are.';
  if ((input.notes ?? '').trim().length > MAX_NOTES_LENGTH) {
    return `Keep notes to ${MAX_NOTES_LENGTH} characters or fewer.`;
  }
  if (cleanLink(input.link) === null) {
    return 'Enter a web address for the link, such as youtube.com/watch?v=..., or leave it blank.';
  }
  const clash = others.find((other) => nameKey(other.name) === nameKey(input.name));
  if (clash) return `You already have a technique called ${clash.name}.`;
  return null;
}

function clean(input: TechniqueInput): TechniqueInput {
  const notes = input.notes?.trim();
  const link = cleanLink(input.link);
  return {
    name: input.name.trim(),
    position: input.position,
    status: input.status,
    ...(notes ? { notes } : {}),
    ...(link ? { link } : {}),
  };
}

export function addTechnique(data: AppData, input: TechniqueInput, today: string): Result<AppData> {
  const error = validateTechnique(input, data.techniques);
  if (error) return { ok: false, error };
  if (data.techniques.length >= MAX_TECHNIQUES) {
    return { ok: false, error: `The journal can hold up to ${MAX_TECHNIQUES} techniques.` };
  }
  const technique: Technique = {
    id: newId(),
    ...clean(input),
    addedOn: today,
    statusSince: today,
  };
  return { ok: true, value: { ...data, techniques: [...data.techniques, technique] } };
}

/**
 * Editing a technique keeps the day it was added and its place in past sessions. A change of
 * stage is dated today; any other edit leaves the stage's date alone.
 */
export function updateTechnique(
  data: AppData,
  id: string,
  input: TechniqueInput,
  today: string,
): Result<AppData> {
  const existing = data.techniques.find((technique) => technique.id === id);
  if (!existing) return { ok: false, error: 'That technique no longer exists.' };
  const error = validateTechnique(
    input,
    data.techniques.filter((technique) => technique.id !== id),
  );
  if (error) return { ok: false, error };
  return {
    ok: true,
    value: {
      ...data,
      techniques: data.techniques.map((technique) =>
        technique.id === id
          ? {
              id,
              ...clean(input),
              addedOn: existing.addedOn,
              statusSince: input.status === existing.status ? existing.statusSince : today,
            }
          : technique,
      ),
    },
  };
}

/** The stage a technique moves to next, or null once it is landing in rolling. */
export function nextStatus(status: TechniqueStatus): TechniqueStatus | null {
  return TECHNIQUE_STATUSES[TECHNIQUE_STATUSES.indexOf(status) + 1] ?? null;
}

/** Moves a technique to another stage, dated today. */
export function setTechniqueStatus(
  data: AppData,
  id: string,
  status: TechniqueStatus,
  today: string,
): Result<AppData> {
  const existing = data.techniques.find((technique) => technique.id === id);
  if (!existing) return { ok: false, error: 'That technique no longer exists.' };
  if (!TECHNIQUE_STATUSES.includes(status)) {
    return { ok: false, error: 'Choose how far along you are.' };
  }
  if (status === existing.status) return { ok: true, value: data };
  return {
    ok: true,
    value: {
      ...data,
      techniques: data.techniques.map((technique) =>
        technique.id === id ? { ...technique, status, statusSince: today } : technique,
      ),
    },
  };
}

/** Whether the technique was landed in rolling in the session. */
export function landedIn(technique: Technique, session: Session): boolean {
  return session.landedIds?.includes(technique.id) ?? false;
}

/** The sessions a technique was worked on or landed in, newest first. */
export function sessionsFor(technique: Technique, sessions: Session[]): Session[] {
  return sortSessions(
    sessions.filter(
      (session) => session.techniqueIds?.includes(technique.id) || landedIn(technique, session),
    ),
  );
}

/**
 * Sessions the technique was trained in up to the day it started landing in rolling, or null
 * if it is not there yet.
 */
export function sessionsToLand(technique: Technique, sessions: Session[]): number | null {
  if (technique.status !== 'landing') return null;
  return sessionsFor(technique, sessions).filter(
    (session) => session.date <= technique.statusSince,
  ).length;
}

/**
 * Deleting a technique also takes it off the sessions it was ticked on. The sessions stay. A
 * competition match won with it keeps the technique's name, as words.
 */
export function deleteTechnique(data: AppData, id: string): AppData {
  const without = (ids: string[] | undefined) => ids?.filter((other) => other !== id) ?? [];
  const deleted = data.techniques.find((technique) => technique.id === id);
  return {
    ...data,
    techniques: data.techniques.filter((technique) => technique.id !== id),
    competitions: data.competitions.map((competition) => {
      if (!competition.matches.some((match) => match.techniqueId === id)) return competition;
      return {
        ...competition,
        matches: competition.matches.map((match) => {
          if (match.techniqueId !== id) return match;
          const { techniqueId: _techniqueId, ...rest } = match;
          return deleted ? { ...rest, submission: deleted.name } : rest;
        }),
      };
    }),
    sessions: data.sessions.map((session) => {
      if (!session.techniqueIds?.includes(id) && !session.landedIds?.includes(id)) return session;
      const { techniqueIds, landedIds, ...rest } = session;
      const worked = without(techniqueIds);
      const landed = without(landedIds);
      return {
        ...rest,
        ...(worked.length > 0 ? { techniqueIds: worked } : {}),
        ...(landed.length > 0 ? { landedIds: landed } : {}),
      };
    }),
  };
}

/** Alphabetical, ignoring case. */
export function sortTechniques(techniques: Technique[]): Technique[] {
  return [...techniques].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  );
}

export interface PositionGroup {
  position: Position;
  techniques: Technique[];
}

/** Techniques under their position, positions in their usual order, empty ones left out. */
export function groupByPosition(techniques: Technique[]): PositionGroup[] {
  const sorted = sortTechniques(techniques);
  return POSITIONS.map((position) => ({
    position,
    techniques: sorted.filter((technique) => technique.position === position),
  })).filter((group) => group.techniques.length > 0);
}

export type StatusCounts = Record<TechniqueStatus, number>;

export function statusCounts(techniques: Technique[]): StatusCounts {
  const counts: StatusCounts = { learning: 0, drilling: 0, landing: 0 };
  for (const technique of techniques) counts[technique.status] += 1;
  return counts;
}

export interface TechniqueActivity {
  /** Sessions the technique was worked on or landed in. */
  sessions: number;
  /** The date of the most recent of them, or null when there are none. */
  lastTrained: string | null;
  /** Sessions the technique was landed in rolling. */
  landed: number;
  /** The date of the most recent of those, or null when there are none. */
  lastLanded: string | null;
}

const NO_ACTIVITY: TechniqueActivity = {
  sessions: 0,
  lastTrained: null,
  landed: 0,
  lastLanded: null,
};

function later(soFar: string | null, date: string): string {
  return soFar !== null && soFar > date ? soFar : date;
}

/**
 * How often and how recently each technique has been trained and landed, by technique id.
 * Landing a technique in a roll counts as training it, whether or not it was also ticked as
 * worked on.
 */
export function techniqueActivity(sessions: Session[]): Map<string, TechniqueActivity> {
  const activity = new Map<string, TechniqueActivity>();
  for (const session of sessions) {
    const landed = new Set(session.landedIds ?? []);
    for (const id of new Set([...(session.techniqueIds ?? []), ...landed])) {
      const soFar = activity.get(id) ?? NO_ACTIVITY;
      const didLand = landed.has(id);
      activity.set(id, {
        sessions: soFar.sessions + 1,
        lastTrained: later(soFar.lastTrained, session.date),
        landed: soFar.landed + (didLand ? 1 : 0),
        lastLanded: didLand ? later(soFar.lastLanded, session.date) : soFar.lastLanded,
      });
    }
  }
  return activity;
}

export function activityOf(
  activity: Map<string, TechniqueActivity>,
  technique: Technique,
): TechniqueActivity {
  return activity.get(technique.id) ?? NO_ACTIVITY;
}

/** A technique counts as being worked on until it is landing in rolling. */
export function isWorkingOn(technique: Technique): boolean {
  return technique.status !== 'landing';
}

export interface Untrained {
  /** Days the technique could have been trained and was not: time off is left out. */
  days: number;
  /** Days of time off left out of the count. */
  daysOff: number;
}

/**
 * How long since the technique was last trained, or since it was added if it has not been
 * trained since then. The clock is paused during time off, so those days are counted apart.
 */
export function untrained(
  technique: Technique,
  activity: Pick<TechniqueActivity, 'lastTrained'>,
  today: string,
  timeOff: TimeOff[] = [],
): Untrained {
  const { lastTrained } = activity;
  const since =
    lastTrained !== null && lastTrained > technique.addedOn ? lastTrained : technique.addedOn;
  if (!isIsoDate(since) || since >= today) return { days: 0, daysOff: 0 };
  // The day it was last trained is not a day untrained, even if time off began that day.
  const daysOff = daysOffBetween(timeOff, addDays(since, 1), today, today);
  return { days: daysBetween(since, today) - daysOff, daysOff };
}

/** Days untrained, leaving out time off. */
export function daysUntrained(
  technique: Technique,
  activity: Pick<TechniqueActivity, 'lastTrained'>,
  today: string,
  timeOff: TimeOff[] = [],
): number {
  return untrained(technique, activity, today, timeOff).days;
}

/** Stale means still being worked on, and not trained for 30 days, leaving out time off. */
export function isStale(
  technique: Technique,
  activity: Pick<TechniqueActivity, 'lastTrained'>,
  today: string,
  timeOff: TimeOff[] = [],
): boolean {
  return isWorkingOn(technique) && daysUntrained(technique, activity, today, timeOff) >= STALE_DAYS;
}

/** "31 days", adding ", not counting 28 days off" when time off was left out. */
export function formatUntrained({ days, daysOff }: Untrained): string {
  const count = (amount: number) => `${amount} ${amount === 1 ? 'day' : 'days'}`;
  return daysOff > 0 ? `${count(days)}, not counting ${count(daysOff)} off` : count(days);
}

export interface TechniqueFocus {
  counts: StatusCounts;
  /**
   * Being worked on and trained in the last 30 days, most recently trained first. A technique
   * that only time off is keeping from going stale is in neither list.
   */
  recent: { technique: Technique; lastTrained: string }[];
  /** Being worked on and not trained for 30 days, leaving out time off; longest wait first. */
  stale: ({ technique: Technique } & Untrained)[];
}

/** What the practitioner is working on at the moment, and what they have let slip. */
export function techniqueFocus(
  data: Pick<AppData, 'techniques' | 'sessions'> & Partial<Pick<AppData, 'timeOff'>>,
  today: string,
): TechniqueFocus {
  const timeOff = data.timeOff ?? [];
  const activity = techniqueActivity(data.sessions);
  const recent: TechniqueFocus['recent'] = [];
  const stale: TechniqueFocus['stale'] = [];
  for (const technique of sortTechniques(data.techniques.filter(isWorkingOn))) {
    const own = activityOf(activity, technique);
    if (isStale(technique, own, today, timeOff)) {
      stale.push({ technique, ...untrained(technique, own, today, timeOff) });
    } else if (own.lastTrained !== null && daysBetween(own.lastTrained, today) < STALE_DAYS) {
      recent.push({ technique, lastTrained: own.lastTrained });
    }
  }
  return {
    counts: statusCounts(data.techniques),
    recent: recent.sort((a, b) => b.lastTrained.localeCompare(a.lastTrained)),
    stale: stale.sort((a, b) => b.days - a.days),
  };
}
