import { isIsoDate } from '../domain/dates';
import { highestPromotion } from '../domain/promotions';
import { isValidRank, rankValue } from '../domain/rank';
import { MAX_SESSION_MINUTES } from '../domain/sessions';
import {
  emptyData,
  SESSION_TYPES,
  type AppData,
  type Promotion,
  type Rank,
  type Session,
  type SessionType,
} from '../domain/types';

export const STORAGE_KEY = 'bjj-belt-tracker:v1';

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

function compact<T>(items: unknown, convert: (value: unknown) => T | null): T[] {
  if (!Array.isArray(items)) return [];
  return items.map(convert).filter((item): item is T => item !== null);
}

/** Turns whatever was stored into valid app data, dropping records that don't hold up. */
export function parseData(raw: unknown): AppData {
  if (!isObject(raw)) return emptyData();
  const promotions = compact(raw.promotions, toPromotion);
  const sessions = compact(raw.sessions, toSession);

  let rank: Rank | null =
    isObject(raw.rank) && isValidRank(raw.rank)
      ? { belt: raw.rank.belt as Rank['belt'], stripes: raw.rank.stripes as number }
      : null;
  const top = highestPromotion(promotions);
  if (top && (!rank || rankValue(rank) < rankValue(top))) {
    rank = { belt: top.belt, stripes: top.stripes };
  }
  return { rank, promotions, sessions };
}

export function loadData(): AppData {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored ? parseData(JSON.parse(stored)) : emptyData();
  } catch {
    return emptyData();
  }
}

/** Returns false when the browser refused the write (private mode, quota). */
export function saveData(data: AppData): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}
