import { MAX_MATCHES, MAX_NAME_LENGTH, MAX_SUBMISSION_LENGTH } from './competitions';
import { isIsoDate } from './dates';
import { isValidGoal } from './goals';
import { highestPromotion } from './promotions';
import { isValidRank, rankValue } from './rank';
import {
  cleanCaught,
  isValidRounds,
  knownTechniqueIds,
  MAX_CAUGHT,
  MAX_CAUGHT_LENGTH,
  MAX_NOTES_LENGTH,
  MAX_SESSION_MINUTES,
  MAX_SESSION_TECHNIQUES,
} from './sessions';
import { cleanLink, MAX_TECHNIQUE_NAME_LENGTH, MAX_TECHNIQUES } from './techniques';
import { MAX_TIME_OFF } from './timeOff';
import {
  emptyData,
  MATCH_METHODS,
  MATCH_RESULTS,
  MEDALS,
  POSITIONS,
  SESSION_KINDS,
  SESSION_TYPES,
  TECHNIQUE_STATUSES,
  TIME_OFF_REASONS,
  type AppData,
  type Competition,
  type Match,
  type MatchMethod,
  type MatchResult,
  type Medal,
  type Position,
  type Promotion,
  type Rank,
  type Session,
  type SessionKind,
  type SessionType,
  type Technique,
  type TechniqueStatus,
  type TimeOff,
  type TimeOffReason,
} from './types';

type Loose = Record<string, unknown>;

function isObject(value: unknown): value is Loose {
  return typeof value === 'object' && value !== null;
}

/** Trimmed text, cut to the longest the app would accept, or undefined when there is none. */
function optionalText(value: unknown, max: number = Number.POSITIVE_INFINITY): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim().slice(0, max).trim();
  return text || undefined;
}

function toPromotion(value: unknown): Promotion | null {
  if (!isObject(value) || typeof value.id !== 'string') return null;
  if (!isValidRank(value) || !isIsoDate(value.date)) return null;
  const promotedBy = optionalText(value.promotedBy);
  const academy = optionalText(value.academy);
  return {
    id: value.id,
    belt: value.belt as Rank['belt'],
    stripes: value.stripes as number,
    date: value.date,
    ...(promotedBy ? { promotedBy } : {}),
    ...(academy ? { academy } : {}),
  };
}

function toTechnique(value: unknown): Technique | null {
  if (!isObject(value) || typeof value.id !== 'string' || !isIsoDate(value.addedOn)) return null;
  const name = optionalText(value.name, MAX_TECHNIQUE_NAME_LENGTH);
  if (!name || !POSITIONS.includes(value.position as Position)) return null;
  if (!TECHNIQUE_STATUSES.includes(value.status as TechniqueStatus)) return null;
  const notes = optionalText(value.notes, MAX_NOTES_LENGTH);
  // A link that is not a web address is dropped; the technique is kept.
  const link = cleanLink(value.link);
  return {
    id: value.id,
    name,
    position: value.position as Position,
    status: value.status as TechniqueStatus,
    ...(notes ? { notes } : {}),
    ...(link ? { link } : {}),
    addedOn: value.addedOn,
    // Techniques saved before stages were dated count from the day they were added.
    statusSince: isIsoDate(value.statusSince) ? value.statusSince : value.addedOn,
  };
}

/** Links to techniques that are not in the journal are dropped; the session is kept. */
function toSession(value: unknown, techniques: Technique[]): Session | null {
  if (!isObject(value) || typeof value.id !== 'string' || !isIsoDate(value.date)) return null;
  const minutes = value.durationMinutes;
  if (
    typeof minutes !== 'number' ||
    !Number.isInteger(minutes) ||
    minutes < 1 ||
    minutes > MAX_SESSION_MINUTES
  ) {
    return null;
  }
  if (!SESSION_TYPES.includes(value.type as SessionType)) return null;
  const notes = optionalText(value.notes, MAX_NOTES_LENGTH);
  const techniqueIds = knownTechniqueIds(value.techniqueIds, techniques).slice(
    0,
    MAX_SESSION_TECHNIQUES,
  );
  const landedIds = knownTechniqueIds(value.landedIds, techniques).slice(
    0,
    MAX_SESSION_TECHNIQUES,
  );
  const caughtWith = cleanCaught(value.caughtWith)
    .filter((name) => name.length <= MAX_CAUGHT_LENGTH)
    .slice(0, MAX_CAUGHT);
  const kind = SESSION_KINDS.includes(value.kind as SessionKind)
    ? (value.kind as SessionKind)
    : undefined;
  return {
    id: value.id,
    date: value.date,
    durationMinutes: minutes,
    type: value.type as SessionType,
    ...(kind ? { kind } : {}),
    ...(isValidRounds(value.rounds) ? { rounds: value.rounds } : {}),
    ...(notes ? { notes } : {}),
    ...(techniqueIds.length > 0 ? { techniqueIds } : {}),
    ...(landedIds.length > 0 ? { landedIds } : {}),
    ...(caughtWith.length > 0 ? { caughtWith } : {}),
  };
}

function toTimeOff(value: unknown): TimeOff | null {
  if (!isObject(value) || typeof value.id !== 'string' || !isIsoDate(value.startDate)) return null;
  if (!TIME_OFF_REASONS.includes(value.reason as TimeOffReason)) return null;
  // A last day that cannot be right spoils the record: reading it as still going on would turn
  // a period that ended into one that never does.
  // A blank one is no last day, as it is in the form.
  const endDate = value.endDate === '' ? undefined : (value.endDate ?? undefined);
  if (endDate !== undefined && !(isIsoDate(endDate) && endDate >= value.startDate)) return null;
  const notes = optionalText(value.notes, MAX_NOTES_LENGTH);
  return {
    id: value.id,
    startDate: value.startDate,
    ...(endDate ? { endDate } : {}),
    reason: value.reason as TimeOffReason,
    ...(notes ? { notes } : {}),
  };
}

/** A link to a technique that is not in the journal is dropped; the match is kept. */
function toMatch(value: unknown, techniques: Technique[]): Match | null {
  if (!isObject(value) || typeof value.id !== 'string') return null;
  if (!MATCH_RESULTS.includes(value.result as MatchResult)) return null;
  const result = value.result as MatchResult;
  if (result === 'draw') {
    const opponent = optionalText(value.opponent, MAX_NAME_LENGTH);
    return { id: value.id, result, ...(opponent ? { opponent } : {}) };
  }
  if (!MATCH_METHODS.includes(value.method as MatchMethod)) return null;
  const method = value.method as MatchMethod;
  const techniqueId =
    result === 'win' &&
    method === 'submission' &&
    techniques.some((technique) => technique.id === value.techniqueId)
      ? (value.techniqueId as string)
      : undefined;
  const submission =
    method === 'submission' && !techniqueId
      ? optionalText(value.submission, MAX_SUBMISSION_LENGTH)
      : undefined;
  const opponent = optionalText(value.opponent, MAX_NAME_LENGTH);
  return {
    id: value.id,
    result,
    method,
    ...(submission ? { submission } : {}),
    ...(techniqueId ? { techniqueId } : {}),
    ...(opponent ? { opponent } : {}),
  };
}

/** Keeps the valid records with unique ids and counts the ones left out. */
function compact<T extends { id: string }>(
  items: unknown,
  convert: (value: unknown) => T | null,
): { kept: T[]; skipped: number } {
  if (!Array.isArray(items)) return { kept: [], skipped: 0 };
  const seen = new Set<string>();
  const kept: T[] = [];
  for (const item of items) {
    const record = convert(item);
    if (record && !seen.has(record.id)) {
      seen.add(record.id);
      kept.push(record);
    }
  }
  return { kept, skipped: items.length - kept.length };
}

function toCompetition(
  value: unknown,
  techniques: Technique[],
): { competition: Competition; skippedMatches: number } | null {
  if (!isObject(value) || typeof value.id !== 'string' || !isIsoDate(value.date)) return null;
  const name = optionalText(value.name, MAX_NAME_LENGTH);
  if (!name || !SESSION_TYPES.includes(value.type as SessionType)) return null;
  const division = optionalText(value.division, MAX_NAME_LENGTH);
  const medal = MEDALS.includes(value.medal as Medal) ? (value.medal as Medal) : undefined;
  const notes = optionalText(value.notes, MAX_NOTES_LENGTH);
  const matches = compact(value.matches, (match) => toMatch(match, techniques));
  const kept = matches.kept.slice(0, MAX_MATCHES);
  return {
    competition: {
      id: value.id,
      date: value.date,
      name,
      type: value.type as SessionType,
      ...(division ? { division } : {}),
      ...(medal ? { medal } : {}),
      ...(notes ? { notes } : {}),
      matches: kept,
    },
    skippedMatches: matches.skipped + (matches.kept.length - kept.length),
  };
}

export interface ParseReport {
  data: AppData;
  /** Records that were malformed or duplicated, and so left out. */
  skipped: number;
}

/** Turns untrusted input into valid app data, dropping records that don't hold up. */
export function parseDataWithReport(raw: unknown): ParseReport {
  if (!isObject(raw)) return { data: emptyData(), skipped: 0 };
  const promotions = compact(raw.promotions, toPromotion);

  // A technique whose name repeats an earlier one is left out, as the app would refuse it.
  const names = new Set<string>();
  const parsedTechniques = compact(raw.techniques, (value) => {
    const technique = toTechnique(value);
    const key = technique?.name.toLowerCase();
    if (!technique || key === undefined || names.has(key)) return null;
    names.add(key);
    return technique;
  });
  const techniques = parsedTechniques.kept.slice(0, MAX_TECHNIQUES);
  const skippedTechniques =
    parsedTechniques.skipped + (parsedTechniques.kept.length - techniques.length);

  const sessions = compact(raw.sessions, (value) => toSession(value, techniques));

  let skippedMatches = 0;
  const competitions = compact(raw.competitions, (value) => {
    const converted = toCompetition(value, techniques);
    if (!converted) return null;
    skippedMatches += converted.skippedMatches;
    return converted.competition;
  });

  const parsedTimeOff = compact(raw.timeOff, toTimeOff);
  const timeOff = parsedTimeOff.kept.slice(0, MAX_TIME_OFF);
  const skippedTimeOff = parsedTimeOff.skipped + (parsedTimeOff.kept.length - timeOff.length);

  let rank: Rank | null =
    isObject(raw.rank) && isValidRank(raw.rank)
      ? { belt: raw.rank.belt as Rank['belt'], stripes: raw.rank.stripes as number }
      : null;
  const top = highestPromotion(promotions.kept);
  if (top && (!rank || rankValue(rank) < rankValue(top))) {
    rank = { belt: top.belt, stripes: top.stripes };
  }
  return {
    data: {
      rank,
      promotions: promotions.kept,
      sessions: sessions.kept,
      weeklyGoal: isValidGoal(raw.weeklyGoal) ? raw.weeklyGoal : null,
      competitions: competitions.kept,
      techniques,
      timeOff,
    },
    skipped:
      promotions.skipped +
      sessions.skipped +
      competitions.skipped +
      skippedMatches +
      skippedTechniques +
      skippedTimeOff,
  };
}

export function parseData(raw: unknown): AppData {
  return parseDataWithReport(raw).data;
}
