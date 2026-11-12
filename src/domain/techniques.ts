import { daysBetween, isIsoDate } from './dates';
import { MAX_NOTES_LENGTH, sortSessions } from './sessions';
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
} from './types';

export type TechniqueInput = Omit<Technique, 'id' | 'addedOn' | 'statusSince'>;

export const MAX_TECHNIQUE_NAME_LENGTH = 60;
export const MAX_TECHNIQUES = 300;
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
  const clash = others.find((other) => nameKey(other.name) === nameKey(input.name));
  if (clash) return `You already have a technique called ${clash.name}.`;
  return null;
}

function clean(input: TechniqueInput): TechniqueInput {
  const notes = input.notes?.trim();
  return {
    name: input.name.trim(),
    position: input.position,
    status: input.status,
    ...(notes ? { notes } : {}),
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

/** The sessions a technique was ticked on, newest first. */
export function sessionsFor(technique: Technique, sessions: Session[]): Session[] {
  return sortSessions(sessions.filter((session) => session.techniqueIds?.includes(technique.id)));
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

/** Deleting a technique also takes it off the sessions it was ticked on. The sessions stay. */
export function deleteTechnique(data: AppData, id: string): AppData {
  return {
    ...data,
    techniques: data.techniques.filter((technique) => technique.id !== id),
    sessions: data.sessions.map((session) => {
      if (!session.techniqueIds?.includes(id)) return session;
      const { techniqueIds, ...rest } = session;
      const left = techniqueIds.filter((techniqueId) => techniqueId !== id);
      return left.length > 0 ? { ...rest, techniqueIds: left } : rest;
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
  /** Sessions the technique was ticked on. */
  sessions: number;
  /** The date of the most recent of them, or null when there are none. */
  lastTrained: string | null;
}

const NO_ACTIVITY: TechniqueActivity = { sessions: 0, lastTrained: null };

/** How often and how recently each technique has been trained, by technique id. */
export function techniqueActivity(sessions: Session[]): Map<string, TechniqueActivity> {
  const activity = new Map<string, TechniqueActivity>();
  for (const session of sessions) {
    for (const id of new Set(session.techniqueIds ?? [])) {
      const soFar = activity.get(id) ?? NO_ACTIVITY;
      activity.set(id, {
        sessions: soFar.sessions + 1,
        lastTrained:
          soFar.lastTrained !== null && soFar.lastTrained > session.date
            ? soFar.lastTrained
            : session.date,
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

/**
 * Days since the technique was last trained, or since it was added if it has not been trained
 * since then.
 */
export function daysUntrained(
  technique: Technique,
  activity: TechniqueActivity,
  today: string,
): number {
  const { lastTrained } = activity;
  const since =
    lastTrained !== null && lastTrained > technique.addedOn ? lastTrained : technique.addedOn;
  return isIsoDate(since) ? daysBetween(since, today) : 0;
}

/** Stale means still being worked on, and not trained for 30 days. */
export function isStale(technique: Technique, activity: TechniqueActivity, today: string): boolean {
  return isWorkingOn(technique) && daysUntrained(technique, activity, today) >= STALE_DAYS;
}

export interface TechniqueFocus {
  counts: StatusCounts;
  /** Being worked on and trained in the last 30 days, most recently trained first. */
  recent: { technique: Technique; lastTrained: string }[];
  /** Being worked on and not trained for 30 days, longest wait first. */
  stale: { technique: Technique; days: number }[];
}

/** What the practitioner is working on at the moment, and what they have let slip. */
export function techniqueFocus(
  data: Pick<AppData, 'techniques' | 'sessions'>,
  today: string,
): TechniqueFocus {
  const activity = techniqueActivity(data.sessions);
  const recent: TechniqueFocus['recent'] = [];
  const stale: TechniqueFocus['stale'] = [];
  for (const technique of sortTechniques(data.techniques.filter(isWorkingOn))) {
    const own = activityOf(activity, technique);
    if (isStale(technique, own, today)) {
      stale.push({ technique, days: daysUntrained(technique, own, today) });
    } else if (own.lastTrained !== null) {
      recent.push({ technique, lastTrained: own.lastTrained });
    }
  }
  return {
    counts: statusCounts(data.techniques),
    recent: recent.sort((a, b) => b.lastTrained.localeCompare(a.lastTrained)),
    stale: stale.sort((a, b) => b.days - a.days),
  };
}
