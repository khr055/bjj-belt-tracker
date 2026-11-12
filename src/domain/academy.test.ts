import { describe, expect, it } from 'vitest';
import {
  academyOverview,
  ALL_STUDENTS,
  beltCounts,
  listMembers,
  memberFromRecord,
  memberRank,
  memberWeeks,
  recordPromotion,
  removeMember,
  removePromotion,
  setRole,
  summarizeMember,
  type Academy,
  type Member,
} from './academy';
import { addDays } from './dates';
import { revokePromotion } from './promotions';
import { sampleAcademy } from './sampleAcademy';
import { emptyData, type AppData, type Belt } from './types';

// Wednesday. Its week starts on Monday 9 Nov 2026.
const TODAY = '2026-11-11';

function member(overrides: Partial<Member> & Pick<Member, 'id'>): Member {
  return {
    name: overrides.id,
    role: 'student',
    joinedOn: '2026-01-01',
    promotions: [],
    attendance: [],
    away: [],
    ...overrides,
  };
}

const promotion = (belt: Belt, stripes: number, date: string) => ({
  id: `${belt}-${stripes}`,
  belt,
  stripes,
  date,
});
const trained = (...dates: string[]) =>
  dates.map((date) => ({ date, durationMinutes: 60, type: 'gi' as const }));

function academyOf(...members: Member[]): Academy {
  return { name: 'Test Academy', joinCode: 'code', members };
}

describe('what a coach sees of a member', () => {
  it('takes the rank from the highest promotion, and none when there are none', () => {
    const ranked = member({
      id: 'a',
      promotions: [promotion('blue', 0, '2025-01-01'), promotion('white', 4, '2024-06-01')],
    });
    expect(memberRank(ranked)).toEqual({ belt: 'blue', stripes: 0 });
    expect(memberRank(member({ id: 'b' }))).toBeNull();
  });

  it('counts attendance in the last 30 days, since the last promotion and in all', () => {
    const summary = summarizeMember(
      member({
        id: 'a',
        promotions: [promotion('white', 0, '2026-01-01'), promotion('white', 1, '2026-10-20')],
        attendance: trained('2026-09-01', '2026-10-12', '2026-10-13', '2026-10-20', '2026-11-10'),
      }),
      TODAY,
    );
    // 13 Oct is 29 days before today and counts; 12 Oct is 30 days before and does not.
    expect(summary.recent.sessions).toBe(3);
    // A session on the day of a promotion counts towards the new rank.
    expect(summary.sinceLastPromotion.sessions).toBe(2);
    expect(summary.allTime.sessions).toBe(5);
    expect(summary.lastTrained).toBe('2026-11-10');
    expect(summary.rankSince).toBe('2026-10-20');
    expect(summary.beltSince).toBe('2026-01-01');
    expect(summary.daysQuiet).toBe(1);
  });

  it('does not count days away towards going quiet, and counts from joining if never trained', () => {
    const away = summarizeMember(
      member({
        id: 'a',
        attendance: trained('2026-10-01'),
        away: [{ startDate: '2026-10-10', endDate: '2026-10-29' }],
      }),
      TODAY,
    );
    // 41 days since, 20 of them away.
    expect(away.daysQuiet).toBe(21);
    expect(away.awayToday).toBe(false);

    const still = summarizeMember(
      member({ id: 'b', attendance: trained('2026-10-01'), away: [{ startDate: '2026-10-10' }] }),
      TODAY,
    );
    expect(still.awayToday).toBe(true);
    expect(still.daysQuiet).toBe(8);

    const never = summarizeMember(member({ id: 'c', joinedOn: '2026-11-01' }), TODAY);
    expect(never.lastTrained).toBeNull();
    expect(never.daysQuiet).toBe(10);
  });

  it('says when the minimum time at a belt, or a black belt degree, has been served', () => {
    const met = (promotions: Member['promotions']) =>
      summarizeMember(member({ id: 'a', promotions }), TODAY).minimumMet;
    expect(met([promotion('blue', 0, '2024-11-11')])).toBe(true);
    expect(met([promotion('blue', 0, '2024-11-12')])).toBe(false);
    // White belt has no minimum, so there is nothing to have met.
    expect(met([promotion('white', 3, '2020-01-01')])).toBe(false);
    expect(met([promotion('black', 1, '2023-11-11')])).toBe(true);
    expect(met([])).toBe(false);
  });

  it('marks the weeks away on the attendance chart', () => {
    const weeks = memberWeeks(
      member({
        id: 'a',
        attendance: trained('2026-11-09', '2026-11-10'),
        away: [{ startDate: '2026-10-27', endDate: '2026-10-28' }],
      }),
      TODAY,
    );
    expect(weeks).toHaveLength(8);
    expect(weeks.at(-1)).toMatchObject({ sessions: 2, current: true, off: false });
    expect(weeks.at(-3)).toMatchObject({ weekStart: '2026-10-26', sessions: 0, off: true });
  });
});

describe('the academy overview', () => {
  const academy = academyOf(
    member({ id: 'steady', promotions: [promotion('blue', 0, '2023-01-01')], attendance: trained('2026-11-09', '2026-11-10') }),
    member({ id: 'newer', promotions: [promotion('blue', 0, '2024-06-01')], attendance: trained('2026-11-02') }),
    member({ id: 'quiet', promotions: [promotion('white', 1, '2026-06-01')], attendance: trained('2026-10-21') }),
    member({ id: 'quieter', promotions: [promotion('white', 0, '2026-03-01')], attendance: trained('2026-09-30') }),
    member({ id: 'away', attendance: trained('2026-09-01'), away: [{ startDate: '2026-11-05' }] }),
    member({ id: 'new', joinedOn: '2026-11-05', attendance: trained('2026-11-10') }),
    member({ id: 'older', joinedOn: '2026-10-12' }),
  );
  const overview = academyOverview(academy, TODAY);
  const names = (list: { member: Member }[]) => list.map((summary) => summary.member.id);

  it('counts this week across the academy', () => {
    expect(overview.members).toBe(7);
    expect(overview.sessionsThisWeek).toBe(3);
    expect(overview.trainedThisWeek).toBe(2);
  });

  it('lists who has met the minimum time, longest at the belt first', () => {
    expect(names(overview.minimumMet)).toEqual(['steady', 'newer']);
  });

  it('lists who has gone quiet, quietest first, leaving out anyone away today', () => {
    // 21 days exactly counts; the member who is away does not, however long it has been.
    expect(names(overview.quiet)).toEqual(['quieter', 'older', 'quiet']);
    expect(overview.quiet.map((summary) => summary.daysQuiet)).toEqual([42, 30, 21]);
  });

  it('lists who joined in the last 30 days, newest first', () => {
    expect(names(overview.joinedRecently)).toEqual(['new']);
    expect(names(academyOverview(academy, '2026-11-10').joinedRecently)).toEqual(['new', 'older']);
  });

  it('lists the most sessions since a promotion, for people who have a rank', () => {
    expect(names(overview.mostSincePromotion)).toEqual(['steady', 'newer', 'quiet', 'quieter']);
  });
});

describe('the students list', () => {
  const academy = academyOf(
    member({ id: 'c', name: 'Cara Diaz', promotions: [promotion('blue', 2, '2025-05-01')], attendance: trained('2026-11-01') }),
    member({ id: 'a', name: 'Abe Stone', promotions: [promotion('white', 3, '2026-02-01')], attendance: trained('2026-11-10') }),
    member({ id: 'b', name: 'Bea Diaz', promotions: [promotion('blue', 0, '2024-01-01')], attendance: trained('2026-10-01') }),
    member({ id: 'd', name: 'Dev Rao' }),
  );
  const list = (filter: Partial<typeof ALL_STUDENTS>) =>
    listMembers(academy, { ...ALL_STUDENTS, ...filter }, TODAY).map((summary) => summary.member.id);

  it('is in name order unless told otherwise', () => {
    expect(list({})).toEqual(['a', 'b', 'c', 'd']);
  });

  it('searches names for every word, whatever the case', () => {
    expect(list({ text: 'DIAZ' })).toEqual(['b', 'c']);
    expect(list({ text: 'diaz cara' })).toEqual(['c']);
    expect(list({ text: 'nobody' })).toEqual([]);
  });

  it('narrows to a belt, or to those with no rank yet', () => {
    expect(list({ belt: 'blue' })).toEqual(['b', 'c']);
    expect(list({ belt: 'unranked' })).toEqual(['d']);
    expect(beltCounts(academy)).toEqual([
      { belt: 'white', members: 1 },
      { belt: 'blue', members: 2 },
      { belt: 'unranked', members: 1 },
    ]);
  });

  it('sorts by rank, by who has been away longest, and by time at rank', () => {
    expect(list({ sort: 'rank' })).toEqual(['c', 'b', 'a', 'd']);
    // Never trained comes first, then the longest since.
    expect(list({ sort: 'last-trained' })).toEqual(['d', 'b', 'c', 'a']);
    // Longest at their rank first; no rank last.
    expect(list({ sort: 'time-at-rank' })).toEqual(['b', 'c', 'a', 'd']);
  });
});

describe('what a coach can do', () => {
  const academy = academyOf(
    member({ id: 'owner', role: 'owner' }),
    member({ id: 's', promotions: [promotion('white', 0, '2025-01-01')] }),
  );

  it('records a promotion, which becomes the rank', () => {
    const result = recordPromotion(
      academy,
      's',
      { belt: 'white', stripes: 1, date: '2026-11-01', promotedBy: ' Coach ', academy: 'ignored' },
      TODAY,
    );
    if (!result.ok) throw new Error(result.error);
    const promoted = result.value.members[1];
    expect(memberRank(promoted)).toEqual({ belt: 'white', stripes: 1 });
    expect(promoted.promotions[1]).toEqual({
      id: promoted.promotions[1].id,
      belt: 'white',
      stripes: 1,
      date: '2026-11-01',
      promotedBy: 'Coach',
    });
    // Nobody else is touched.
    expect(result.value.members[0]).toBe(academy.members[0]);
  });

  it('holds a coach to the same history rules as anyone', () => {
    const errorOf = (input: { belt: Belt; stripes: number; date: string }) => {
      const result = recordPromotion(academy, 's', input, TODAY);
      return result.ok ? null : result.error;
    };
    expect(errorOf({ belt: 'white', stripes: 0, date: '2026-01-01' })).toContain('already logged');
    expect(errorOf({ belt: 'blue', stripes: 0, date: '2024-01-01' })).toContain("can't be dated before");
    expect(errorOf({ belt: 'blue', stripes: 0, date: '2026-11-12' })).toContain('future');
    expect(errorOf({ belt: 'blue', stripes: 5, date: '2026-11-01' })).toContain('up to 4');
    expect(recordPromotion(academy, 'gone', { belt: 'blue', stripes: 0, date: TODAY }, TODAY).ok).toBe(false);
  });

  it('takes back a promotion, and the rank falls to the highest left', () => {
    const two = academyOf(
      member({ id: 's', promotions: [promotion('white', 0, '2025-01-01'), promotion('white', 1, '2026-01-01')] }),
    );
    const one = removePromotion(two, 's', 'white-1');
    expect(memberRank(one.members[0])).toEqual({ belt: 'white', stripes: 0 });
    expect(memberRank(removePromotion(one, 's', 'white-0').members[0])).toBeNull();
  });

  it('changes roles and removes members, but always leaves an owner', () => {
    const coached = setRole(academy, 's', 'coach');
    expect(coached.ok && coached.value.members[1].role).toBe('coach');

    const stepDown = setRole(academy, 'owner', 'coach');
    expect(!stepDown.ok && stepDown.error).toContain('at least one owner');
    const leave = removeMember(academy, 'owner');
    expect(!leave.ok && leave.error).toContain('at least one owner');

    // With a second owner, the first can step down or go.
    const shared = setRole(academy, 's', 'owner');
    if (!shared.ok) throw new Error(shared.error);
    expect(setRole(shared.value, 'owner', 'student').ok).toBe(true);
    const gone = removeMember(shared.value, 'owner');
    expect(gone.ok && gone.value.members.map((m) => m.id)).toEqual(['s']);

    const removed = removeMember(academy, 's');
    expect(removed.ok && removed.value.members.map((m) => m.id)).toEqual(['owner']);
  });
});

describe('a person as their coach sees them', () => {
  const data: AppData = {
    ...emptyData(),
    rank: { belt: 'blue', stripes: 1 },
    promotions: [
      { id: 'p1', belt: 'blue', stripes: 0, date: '2025-03-01', promotedBy: 'Coach' },
      { id: 'p2', belt: 'blue', stripes: 1, date: '2026-02-01' },
    ],
    sessions: [
      {
        id: 's1',
        date: '2026-11-01',
        durationMinutes: 90,
        type: 'nogi',
        kind: 'open-mat',
        rounds: 6,
        notes: 'Private thoughts',
        techniqueIds: ['t1'],
        caughtWith: ['Armbar'],
      },
      { id: 's2', date: '2024-12-01', durationMinutes: 60, type: 'gi' },
    ],
    timeOff: [{ id: 'o1', startDate: '2026-10-01', endDate: '2026-10-05', reason: 'injury', notes: 'Rib' }],
  };

  it('carries rank history, attendance and the dates away, and nothing private', () => {
    const you = memberFromRecord(data, 'student', TODAY);
    expect(you.joinedOn).toBe('2024-12-01');
    expect(you.promotions).toEqual(data.promotions);
    expect(you.attendance).toEqual([
      { date: '2026-11-01', durationMinutes: 90, type: 'nogi', kind: 'open-mat' },
      { date: '2024-12-01', durationMinutes: 60, type: 'gi' },
    ]);
    expect(you.away).toEqual([{ startDate: '2026-10-01', endDate: '2026-10-05' }]);
    const text = JSON.stringify(you);
    for (const hidden of ['Private thoughts', 'Armbar', 'Rib', 'injury', 'rounds', 't1']) {
      expect(text).not.toContain(hidden);
    }
  });

  it('joins today when there is nothing recorded yet', () => {
    expect(memberFromRecord(emptyData(), 'student', TODAY).joinedOn).toBe(TODAY);
  });

  it('loses rank when a coach takes back the promotion that gave it', () => {
    const one = revokePromotion(data, 'p2');
    expect(one.rank).toEqual({ belt: 'blue', stripes: 0 });
    expect(one.promotions.map((p) => p.id)).toEqual(['p1']);
    expect(revokePromotion(one, 'p1').rank).toBeNull();
    // The rest of the record is untouched.
    expect(one.sessions).toBe(data.sessions);
  });
});

describe('the sample academy', () => {
  it('is the same every time for a given day, and always has someone in each list', () => {
    for (const today of ['2026-11-11', '2027-02-28', '2028-02-29', '2026-01-01']) {
      const academy = sampleAcademy(today);
      expect(sampleAcademy(today)).toEqual(academy);
      const overview = academyOverview(academy, today);
      expect(overview.minimumMet.length).toBeGreaterThan(0);
      expect(overview.quiet.length).toBeGreaterThan(0);
      expect(overview.joinedRecently.length).toBeGreaterThan(0);
      expect(overview.mostSincePromotion).toHaveLength(5);
      expect(academy.members.filter((m) => m.role === 'owner')).toHaveLength(1);
      // Someone away is never listed as quiet, and nothing is dated after today.
      expect(overview.quiet.every((summary) => !summary.awayToday)).toBe(true);
      for (const person of academy.members) {
        expect(person.attendance.every((entry) => entry.date <= today)).toBe(true);
        expect(person.promotions.every((entry) => entry.date <= today)).toBe(true);
        expect(person.joinedOn <= addDays(today, -1)).toBe(true);
      }
    }
  });
});
