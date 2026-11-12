import { describe, expect, it } from 'vitest';
import {
  changesAnything,
  describeAdded,
  mergeData,
  NOTHING_ADDED,
  totalAdded,
  type Merged,
} from './merge';
import { emptyData, type AppData, type Session, type Technique } from './types';

const TODAY = '2026-11-11';

function technique(id: string, name: string): Technique {
  return { id, name, position: 'guard', status: 'drilling', addedOn: '2026-01-01', statusSince: '2026-01-01' };
}

function session(id: string, date: string, extra: Partial<Session> = {}): Session {
  return { id, date, durationMinutes: 60, type: 'gi', ...extra };
}

function must(device: AppData, file: AppData): Merged {
  const result = mergeData(device, file, TODAY);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

const PHONE: AppData = {
  ...emptyData(),
  rank: { belt: 'blue', stripes: 0 },
  promotions: [
    { id: 'p-start', belt: 'white', stripes: 0, date: '2022-01-10' },
    { id: 'p-blue', belt: 'blue', stripes: 0, date: '2024-06-01' },
  ],
  sessions: [session('s1', '2026-10-01'), session('s2', '2026-10-08')],
  weeklyGoal: 3,
  techniques: [technique('t-phone', 'Armbar')],
};

describe('mergeData', () => {
  it('adds what the device is missing and leaves what it has alone', () => {
    const laptop: AppData = {
      ...emptyData(),
      rank: { belt: 'blue', stripes: 0 },
      // The same session, changed on the laptop, and one the phone has never seen.
      sessions: [session('s2', '2026-10-08', { notes: 'Edited on the laptop' }), session('s3', '2026-10-15')],
      timeOff: [{ id: 'o1', startDate: '2026-09-01', endDate: '2026-09-10', reason: 'travel' }],
    };
    const { data, added, alreadyHere } = must(PHONE, laptop);
    expect(data.sessions).toEqual([...PHONE.sessions, session('s3', '2026-10-15')]);
    expect(data.timeOff).toEqual(laptop.timeOff);
    expect(added).toEqual({ ...NOTHING_ADDED, sessions: 1, timeOff: 1 });
    expect(alreadyHere).toBe(1);
    // Nothing the device had is lost.
    expect(data.promotions).toEqual(PHONE.promotions);
    expect(data.techniques).toEqual(PHONE.techniques);
    expect(data.weeklyGoal).toBe(3);
  });

  it('changes nothing when the file holds only what is here', () => {
    const { data, added, alreadyHere } = must(PHONE, PHONE);
    expect(data).toEqual(PHONE);
    expect(totalAdded(added)).toBe(0);
    expect(alreadyHere).toBe(5);
  });

  it('is the file itself when the device is empty', () => {
    const { data, added } = must(emptyData(), PHONE);
    expect(data).toEqual(PHONE);
    expect(added).toEqual({ ...NOTHING_ADDED, promotions: 2, sessions: 2, techniques: 1 });
  });

  it('treats a technique with the same name as the same technique, whatever its id', () => {
    const laptop: AppData = {
      ...emptyData(),
      techniques: [technique('t-laptop', 'armbar'), technique('t-new', 'Triangle')],
      sessions: [
        session('s9', '2026-11-01', { techniqueIds: ['t-laptop', 't-new'], landedIds: ['t-laptop'] }),
      ],
      competitions: [
        {
          id: 'c1',
          date: '2026-10-17',
          name: 'Autumn Open',
          type: 'gi',
          matches: [{ id: 'm1', result: 'win', method: 'submission', techniqueId: 't-laptop' }],
        },
      ],
    };
    const { data, added, alreadyHere } = must(PHONE, laptop);
    expect(data.techniques.map((t) => [t.id, t.name])).toEqual([
      ['t-phone', 'Armbar'],
      ['t-new', 'Triangle'],
    ]);
    // What pointed at the laptop's Armbar now points at the phone's.
    expect(data.sessions.at(-1)).toMatchObject({
      techniqueIds: ['t-phone', 't-new'],
      landedIds: ['t-phone'],
    });
    expect(data.competitions[0].matches[0].techniqueId).toBe('t-phone');
    expect(added).toEqual({ ...NOTHING_ADDED, sessions: 1, competitions: 1, techniques: 1 });
    expect(alreadyHere).toBe(1);
  });

  it('adds the matches a competition on both devices is missing', () => {
    const open = { id: 'c1', date: '2026-10-17', name: 'Autumn Open', type: 'gi' as const };
    const device: AppData = {
      ...emptyData(),
      competitions: [{ ...open, medal: 'gold', matches: [{ id: 'm1', result: 'win', method: 'points' }] }],
    };
    const file: AppData = {
      ...emptyData(),
      competitions: [
        {
          ...open,
          name: 'Renamed on the other device',
          matches: [
            { id: 'm1', result: 'loss', method: 'points' },
            { id: 'm2', result: 'win', method: 'advantages' },
          ],
        },
      ],
    };
    const { data, added, alreadyHere } = must(device, file);
    expect(data.competitions).toEqual([
      {
        ...open,
        medal: 'gold',
        matches: [
          { id: 'm1', result: 'win', method: 'points' },
          { id: 'm2', result: 'win', method: 'advantages' },
        ],
      },
    ]);
    expect(added).toEqual({ ...NOTHING_ADDED, matches: 1 });
    // The competition and its first match.
    expect(alreadyHere).toBe(2);
  });

  it('takes a promotion to a rank the device already has as the same promotion', () => {
    const laptop: AppData = {
      ...emptyData(),
      rank: { belt: 'blue', stripes: 1 },
      promotions: [
        { id: 'other-id', belt: 'blue', stripes: 0, date: '2024-06-02' },
        { id: 'p-blue-1', belt: 'blue', stripes: 1, date: '2025-02-01' },
      ],
    };
    const { data, added } = must(PHONE, laptop);
    expect(data.promotions.map((p) => p.id)).toEqual(['p-start', 'p-blue', 'p-blue-1']);
    expect(data.rank).toEqual({ belt: 'blue', stripes: 1 });
    expect(added.promotions).toBe(1);
  });

  it('counts the matches that do not fit in a full competition', () => {
    const open = { id: 'c1', date: '2026-10-17', name: 'Autumn Open', type: 'gi' as const };
    const match = (id: string) => ({ id, result: 'win' as const, method: 'points' as const });
    const full = Array.from({ length: 29 }, (_, index) => match(`here-${index}`));
    const device: AppData = { ...emptyData(), competitions: [{ ...open, matches: full }] };
    const file: AppData = {
      ...emptyData(),
      competitions: [{ ...open, matches: [match('a'), match('b'), match('c')] }],
    };
    const merged = must(device, file);
    expect(merged.data.competitions[0].matches).toHaveLength(30);
    expect(merged.added.matches).toBe(1);
    expect(merged.matchesLeftOut).toBe(2);

    // With no room at all nothing is added, and that is not the same as nothing being new.
    const none = must({ ...emptyData(), competitions: [{ ...open, matches: [...full, match('z')] }] }, file);
    expect(totalAdded(none.added)).toBe(0);
    expect(none.matchesLeftOut).toBe(3);
  });

  it('reports a raised rank and a goal taken from the file, even with no new records', () => {
    const device: AppData = { ...PHONE, weeklyGoal: null };
    const file: AppData = { ...device, rank: { belt: 'blue', stripes: 2 }, weeklyGoal: 4 };
    const merged = must(device, file);
    expect(totalAdded(merged.added)).toBe(0);
    expect(merged.rankRaisedTo).toEqual({ belt: 'blue', stripes: 2 });
    expect(merged.goalSetTo).toBe(4);
    expect(changesAnything(merged)).toBe(true);

    const same = must(PHONE, PHONE);
    expect(same.rankRaisedTo).toBeNull();
    expect(same.goalSetTo).toBeNull();
    expect(changesAnything(same)).toBe(false);
    // A lower rank in the file, and a goal the device already has, change nothing.
    const lower = must(PHONE, { ...PHONE, rank: { belt: 'white', stripes: 0 }, weeklyGoal: 7 });
    expect(changesAnything(lower)).toBe(false);
  });

  it('never lowers the rank, and takes the higher of the two', () => {
    const file: AppData = { ...emptyData(), rank: { belt: 'white', stripes: 3 } };
    expect(must(PHONE, file).data.rank).toEqual({ belt: 'blue', stripes: 0 });
    expect(must(file, { ...emptyData(), rank: { belt: 'purple', stripes: 0 } }).data.rank).toEqual({
      belt: 'purple',
      stripes: 0,
    });
  });

  it('refuses when the two promotion histories cannot both be right', () => {
    const file: AppData = {
      ...emptyData(),
      // Purple belt dated before the phone's blue belt.
      promotions: [{ id: 'p-purple', belt: 'purple', stripes: 0, date: '2023-01-01' }],
    };
    const result = mergeData(PHONE, file, TODAY);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain("don't fit with the ones on this device");
  });

  it('takes the goal from the file only when the device has none', () => {
    const file: AppData = { ...emptyData(), weeklyGoal: 5 };
    expect(must(PHONE, file).data.weeklyGoal).toBe(3);
    expect(must({ ...PHONE, weeklyGoal: null }, file).data.weeklyGoal).toBe(5);
  });

  it('refuses when together the journals are too big', () => {
    const many = (prefix: string) =>
      Array.from({ length: 200 }, (_, index) => technique(`${prefix}${index}`, `${prefix} ${index}`));
    const result = mergeData(
      { ...emptyData(), techniques: many('a') },
      { ...emptyData(), techniques: many('b') },
      TODAY,
    );
    expect(!result.ok && result.error).toContain('more than 300 techniques');
  });

  it('gives the same records whichever way round the two are merged', () => {
    const laptop: AppData = {
      ...emptyData(),
      sessions: [session('s3', '2026-10-15')],
      techniques: [technique('t-new', 'Triangle')],
    };
    const ids = (data: AppData) => ({
      sessions: data.sessions.map((s) => s.id).sort(),
      techniques: data.techniques.map((t) => t.name).sort(),
      promotions: data.promotions.map((p) => p.id).sort(),
    });
    expect(ids(must(PHONE, laptop).data)).toEqual(ids(must(laptop, PHONE).data));
    // Merging the result again adds nothing.
    const once = must(PHONE, laptop).data;
    expect(totalAdded(must(once, laptop).added)).toBe(0);
    expect(must(once, laptop).data).toEqual(once);
  });
});

describe('describeAdded', () => {
  it('names only what was added', () => {
    expect(describeAdded({ ...NOTHING_ADDED, sessions: 12 })).toBe('12 sessions');
    expect(describeAdded({ ...NOTHING_ADDED, sessions: 1, promotions: 1 })).toBe(
      '1 promotion and 1 session',
    );
    expect(
      describeAdded({ promotions: 0, sessions: 3, competitions: 1, matches: 2, techniques: 4, timeOff: 1 }),
    ).toBe('3 sessions, 1 competition, 2 matches, 4 techniques and 1 period of time off');
    expect(describeAdded(NOTHING_ADDED)).toBe('');
  });
});
