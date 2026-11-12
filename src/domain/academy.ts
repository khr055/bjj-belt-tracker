import { addDays, daysBetween } from './dates';
import { highestPromotion, sortPromotions, validatePromotion, type PromotionInput } from './promotions';
import { rankValue } from './rank';
import { summarize, type MatTime } from './sessions';
import { daysOffBetween, isDayOff } from './timeOff';
import { timeInDegree, timeInGrade } from './timeInGrade';
import { weeklyTotals, type WeekTotal } from './trends';
import {
  BELTS,
  newId,
  type Belt,
  type Promotion,
  type Rank,
  type Result,
  type Session,
  type SessionKind,
  type SessionType,
  type TimeOff,
} from './types';

/**
 * What a coach works with. It is deliberately less than a person's own record: a coach sees
 * names, rank, promotion history, attendance and the dates someone is away, and nothing else.
 * Techniques, notes, competitions and what someone was caught with stay with the student.
 */

export const MEMBER_ROLES = ['student', 'coach', 'owner'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const ROLE_LABELS: Record<MemberRole, string> = {
  student: 'Student',
  coach: 'Coach',
  owner: 'Owner',
};

/** A session as a coach sees it: that it happened, with none of what was written about it. */
export interface Attendance {
  date: string;
  durationMinutes: number;
  type: SessionType;
  kind?: SessionKind;
}

/** Time off as a coach sees it: the dates, without the reason. */
export interface Away {
  startDate: string;
  /** Left out while the person is still away. */
  endDate?: string;
}

export interface Member {
  id: string;
  name: string;
  role: MemberRole;
  /** The day they joined the academy. */
  joinedOn: string;
  /** Awarded by coaches. The current rank is the highest of them. */
  promotions: Promotion[];
  attendance: Attendance[];
  away: Away[];
}

export interface Academy {
  name: string;
  /** Given to people so they can join. */
  joinCode: string;
  members: Member[];
}

/** In the preview, the id and name of the member who is the person using the app. */
export const YOU_ID = 'you';
export const YOU_NAME = 'You';

/**
 * The person's own record as a coach would see it: rank history, attendance and the dates of
 * time off, and none of the rest. They joined on the first day there is any trace of them.
 */
export function memberFromRecord(
  record: { promotions: Promotion[]; sessions: Session[]; timeOff: TimeOff[] },
  role: MemberRole,
  today: string,
): Member {
  const dates = [...record.promotions, ...record.sessions].map((entry) => entry.date);
  return {
    id: YOU_ID,
    name: YOU_NAME,
    role,
    joinedOn: dates.sort()[0] ?? today,
    promotions: record.promotions,
    attendance: record.sessions.map(({ date, durationMinutes, type, kind }) => ({
      date,
      durationMinutes,
      type,
      ...(kind ? { kind } : {}),
    })),
    away: record.timeOff.map(({ startDate, endDate }) => ({
      startDate,
      ...(endDate ? { endDate } : {}),
    })),
  };
}

/** A member with no session for this many days, not counting days away, has gone quiet. */
export const QUIET_DAYS = 21;
/** How long someone counts as having joined recently. */
export const RECENT_DAYS = 30;
/** The window the students list counts attendance over. */
export const ATTENDANCE_DAYS = 30;

/** The current rank: the highest promotion a coach has recorded, or none yet. */
export function memberRank(member: Member): Rank | null {
  const top = highestPromotion(member.promotions);
  return top ? { belt: top.belt, stripes: top.stripes } : null;
}

function asSessions(member: Member): Session[] {
  return member.attendance.map((entry, index) => ({ id: `${member.id}-${index}`, ...entry }));
}

function asTimeOff(member: Member): TimeOff[] {
  return member.away.map((away, index) => ({
    id: `${member.id}-away-${index}`,
    reason: 'other' as const,
    ...away,
  }));
}

export interface MemberSummary {
  member: Member;
  rank: Rank | null;
  /** The day the current rank was awarded. */
  rankSince: string | null;
  /** The day the current belt was first held, from the earliest promotion at it. */
  beltSince: string | null;
  /** Sessions in the last 30 days, today included. */
  recent: MatTime;
  sinceLastPromotion: MatTime;
  allTime: MatTime;
  lastTrained: string | null;
  /**
   * Days since they last trained, or since they joined if they never have, leaving out days
   * away. Someone who trained today is at 0.
   */
  daysQuiet: number;
  awayToday: boolean;
  /** True when the minimum time at their belt, or black belt degree, has been served. */
  minimumMet: boolean;
}

export function summarizeMember(member: Member, today: string): MemberSummary {
  const rank = memberRank(member);
  const sorted = sortPromotions(member.promotions);
  const latest = sorted[sorted.length - 1] ?? null;
  const sessions = asSessions(member);
  const timeOff = asTimeOff(member);
  const lastTrained = sessions.map((session) => session.date).sort().pop() ?? null;
  const since = lastTrained !== null && lastTrained > member.joinedOn ? lastTrained : member.joinedOn;
  const daysQuiet =
    since >= today
      ? 0
      : daysBetween(since, today) - daysOffBetween(timeOff, addDays(since, 1), today, today);

  const degree = rank ? timeInDegree(rank, member.promotions, today) : null;
  const grade = rank ? timeInGrade(rank, member.promotions, today) : null;
  const minimumMet = degree ? degree.status === 'met' : grade?.status === 'met';

  return {
    member,
    rank,
    rankSince: latest?.date ?? null,
    beltSince: rank ? (sorted.find((promotion) => promotion.belt === rank.belt)?.date ?? null) : null,
    recent: summarize(
      sessions.filter((session) => session.date > addDays(today, -ATTENDANCE_DAYS) && session.date <= today),
    ),
    sinceLastPromotion: summarize(
      latest ? sessions.filter((session) => session.date >= latest.date) : sessions,
    ),
    allTime: summarize(sessions),
    lastTrained,
    daysQuiet,
    awayToday: isDayOff(timeOff, today, today),
    minimumMet: minimumMet === true,
  };
}

/** Sessions per week for a member's chart, oldest first, with weeks away marked. */
export function memberWeeks(member: Member, today: string): WeekTotal[] {
  return weeklyTotals(asSessions(member), today, undefined, asTimeOff(member));
}

export interface AcademyOverview {
  members: number;
  /** Sessions logged across the academy in the week containing today. */
  sessionsThisWeek: number;
  /** People who trained at least once in the week containing today. */
  trainedThisWeek: number;
  /** Minimum time at their belt served, longest at the belt first. A prompt, not a decision. */
  minimumMet: MemberSummary[];
  /** Most sessions since their last promotion first. */
  mostSincePromotion: MemberSummary[];
  /** No session for three weeks and not away today, quietest first. */
  quiet: MemberSummary[];
  /** Joined in the last 30 days, newest first. */
  joinedRecently: MemberSummary[];
}

/** How many names the lists on the academy's home screen hold. */
export const LIST_SIZE = 5;

export function academyOverview(academy: Academy, today: string): AcademyOverview {
  const everyone = academy.members.map((member) => summarizeMember(member, today));
  const thisWeek = academy.members.map((member) => {
    const weeks = memberWeeks(member, today);
    return weeks[weeks.length - 1].sessions;
  });
  const byName = (a: MemberSummary, b: MemberSummary) => a.member.name.localeCompare(b.member.name);
  return {
    members: everyone.length,
    sessionsThisWeek: thisWeek.reduce((sum, sessions) => sum + sessions, 0),
    trainedThisWeek: thisWeek.filter((sessions) => sessions > 0).length,
    minimumMet: everyone
      .filter((summary) => summary.minimumMet)
      .sort((a, b) => (a.beltSince ?? '').localeCompare(b.beltSince ?? '') || byName(a, b)),
    mostSincePromotion: everyone
      .filter((summary) => summary.rank !== null && summary.sinceLastPromotion.sessions > 0)
      .sort((a, b) => b.sinceLastPromotion.sessions - a.sinceLastPromotion.sessions || byName(a, b))
      .slice(0, LIST_SIZE),
    quiet: everyone
      .filter((summary) => !summary.awayToday && summary.daysQuiet >= QUIET_DAYS)
      .sort((a, b) => b.daysQuiet - a.daysQuiet || byName(a, b)),
    joinedRecently: everyone
      .filter((summary) => daysBetween(summary.member.joinedOn, today) < RECENT_DAYS)
      .sort((a, b) => b.member.joinedOn.localeCompare(a.member.joinedOn) || byName(a, b)),
  };
}

export const STUDENT_SORTS = ['name', 'rank', 'last-trained', 'time-at-rank'] as const;
export type StudentSort = (typeof STUDENT_SORTS)[number];

export const SORT_LABELS: Record<StudentSort, string> = {
  name: 'Name',
  rank: 'Rank',
  'last-trained': 'Last trained',
  'time-at-rank': 'Time at rank',
};

export interface StudentFilter {
  /** Words that must all appear in the name. */
  text: string;
  belt: Belt | 'all' | 'unranked';
  sort: StudentSort;
}

export const ALL_STUDENTS: StudentFilter = { text: '', belt: 'all', sort: 'name' };

/** The members a coach's list shows: searched by name, narrowed to a belt, and put in order. */
export function listMembers(academy: Academy, filter: StudentFilter, today: string): MemberSummary[] {
  const words = filter.text.toLowerCase().split(/\s+/).filter(Boolean);
  const byName = (a: MemberSummary, b: MemberSummary) => a.member.name.localeCompare(b.member.name);
  const orders: Record<StudentSort, (a: MemberSummary, b: MemberSummary) => number> = {
    name: byName,
    // Highest rank first; no rank yet comes last.
    rank: (a, b) => (b.rank ? rankValue(b.rank) : -1) - (a.rank ? rankValue(a.rank) : -1),
    // Longest since training first, so the people to look for are at the top.
    'last-trained': (a, b) => (a.lastTrained ?? '').localeCompare(b.lastTrained ?? ''),
    // Longest at their rank first.
    'time-at-rank': (a, b) => (a.rankSince ?? '9').localeCompare(b.rankSince ?? '9'),
  };
  return academy.members
    .map((member) => summarizeMember(member, today))
    .filter((summary) => {
      const name = summary.member.name.toLowerCase();
      if (!words.every((word) => name.includes(word))) return false;
      if (filter.belt === 'all') return true;
      return filter.belt === 'unranked' ? summary.rank === null : summary.rank?.belt === filter.belt;
    })
    .sort((a, b) => orders[filter.sort](a, b) || byName(a, b));
}

/** How many members hold each belt, for the filter; belts nobody holds are left out. */
export function beltCounts(academy: Academy): { belt: Belt | 'unranked'; members: number }[] {
  const ranks = academy.members.map(memberRank);
  return [
    ...BELTS.map((belt) => ({ belt, members: ranks.filter((rank) => rank?.belt === belt).length })),
    { belt: 'unranked' as const, members: ranks.filter((rank) => rank === null).length },
  ].filter((entry) => entry.members > 0);
}

function withMember(academy: Academy, id: string, change: (member: Member) => Member): Academy {
  return { ...academy, members: academy.members.map((member) => (member.id === id ? change(member) : member)) };
}

/**
 * A coach awards a rank. The same rules hold as for a history someone kept themselves: a rank is
 * reached once, and a higher rank is never dated before a lower one.
 */
export function recordPromotion(
  academy: Academy,
  memberId: string,
  input: PromotionInput,
  today: string,
): Result<Academy> {
  const member = academy.members.find((other) => other.id === memberId);
  if (!member) return { ok: false, error: 'That person is no longer in the academy.' };
  const error = validatePromotion(input, member.promotions, today);
  if (error) return { ok: false, error };
  const promotedBy = input.promotedBy?.trim();
  const promotion: Promotion = {
    id: newId(),
    belt: input.belt,
    stripes: input.stripes,
    date: input.date,
    ...(promotedBy ? { promotedBy } : {}),
  };
  return {
    ok: true,
    value: withMember(academy, memberId, (m) => ({ ...m, promotions: [...m.promotions, promotion] })),
  };
}

/** Takes back a promotion entered by mistake. The rank falls to the highest one left. */
export function removePromotion(academy: Academy, memberId: string, promotionId: string): Academy {
  return withMember(academy, memberId, (member) => ({
    ...member,
    promotions: member.promotions.filter((promotion) => promotion.id !== promotionId),
  }));
}

function owners(academy: Academy): Member[] {
  return academy.members.filter((member) => member.role === 'owner');
}

const LAST_OWNER = 'An academy needs at least one owner. Make someone else an owner first.';

export function setRole(academy: Academy, memberId: string, role: MemberRole): Result<Academy> {
  const member = academy.members.find((other) => other.id === memberId);
  if (!member) return { ok: false, error: 'That person is no longer in the academy.' };
  if (!MEMBER_ROLES.includes(role)) return { ok: false, error: 'Choose student, coach or owner.' };
  if (member.role === 'owner' && role !== 'owner' && owners(academy).length === 1) {
    return { ok: false, error: LAST_OWNER };
  }
  return { ok: true, value: withMember(academy, memberId, (m) => ({ ...m, role })) };
}

export function removeMember(academy: Academy, memberId: string): Result<Academy> {
  const member = academy.members.find((other) => other.id === memberId);
  if (!member) return { ok: true, value: academy };
  if (member.role === 'owner' && owners(academy).length === 1) return { ok: false, error: LAST_OWNER };
  return {
    ok: true,
    value: { ...academy, members: academy.members.filter((other) => other.id !== memberId) },
  };
}

/** Replaces the joining code, so one that has got out stops working. */
export function renewJoinCode(academy: Academy, code: string): Academy {
  return { ...academy, joinCode: code };
}
