import { MAX_MATCHES } from './competitions';
import { parseData } from './parse';
import { findHistoryConflict, highestPromotion } from './promotions';
import { rankValue } from './rank';
import { MAX_TECHNIQUES } from './techniques';
import { MAX_TIME_OFF } from './timeOff';
import type { AppData, Competition, Match, Rank, Result, Session } from './types';

/** How many records of each kind a merge brings onto the device. */
export interface MergeCounts {
  promotions: number;
  sessions: number;
  competitions: number;
  /** Matches added to competitions that were already on the device. */
  matches: number;
  techniques: number;
  timeOff: number;
}

export interface Merged {
  data: AppData;
  added: MergeCounts;
  /** Records in the file that the device already had, which were left as the device has them. */
  alreadyHere: number;
  /** Matches left out because their competition already holds as many as the app keeps. */
  matchesLeftOut: number;
  /** The rank the device moves up to, when the file's is higher; null when it stays as it is. */
  rankRaisedTo: Rank | null;
  /** The weekly goal taken from the file, when the device had none; null otherwise. */
  goalSetTo: number | null;
}

/** Whether adding the file would change anything on the device at all. */
export function changesAnything(merged: Merged): boolean {
  return totalAdded(merged.added) > 0 || merged.rankRaisedTo !== null || merged.goalSetTo !== null;
}

/** Why some matches in a file stay out of a merge. */
export const MAX_MATCHES_NOTE = `a competition holds up to ${MAX_MATCHES} matches, and the one on this device is full.`;

export const NOTHING_ADDED: MergeCounts = {
  promotions: 0,
  sessions: 0,
  competitions: 0,
  matches: 0,
  techniques: 0,
  timeOff: 0,
};

export function totalAdded(added: MergeCounts): number {
  return Object.values(added).reduce((sum, amount) => sum + amount, 0);
}

function nameKey(name: string): string {
  return name.trim().toLowerCase();
}

function higher(a: Rank | null, b: Rank | null): Rank | null {
  if (!a) return b;
  if (!b) return a;
  return rankValue(b) > rankValue(a) ? b : a;
}

/**
 * Adds what a backup holds to what is on the device, for someone who logs on two devices.
 *
 * Records are matched by their id. One that is on both is left as the device has it: records
 * carry no time of last change, so there is no telling which copy is newer. For the same reason
 * nothing is ever removed, so a record deleted on this device comes back if the file still has
 * it.
 *
 * Two things are matched by what they are, not their id, because each device makes its own ids:
 * a technique with the same name is the same technique (the journal allows a name once), and a
 * promotion to a rank the device already has is the same promotion.
 */
export function mergeData(device: AppData, file: AppData, today: string): Result<Merged> {
  const added: MergeCounts = { ...NOTHING_ADDED };
  let alreadyHere = 0;
  let matchesLeftOut = 0;

  // Techniques first, since sessions and matches point at them. Where the file's technique is
  // the device's under another id, what points at it in the file is pointed at the device's.
  const techniques = [...device.techniques];
  const sameId = new Set(device.techniques.map((technique) => technique.id));
  const byName = new Map(device.techniques.map((technique) => [nameKey(technique.name), technique.id]));
  const renamed = new Map<string, string>();
  for (const technique of file.techniques) {
    const twin = byName.get(nameKey(technique.name));
    if (sameId.has(technique.id)) {
      alreadyHere += 1;
    } else if (twin !== undefined) {
      renamed.set(technique.id, twin);
      alreadyHere += 1;
    } else {
      techniques.push(technique);
      byName.set(nameKey(technique.name), technique.id);
      added.techniques += 1;
    }
  }
  if (techniques.length > MAX_TECHNIQUES) {
    return {
      ok: false,
      error: `Together the two journals hold more than ${MAX_TECHNIQUES} techniques, which is the most the app keeps.`,
    };
  }
  const own = (id: string) => renamed.get(id) ?? id;
  const ownIds = (ids: string[] | undefined) => (ids ? [...new Set(ids.map(own))] : undefined);

  const pointSession = (session: Session): Session => {
    const techniqueIds = ownIds(session.techniqueIds);
    const landedIds = ownIds(session.landedIds);
    return {
      ...session,
      ...(techniqueIds ? { techniqueIds } : {}),
      ...(landedIds ? { landedIds } : {}),
    };
  };
  const pointMatch = (match: Match): Match =>
    match.techniqueId ? { ...match, techniqueId: own(match.techniqueId) } : match;

  const sessionIds = new Set(device.sessions.map((session) => session.id));
  const sessions = [...device.sessions];
  for (const session of file.sessions) {
    if (sessionIds.has(session.id)) {
      alreadyHere += 1;
    } else {
      sessions.push(pointSession(session));
      added.sessions += 1;
    }
  }

  // A competition on both keeps the device's details and gains the matches it is missing, since
  // matches are often added later, and not always on the device the competition was logged on.
  const fileCompetitions = new Map(file.competitions.map((competition) => [competition.id, competition]));
  const competitions: Competition[] = [];
  for (const competition of device.competitions) {
    const other = fileCompetitions.get(competition.id);
    if (!other) {
      competitions.push(competition);
      continue;
    }
    alreadyHere += 1;
    const matchIds = new Set(competition.matches.map((match) => match.id));
    const missing = other.matches.filter((match) => !matchIds.has(match.id)).map(pointMatch);
    const room = Math.max(0, MAX_MATCHES - competition.matches.length);
    const gained = missing.slice(0, room);
    alreadyHere += other.matches.length - missing.length;
    added.matches += gained.length;
    matchesLeftOut += missing.length - gained.length;
    competitions.push(
      gained.length > 0 ? { ...competition, matches: [...competition.matches, ...gained] } : competition,
    );
  }
  const competitionIds = new Set(device.competitions.map((competition) => competition.id));
  for (const competition of file.competitions) {
    if (competitionIds.has(competition.id)) continue;
    competitions.push({ ...competition, matches: competition.matches.map(pointMatch) });
    added.competitions += 1;
  }

  const timeOffIds = new Set(device.timeOff.map((period) => period.id));
  const timeOff = [...device.timeOff];
  for (const period of file.timeOff) {
    if (timeOffIds.has(period.id)) {
      alreadyHere += 1;
    } else {
      timeOff.push(period);
      added.timeOff += 1;
    }
  }
  if (timeOff.length > MAX_TIME_OFF) {
    return {
      ok: false,
      error: `Together the two hold more than ${MAX_TIME_OFF} periods of time off, which is the most the app keeps.`,
    };
  }

  const promotionIds = new Set(device.promotions.map((promotion) => promotion.id));
  const ranks = new Set(device.promotions.map(rankValue));
  const promotions = [...device.promotions];
  for (const promotion of file.promotions) {
    if (promotionIds.has(promotion.id) || ranks.has(rankValue(promotion))) {
      alreadyHere += 1;
    } else {
      promotions.push(promotion);
      ranks.add(rankValue(promotion));
      added.promotions += 1;
    }
  }
  const conflict = findHistoryConflict(promotions, today);
  if (conflict) {
    return {
      ok: false,
      error: `The promotions in the backup don't fit with the ones on this device: ${conflict}`,
    };
  }

  const top = highestPromotion(promotions);
  const rank = higher(
    higher(device.rank, file.rank),
    top ? { belt: top.belt, stripes: top.stripes } : null,
  );
  const rankRaised = rank !== null && (device.rank === null || rankValue(rank) > rankValue(device.rank));
  const merged: AppData = {
    rank,
    promotions,
    sessions,
    // The device's own goal stands; the file's is taken only when the device has none.
    weeklyGoal: device.weeklyGoal ?? file.weeklyGoal,
    competitions,
    techniques,
    timeOff,
  };
  // Both halves were valid alone; this makes sure the whole is too.
  return {
    ok: true,
    value: {
      data: parseData(merged),
      added,
      alreadyHere,
      matchesLeftOut,
      rankRaisedTo: rankRaised ? rank : null,
      goalSetTo: device.weeklyGoal === null ? file.weeklyGoal : null,
    },
  };
}

/** "12 sessions, 1 promotion and 2 techniques", naming only what was added. */
export function describeAdded(added: MergeCounts): string {
  const parts = [
    [added.promotions, 'promotion', 'promotions'],
    [added.sessions, 'session', 'sessions'],
    [added.competitions, 'competition', 'competitions'],
    [added.matches, 'match', 'matches'],
    [added.techniques, 'technique', 'techniques'],
    [added.timeOff, 'period of time off', 'periods of time off'],
  ]
    .filter(([amount]) => (amount as number) > 0)
    .map(([amount, one, many]) => `${amount} ${amount === 1 ? one : many}`);
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}
