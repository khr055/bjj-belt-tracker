import { isIsoDate } from './dates';
import { highestPromotion } from './promotions';
import { isValidRank, rankValue } from './rank';
import { MAX_SESSION_MINUTES } from './sessions';
import {
  emptyData,
  SESSION_TYPES,
  type AppData,
  type Promotion,
  type Rank,
  type Session,
  type SessionType,
} from './types';

type Loose = Record<string, unknown>;

function isObject(value: unknown): value is Loose {
  return typeof value === 'object' && value !== null;
}

function optionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
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
  return { id: value.id, date: value.date, durationMinutes: minutes, type: value.type as SessionType };
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

export interface ParseReport {
  data: AppData;
  /** Promotions and sessions that were malformed or duplicated, and so left out. */
  skipped: number;
}

/** Turns untrusted input into valid app data, dropping records that don't hold up. */
export function parseDataWithReport(raw: unknown): ParseReport {
  if (!isObject(raw)) return { data: emptyData(), skipped: 0 };
  const promotions = compact(raw.promotions, toPromotion);
  const sessions = compact(raw.sessions, toSession);

  let rank: Rank | null =
    isObject(raw.rank) && isValidRank(raw.rank)
      ? { belt: raw.rank.belt as Rank['belt'], stripes: raw.rank.stripes as number }
      : null;
  const top = highestPromotion(promotions.kept);
  if (top && (!rank || rankValue(rank) < rankValue(top))) {
    rank = { belt: top.belt, stripes: top.stripes };
  }
  return {
    data: { rank, promotions: promotions.kept, sessions: sessions.kept },
    skipped: promotions.skipped + sessions.skipped,
  };
}

export function parseData(raw: unknown): AppData {
  return parseDataWithReport(raw).data;
}
