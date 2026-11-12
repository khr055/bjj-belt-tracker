export const BELTS = ['white', 'blue', 'purple', 'brown', 'black'] as const;
export type Belt = (typeof BELTS)[number];

/** Stripes on a coloured belt. A black belt holds degrees instead. */
export const MAX_STRIPES = 4;
/** Degrees on a black belt. The 7th degree is the coral belt, which the app does not model. */
export const MAX_DEGREES = 6;

export interface Rank {
  belt: Belt;
  /** Stripes on a coloured belt, 0 to 4; degrees on a black belt, 0 to 6. */
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

/** What the time on the mat was spent on. */
export const SESSION_KINDS = ['class', 'open-mat', 'drilling', 'private'] as const;
export type SessionKind = (typeof SESSION_KINDS)[number];

export interface Session {
  id: string;
  date: string;
  durationMinutes: number;
  type: SessionType;
  /** Left out on sessions logged before kinds were recorded. */
  kind?: SessionKind;
  /** Rounds of sparring. Left out when not recorded; 0 means no rolling. */
  rounds?: number;
  notes?: string;
  /** The techniques worked on, by id. Left out when there are none. */
  techniqueIds?: string[];
  /** The techniques landed in rolling, by id. Left out when there are none. */
  landedIds?: string[];
}

export const POSITIONS = [
  'standing',
  'guard',
  'passing',
  'half-guard',
  'side-control',
  'mount',
  'back',
  'turtle',
  'legs',
  'other',
] as const;
export type Position = (typeof POSITIONS)[number];

/** How far along a technique is, from first seeing it to using it against resistance. */
export const TECHNIQUE_STATUSES = ['learning', 'drilling', 'landing'] as const;
export type TechniqueStatus = (typeof TECHNIQUE_STATUSES)[number];

export interface Technique {
  id: string;
  name: string;
  position: Position;
  status: TechniqueStatus;
  notes?: string;
  /** The day it was added to the journal. */
  addedOn: string;
  /** The day it reached its current stage. */
  statusSince: string;
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
  /** The technique, in words, when the match ended by submission. */
  submission?: string;
  /**
   * The journal technique a match was won with, by id, when it ended by submission. Takes the
   * place of `submission`.
   */
  techniqueId?: string;
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

export const TIME_OFF_REASONS = ['injury', 'illness', 'travel', 'other'] as const;
export type TimeOffReason = (typeof TIME_OFF_REASONS)[number];

/** A stretch away from training, which should not count against streaks and goals. */
export interface TimeOff {
  id: string;
  /** The first day off. */
  startDate: string;
  /** The last day off. Left out while the time off is still going on. */
  endDate?: string;
  reason: TimeOffReason;
  notes?: string;
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
  /** The practitioner's own list of techniques, in the order they were added. */
  techniques: Technique[];
  /** Periods away from training, in the order they were logged. */
  timeOff: TimeOff[];
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export function emptyData(): AppData {
  return {
    rank: null,
    promotions: [],
    sessions: [],
    weeklyGoal: null,
    competitions: [],
    techniques: [],
    timeOff: [],
  };
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
