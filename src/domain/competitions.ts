import { daysBetween, isIsoDate } from './dates';
import { MAX_NOTES_LENGTH } from './sessions';
import {
  MATCH_METHODS,
  MATCH_RESULTS,
  MEDALS,
  newId,
  SESSION_TYPES,
  type AppData,
  type Competition,
  type Match,
  type MatchMethod,
  type MatchResult,
  type Medal,
  type Result,
  type Technique,
} from './types';

export type CompetitionInput = Omit<Competition, 'id' | 'matches'>;
export type MatchInput = Omit<Match, 'id'>;

export const MAX_NAME_LENGTH = 80;
export const MAX_SUBMISSION_LENGTH = 60;
export const MAX_MATCHES = 30;

export const RESULT_LABELS: Record<MatchResult, string> = { win: 'Win', loss: 'Loss', draw: 'Draw' };

export const METHOD_LABELS: Record<MatchMethod, string> = {
  submission: 'Submission',
  points: 'Points',
  advantages: 'Advantages',
  decision: "Referee's decision",
  disqualification: 'Disqualification',
};

const METHOD_PHRASES: Record<MatchMethod, string> = {
  submission: 'by submission',
  points: 'on points',
  advantages: 'on advantages',
  decision: "by referee's decision",
  disqualification: 'by disqualification',
};

export const MEDAL_LABELS: Record<Medal, string> = { gold: 'Gold', silver: 'Silver', bronze: 'Bronze' };

function tooLong(value: string | undefined, max: number): boolean {
  return (value ?? '').trim().length > max;
}

export function validateCompetition(input: CompetitionInput, today: string): string | null {
  if (typeof input.name !== 'string' || !input.name.trim()) return 'Enter the competition name.';
  if (tooLong(input.name, MAX_NAME_LENGTH)) {
    return `Keep the name to ${MAX_NAME_LENGTH} characters or fewer.`;
  }
  if (!isIsoDate(input.date)) return 'Enter a valid competition date.';
  if (!SESSION_TYPES.includes(input.type)) return 'Choose gi or no-gi.';
  if (tooLong(input.division, MAX_NAME_LENGTH)) {
    return `Keep the division to ${MAX_NAME_LENGTH} characters or fewer.`;
  }
  if (input.medal !== undefined && !MEDALS.includes(input.medal)) {
    return 'Choose gold, silver, bronze or no medal.';
  }
  if (input.medal !== undefined && input.date > today) {
    return 'A medal can be added once the competition has taken place.';
  }
  if (tooLong(input.notes, MAX_NOTES_LENGTH)) {
    return `Keep notes to ${MAX_NOTES_LENGTH} characters or fewer.`;
  }
  return null;
}

export function validateMatch(input: MatchInput): string | null {
  if (!MATCH_RESULTS.includes(input.result)) return 'Choose win, loss or draw.';
  if (input.result !== 'draw' && (!input.method || !MATCH_METHODS.includes(input.method))) {
    return 'Choose how the match was decided.';
  }
  if (tooLong(input.submission, MAX_SUBMISSION_LENGTH)) {
    return `Keep the submission to ${MAX_SUBMISSION_LENGTH} characters or fewer.`;
  }
  if (tooLong(input.opponent, MAX_NAME_LENGTH)) {
    return `Keep the opponent's name to ${MAX_NAME_LENGTH} characters or fewer.`;
  }
  return null;
}

function cleanCompetition(input: CompetitionInput): CompetitionInput {
  const division = input.division?.trim();
  const notes = input.notes?.trim();
  return {
    date: input.date,
    name: input.name.trim(),
    type: input.type,
    ...(division ? { division } : {}),
    ...(input.medal ? { medal: input.medal } : {}),
    ...(notes ? { notes } : {}),
  };
}

/** Only a win by submission can name a technique from the journal: the journal is your own. */
export function canLinkTechnique(match: Pick<Match, 'result' | 'method'>): boolean {
  return match.result === 'win' && match.method === 'submission';
}

/**
 * A draw has no method, and only a submission names a technique. A technique chosen from the
 * journal takes the place of one typed in; one that is no longer in the journal is left off.
 */
function cleanMatch(input: MatchInput, techniques: Technique[]): MatchInput {
  const method = input.result === 'draw' ? undefined : input.method;
  const techniqueId =
    canLinkTechnique({ result: input.result, method }) &&
    techniques.some((technique) => technique.id === input.techniqueId)
      ? input.techniqueId
      : undefined;
  const submission =
    method === 'submission' && !techniqueId ? input.submission?.trim() : undefined;
  const opponent = input.opponent?.trim();
  return {
    result: input.result,
    ...(method ? { method } : {}),
    ...(submission ? { submission } : {}),
    ...(techniqueId ? { techniqueId } : {}),
    ...(opponent ? { opponent } : {}),
  };
}

export function addCompetition(
  data: AppData,
  input: CompetitionInput,
  today: string,
): Result<AppData> {
  const error = validateCompetition(input, today);
  if (error) return { ok: false, error };
  const competition: Competition = { id: newId(), ...cleanCompetition(input), matches: [] };
  return { ok: true, value: { ...data, competitions: [...data.competitions, competition] } };
}

/** Editing a competition's details keeps its matches. */
export function updateCompetition(
  data: AppData,
  id: string,
  input: CompetitionInput,
  today: string,
): Result<AppData> {
  const existing = data.competitions.find((c) => c.id === id);
  if (!existing) return { ok: false, error: 'That competition no longer exists.' };
  const error = validateCompetition(input, today);
  if (error) return { ok: false, error };
  if (input.date > today && existing.matches.length > 0) {
    return {
      ok: false,
      error: "This competition has matches, so it can't be moved to a future date.",
    };
  }
  return {
    ok: true,
    value: {
      ...data,
      competitions: data.competitions.map((c) =>
        c.id === id ? { id, ...cleanCompetition(input), matches: c.matches } : c,
      ),
    },
  };
}

export function deleteCompetition(data: AppData, id: string): AppData {
  return { ...data, competitions: data.competitions.filter((c) => c.id !== id) };
}

function withMatches(
  data: AppData,
  competitionId: string,
  change: (matches: Match[]) => Result<Match[]>,
): Result<AppData> {
  const competition = data.competitions.find((c) => c.id === competitionId);
  if (!competition) return { ok: false, error: 'That competition no longer exists.' };
  const changed = change(competition.matches);
  if (!changed.ok) return changed;
  return {
    ok: true,
    value: {
      ...data,
      competitions: data.competitions.map((c) =>
        c.id === competitionId ? { ...c, matches: changed.value } : c,
      ),
    },
  };
}

export function addMatch(
  data: AppData,
  competitionId: string,
  input: MatchInput,
  today: string,
): Result<AppData> {
  const error = validateMatch(input);
  if (error) return { ok: false, error };
  const competition = data.competitions.find((c) => c.id === competitionId);
  if (competition && isUpcoming(competition, today)) {
    return { ok: false, error: 'Matches can be added from the day of the competition.' };
  }
  return withMatches(data, competitionId, (matches) =>
    matches.length >= MAX_MATCHES
      ? { ok: false, error: `A competition can hold up to ${MAX_MATCHES} matches.` }
      : { ok: true, value: [...matches, { id: newId(), ...cleanMatch(input, data.techniques) }] },
  );
}

export function updateMatch(
  data: AppData,
  competitionId: string,
  matchId: string,
  input: MatchInput,
): Result<AppData> {
  const error = validateMatch(input);
  if (error) return { ok: false, error };
  return withMatches(data, competitionId, (matches) =>
    matches.some((m) => m.id === matchId)
      ? {
          ok: true,
          value: matches.map((m) =>
            m.id === matchId ? { id: matchId, ...cleanMatch(input, data.techniques) } : m,
          ),
        }
      : { ok: false, error: 'That match no longer exists.' },
  );
}

export function deleteMatch(data: AppData, competitionId: string, matchId: string): AppData {
  const result = withMatches(data, competitionId, (matches) => ({
    ok: true,
    value: matches.filter((m) => m.id !== matchId),
  }));
  return result.ok ? result.value : data;
}

/** True until the day of the competition. */
export function isUpcoming(competition: Pick<Competition, 'date'>, today: string): boolean {
  return competition.date > today;
}

/** Competitions still to come, soonest first. */
export function upcomingCompetitions(competitions: Competition[], today: string): Competition[] {
  return competitions
    .filter((competition) => isUpcoming(competition, today))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Competitions that have taken place, including any today, newest first. */
export function pastCompetitions(competitions: Competition[], today: string): Competition[] {
  return sortCompetitions(competitions.filter((competition) => !isUpcoming(competition, today)));
}

/**
 * The competition to count down to: the soonest one still to come, or one today that has no
 * matches recorded yet.
 */
export function nextCompetition(competitions: Competition[], today: string): Competition | null {
  const waiting = competitions
    .filter((competition) => competition.date >= today && competition.matches.length === 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  return waiting[0] ?? null;
}

/** "Today", "Tomorrow" or "In 12 days". */
export function formatCountdown(date: string, today: string): string {
  const days = daysBetween(today, date);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `In ${days} days`;
}

/** Newest date first; competitions on the same day show the most recently logged first. */
export function sortCompetitions(competitions: Competition[]): Competition[] {
  return competitions
    .map((competition, index) => ({ competition, index }))
    .sort((a, b) => b.competition.date.localeCompare(a.competition.date) || b.index - a.index)
    .map(({ competition }) => competition);
}

export interface Tally {
  wins: number;
  losses: number;
  draws: number;
}

export function tally(matches: Match[]): Tally {
  return {
    wins: matches.filter((m) => m.result === 'win').length,
    losses: matches.filter((m) => m.result === 'loss').length,
    draws: matches.filter((m) => m.result === 'draw').length,
  };
}

function count(amount: number, singular: string, plural: string): string {
  return `${amount} ${amount === 1 ? singular : plural}`;
}

/** "3 wins · 1 loss", adding draws only when there are some. */
export function formatTally({ wins, losses, draws }: Tally): string {
  const parts = [count(wins, 'win', 'wins'), count(losses, 'loss', 'losses')];
  if (draws > 0) parts.push(count(draws, 'draw', 'draws'));
  return parts.join(' · ');
}

/** The submission a match ended by: the journal technique's name, or the words typed in. */
export function submissionName(match: Match, techniques: Technique[] = []): string | undefined {
  const linked = techniques.find((technique) => technique.id === match.techniqueId);
  return linked?.name ?? match.submission;
}

/** "Win by submission (armbar)", "Loss on points" or "Draw". */
export function describeMatch(match: Match, techniques: Technique[] = []): string {
  const result = RESULT_LABELS[match.result];
  if (match.result === 'draw' || !match.method) return result;
  const name = submissionName(match, techniques);
  return `${result} ${METHOD_PHRASES[match.method]}${name ? ` (${name})` : ''}`;
}

/** How many competition matches each journal technique has won, by technique id. */
export function competitionWins(competitions: Competition[]): Map<string, number> {
  const wins = new Map<string, number>();
  for (const match of competitions.flatMap((competition) => competition.matches)) {
    if (match.techniqueId && canLinkTechnique(match)) {
      wins.set(match.techniqueId, (wins.get(match.techniqueId) ?? 0) + 1);
    }
  }
  return wins;
}

export type MethodCounts = Record<MatchMethod, number>;

export interface CompetitionRecord extends Tally {
  competitions: number;
  matches: number;
  /** How wins and losses were decided. */
  winsBy: MethodCounts;
  lossesBy: MethodCounts;
  medals: Record<Medal, number>;
}

function methodCounts(matches: Match[], result: MatchResult): MethodCounts {
  const counts = Object.fromEntries(MATCH_METHODS.map((method) => [method, 0])) as MethodCounts;
  for (const match of matches) {
    if (match.result === result && match.method) counts[match.method] += 1;
  }
  return counts;
}

/** The record across competitions that have taken place; upcoming ones are not counted. */
export function competitionRecord(competitions: Competition[], today: string): CompetitionRecord {
  const held = competitions.filter((competition) => !isUpcoming(competition, today));
  const matches = held.flatMap((c) => c.matches);
  const medals: Record<Medal, number> = { gold: 0, silver: 0, bronze: 0 };
  for (const competition of held) {
    if (competition.medal) medals[competition.medal] += 1;
  }
  return {
    ...tally(matches),
    competitions: held.length,
    matches: matches.length,
    winsBy: methodCounts(matches, 'win'),
    lossesBy: methodCounts(matches, 'loss'),
    medals,
  };
}

/** "2 by submission, 1 on points" for the methods that occurred, most common first. */
export function formatMethods(counts: MethodCounts): string {
  return MATCH_METHODS.filter((method) => counts[method] > 0)
    .sort((a, b) => counts[b] - counts[a])
    .map((method) => `${counts[method]} ${METHOD_PHRASES[method]}`)
    .join(', ');
}

/** "2 gold, 1 bronze" for the medals won, or an empty string. */
export function formatMedals(medals: Record<Medal, number>): string {
  return MEDALS.filter((medal) => medals[medal] > 0)
    .map((medal) => `${medals[medal]} ${medal}`)
    .join(', ');
}
