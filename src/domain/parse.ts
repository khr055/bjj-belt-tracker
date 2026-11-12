import { MAX_MATCHES, MAX_NAME_LENGTH, MAX_SUBMISSION_LENGTH } from './competitions';
import { isIsoDate } from './dates';
import { isValidGoal } from './goals';
import { highestPromotion } from './promotions';
import { isValidRank, rankValue } from './rank';
import { MAX_NOTES_LENGTH, MAX_SESSION_MINUTES } from './sessions';
import {
  emptyData,
  MATCH_METHODS,
  MATCH_RESULTS,
  MEDALS,
  SESSION_TYPES,
  type AppData,
  type Competition,
  type Match,
  type MatchMethod,
  type MatchResult,
  type Medal,
  type Promotion,
  type Rank,
  type Session,
  type SessionType,
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

function toSession(value: unknown): Session | null {
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
  return {
    id: value.id,
    date: value.date,
    durationMinutes: minutes,
    type: value.type as SessionType,
    ...(notes ? { notes } : {}),
  };
}

function toMatch(value: unknown): Match | null {
  if (!isObject(value) || typeof value.id !== 'string') return null;
  if (!MATCH_RESULTS.includes(value.result as MatchResult)) return null;
  const result = value.result as MatchResult;
  if (result === 'draw') {
    const opponent = optionalText(value.opponent, MAX_NAME_LENGTH);
    return { id: value.id, result, ...(opponent ? { opponent } : {}) };
  }
  if (!MATCH_METHODS.includes(value.method as MatchMethod)) return null;
  const method = value.method as MatchMethod;
  const submission =
    method === 'submission' ? optionalText(value.submission, MAX_SUBMISSION_LENGTH) : undefined;
  const opponent = optionalText(value.opponent, MAX_NAME_LENGTH);
  return {
    id: value.id,
    result,
    method,
    ...(submission ? { submission } : {}),
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

function toCompetition(value: unknown): { competition: Competition; skippedMatches: number } | null {
  if (!isObject(value) || typeof value.id !== 'string' || !isIsoDate(value.date)) return null;
  const name = optionalText(value.name, MAX_NAME_LENGTH);
  if (!name || !SESSION_TYPES.includes(value.type as SessionType)) return null;
  const division = optionalText(value.division, MAX_NAME_LENGTH);
  const medal = MEDALS.includes(value.medal as Medal) ? (value.medal as Medal) : undefined;
  const notes = optionalText(value.notes, MAX_NOTES_LENGTH);
  const matches = compact(value.matches, toMatch);
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
  const sessions = compact(raw.sessions, toSession);

  let skippedMatches = 0;
  const competitions = compact(raw.competitions, (value) => {
    const converted = toCompetition(value);
    if (!converted) return null;
    skippedMatches += converted.skippedMatches;
    return converted.competition;
  });

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
    },
    skipped: promotions.skipped + sessions.skipped + competitions.skipped + skippedMatches,
  };
}

export function parseData(raw: unknown): AppData {
  return parseDataWithReport(raw).data;
}
