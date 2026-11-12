export const BELTS = ['white', 'blue', 'purple', 'brown', 'black'] as const;
export type Belt = (typeof BELTS)[number];

export const MAX_STRIPES = 4;

export interface Rank {
  belt: Belt;
  stripes: number;
}

/** Dates are calendar days in `YYYY-MM-DD` form, which also sort correctly as strings. */
export interface Promotion extends Rank {
  id: string;
  date: string;
  promotedBy?: string;
  academy?: string;
}

export const SESSION_TYPES = ['gi', 'nogi'] as const;
export type SessionType = (typeof SESSION_TYPES)[number];

export interface Session {
  id: string;
  date: string;
  durationMinutes: number;
  type: SessionType;
  notes?: string;
}

export const MATCH_RESULTS = ['win', 'loss', 'draw'] as const;
export type MatchResult = (typeof MATCH_RESULTS)[number];

export const MATCH_METHODS = [
  'submission',
  'points',
  'advantages',
  'decision',
  'disqualification',
] as const;
export type MatchMethod = (typeof MATCH_METHODS)[number];

export interface Match {
  id: string;
  result: MatchResult;
  /** How a win or loss was decided. A draw has none. */
  method?: MatchMethod;
  /** The technique, when the match ended by submission. */
  submission?: string;
  opponent?: string;
}

export const MEDALS = ['gold', 'silver', 'bronze'] as const;
export type Medal = (typeof MEDALS)[number];

export interface Competition {
  id: string;
  date: string;
  name: string;
  type: SessionType;
  division?: string;
  medal?: Medal;
  notes?: string;
  /** Kept in the order they were fought. */
  matches: Match[];
}

export interface AppData {
  /** Current rank. Never lower than the highest logged promotion. */
  rank: Rank | null;
  promotions: Promotion[];
  /** Kept in the order they were logged, so the latest entry supplies form defaults. */
  sessions: Session[];
  /** Sessions the practitioner aims to train each week, if they have set a goal. */
  weeklyGoal: number | null;
  competitions: Competition[];
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export function emptyData(): AppData {
  return { rank: null, promotions: [], sessions: [], weeklyGoal: null, competitions: [] };
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
