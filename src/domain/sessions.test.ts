import { describe, expect, it } from 'vitest';
import {
  addSession,
  caughtTally,
  cleanCaught,
  deleteSession,
  describeSession,
  filterSessions,
  formatHours,
  isFiltering,
  NO_FILTER,
  matTimeStats,
  sessionDefaults,
  sortSessions,
  updateSession,
  type SessionInput,
} from './sessions';
import { emptyData, type AppData, type Promotion, type Session } from './types';

const TODAY = '2026-11-11';

function mustAdd(data: AppData, input: SessionInput): AppData {
  const result = addSession(data, input, TODAY);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

describe('addSession', () => {
  it('logs a session', () => {
    const data = mustAdd(emptyData(), { date: TODAY, durationMinutes: 90, type: 'nogi' });
    expect(data.sessions).toHaveLength(1);
    expect(data.sessions[0]).toMatchObject({ date: TODAY, durationMinutes: 90, type: 'nogi' });
  });

  it.each([
    [{ date: '2026-11-12', durationMinutes: 60, type: 'gi' }, 'future'],
    [{ date: 'yesterday', durationMinutes: 60, type: 'gi' }, 'valid session date'],
    [{ date: TODAY, durationMinutes: 0, type: 'gi' }, 'duration'],
    [{ date: TODAY, durationMinutes: 601, type: 'gi' }, 'duration'],
    [{ date: TODAY, durationMinutes: 45.5, type: 'gi' }, 'duration'],
    [{ date: TODAY, durationMinutes: Number.NaN, type: 'gi' }, 'duration'],
    [{ date: TODAY, durationMinutes: 60, type: 'judo' }, 'gi or no-gi'],
    [{ date: TODAY, durationMinutes: 60, type: 'gi', kind: 'seminar' }, 'kind of session'],
    [{ date: TODAY, durationMinutes: 60, type: 'gi', rounds: -1 }, 'rounds'],
    [{ date: TODAY, durationMinutes: 60, type: 'gi', rounds: 2.5 }, 'rounds'],
    [{ date: TODAY, durationMinutes: 60, type: 'gi', rounds: 31 }, 'rounds'],
    [
      { date: TODAY, durationMinutes: 60, type: 'gi', caughtWith: Array.from({ length: 11 }, (_, i) => `Sub ${i}`) },
      'up to 10 submissions',
    ],
    [{ date: TODAY, durationMinutes: 60, type: 'gi', caughtWith: ['x'.repeat(61)] }, '60 characters'],
    [{ date: TODAY, durationMinutes: 60, type: 'gi', notes: 'x'.repeat(501) }, '500 characters'],
  ])('rejects %o', (input, message) => {
    const result = addSession(emptyData(), input as SessionInput, TODAY);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain(message);
  });
});

describe('session notes', () => {
  it('keeps trimmed notes and leaves blank ones out', () => {
    let data = mustAdd(emptyData(), {
      date: TODAY,
      durationMinutes: 60,
      type: 'gi',
      notes: '  Knee cut passing ',
    });
    data = mustAdd(data, { date: TODAY, durationMinutes: 60, type: 'gi', notes: '   ' });
    expect(data.sessions[0].notes).toBe('Knee cut passing');
    expect(data.sessions[1]).not.toHaveProperty('notes');
  });

  it('changes and removes notes when a session is edited', () => {
    const data = mustAdd(emptyData(), { date: TODAY, durationMinutes: 60, type: 'gi', notes: 'Old' });
    const { id } = data.sessions[0];
    const input = { date: TODAY, durationMinutes: 60, type: 'gi' } as const;

    const changed = updateSession(data, id, { ...input, notes: 'New' }, TODAY);
    expect(changed.ok && changed.value.sessions[0].notes).toBe('New');

    const cleared = updateSession(data, id, { ...input, notes: '' }, TODAY);
    expect(cleared.ok && cleared.value.sessions[0]).toEqual({ id, ...input });
  });
});

describe('filterSessions', () => {
  const sessions: Session[] = [
    { id: 'a', date: '2026-11-01', durationMinutes: 60, type: 'gi', notes: 'Knee cut passing' },
    { id: 'b', date: '2026-11-03', durationMinutes: 60, type: 'nogi', notes: 'Leg locks, heel hooks' },
    { id: 'c', date: '2026-11-05', durationMinutes: 60, type: 'gi' },
    { id: 'd', date: '2026-11-07', durationMinutes: 60, type: 'nogi', notes: 'Passing the knee shield' },
  ];
  const ids = (found: Session[]) => found.map((s) => s.id);

  it('keeps everything when nothing is chosen', () => {
    expect(isFiltering(NO_FILTER)).toBe(false);
    expect(isFiltering({ type: 'all', text: '  ' })).toBe(false);
    expect(filterSessions(sessions, NO_FILTER)).toEqual(sessions);
  });

  it('filters by type', () => {
    expect(isFiltering({ type: 'gi', text: '' })).toBe(true);
    expect(ids(filterSessions(sessions, { type: 'gi', text: '' }))).toEqual(['a', 'c']);
    expect(ids(filterSessions(sessions, { type: 'nogi', text: '' }))).toEqual(['b', 'd']);
  });

  it('finds notes containing every word, in any order and case', () => {
    expect(ids(filterSessions(sessions, { type: 'all', text: 'PASSING' }))).toEqual(['a', 'd']);
    expect(ids(filterSessions(sessions, { type: 'all', text: 'passing knee' }))).toEqual(['a', 'd']);
    expect(ids(filterSessions(sessions, { type: 'all', text: 'knee shield' }))).toEqual(['d']);
    expect(ids(filterSessions(sessions, { type: 'all', text: 'berimbolo' }))).toEqual([]);
  });

  it('combines the type and the search', () => {
    expect(ids(filterSessions(sessions, { type: 'gi', text: 'passing' }))).toEqual(['a']);
  });
});

describe('updateSession and deleteSession', () => {
  it('edits and removes a session', () => {
    const data = mustAdd(emptyData(), { date: '2026-11-01', durationMinutes: 60, type: 'gi' });
    const { id } = data.sessions[0];

    const edited = updateSession(data, id, { date: '2026-11-02', durationMinutes: 75, type: 'nogi' }, TODAY);
    expect(edited.ok && edited.value.sessions).toEqual([
      { id, date: '2026-11-02', durationMinutes: 75, type: 'nogi' },
    ]);

    const invalid = updateSession(data, id, { date: '2026-11-02', durationMinutes: -5, type: 'gi' }, TODAY);
    expect(invalid.ok).toBe(false);

    expect(deleteSession(data, id).sessions).toEqual([]);
  });
});

describe('ordering and defaults', () => {
  it('lists newest first and pre-fills from the last session logged', () => {
    let data = mustAdd(emptyData(), { date: '2026-11-05', durationMinutes: 60, type: 'gi' });
    data = mustAdd(data, { date: '2026-11-09', durationMinutes: 60, type: 'gi' });
    data = mustAdd(data, { date: '2026-11-01', durationMinutes: 90, type: 'nogi' });

    expect(sortSessions(data.sessions).map((s) => s.date)).toEqual([
      '2026-11-09',
      '2026-11-05',
      '2026-11-01',
    ]);
    expect(sessionDefaults(data.sessions)).toEqual({
      durationMinutes: 90,
      type: 'nogi',
      kind: 'class',
    });
    expect(sessionDefaults([])).toEqual({ durationMinutes: 60, type: 'gi', kind: 'class' });
  });
});

describe('matTimeStats', () => {
  const promotions: Promotion[] = [
    { id: 'b', belt: 'blue', stripes: 0, date: '2026-06-01' },
    { id: 'b1', belt: 'blue', stripes: 1, date: '2026-10-01' },
  ];

  it('counts sessions and hours since the most recent promotion', () => {
    let data: AppData = { ...emptyData(), promotions };
    data = mustAdd(data, { date: '2026-09-30', durationMinutes: 60, type: 'gi' });
    data = mustAdd(data, { date: '2026-10-01', durationMinutes: 90, type: 'gi' });
    data = mustAdd(data, { date: '2026-10-20', durationMinutes: 60, type: 'nogi' });

    const stats = matTimeStats(data);
    expect(stats.allTime).toEqual({
      sessions: 3,
      minutes: 210,
      giSessions: 2,
      nogiSessions: 1,
      rounds: 0,
    });
    expect(stats.sinceLastPromotion?.promotion.id).toBe('b1');
    expect(stats.sinceLastPromotion?.total).toMatchObject({ sessions: 2, minutes: 150 });
  });

  it('recalculates when a newer promotion is logged', () => {
    let data: AppData = { ...emptyData(), promotions };
    data = mustAdd(data, { date: '2026-10-20', durationMinutes: 60, type: 'gi' });
    expect(matTimeStats(data).sinceLastPromotion?.total.sessions).toBe(1);

    const promoted: AppData = {
      ...data,
      promotions: [...promotions, { id: 'b2', belt: 'blue', stripes: 2, date: '2026-11-10' }],
    };
    expect(matTimeStats(promoted).sinceLastPromotion?.total.sessions).toBe(0);
  });

  it('has no since-promotion figure until a promotion is logged', () => {
    expect(matTimeStats(emptyData()).sinceLastPromotion).toBeNull();
  });
});

describe('formatHours', () => {
  it('rounds to one decimal place', () => {
    expect(formatHours(90)).toBe('1.5');
    expect(formatHours(120)).toBe('2');
    expect(formatHours(50)).toBe('0.8');
    expect(formatHours(0)).toBe('0');
  });
});

describe('the kind of session and rounds rolled', () => {
  const base = { date: TODAY, durationMinutes: 60, type: 'gi' } as const;

  it('keeps the kind and the rounds, and tells no rolling from not recorded', () => {
    let data = mustAdd(emptyData(), { ...base, kind: 'open-mat', rounds: 6 });
    data = mustAdd(data, { ...base, kind: 'drilling', rounds: 0 });
    data = mustAdd(data, base);
    expect(data.sessions[0]).toMatchObject({ kind: 'open-mat', rounds: 6 });
    expect(data.sessions[1]).toMatchObject({ kind: 'drilling', rounds: 0 });
    expect(data.sessions[2]).not.toHaveProperty('kind');
    expect(data.sessions[2]).not.toHaveProperty('rounds');
  });

  it('describes a session by what it records', () => {
    const session = { id: 's', ...base };
    expect(describeSession(session)).toBe('Gi');
    expect(describeSession({ ...session, kind: 'open-mat', rounds: 6 })).toBe(
      'Gi · Open mat · 6 rounds',
    );
    expect(describeSession({ ...session, type: 'nogi', kind: 'class', rounds: 1 })).toBe(
      'No-gi · Class · 1 round',
    );
    expect(describeSession({ ...session, kind: 'private', rounds: 0 })).toBe(
      'Gi · Private lesson · 0 rounds',
    );
  });

  it('pre-fills the kind from the last session logged', () => {
    const data = mustAdd(emptyData(), { ...base, kind: 'open-mat', rounds: 6 });
    expect(sessionDefaults(data.sessions).kind).toBe('open-mat');
  });

  it('totals rounds over the sessions that record them', () => {
    let data = mustAdd(emptyData(), { ...base, rounds: 6 });
    data = mustAdd(data, { ...base, rounds: 4 });
    data = mustAdd(data, base);
    expect(matTimeStats(data).allTime.rounds).toBe(10);
  });

  it('finds sessions by their kind', () => {
    let data = mustAdd(emptyData(), { ...base, kind: 'open-mat' });
    data = mustAdd(data, { ...base, kind: 'class' });
    const found = filterSessions(data.sessions, { type: 'all', text: 'open mat' });
    expect(found.map((session) => session.kind)).toEqual(['open-mat']);
  });
});

describe('what a session was caught with', () => {
  const base = { date: TODAY, durationMinutes: 60, type: 'gi' } as const;

  it('tidies the names, keeps each once whatever its case, and leaves an empty list off', () => {
    const data = mustAdd(emptyData(), {
      ...base,
      caughtWith: ['  Armbar ', 'armbar', 'Bow   and arrow', '', '  '],
    });
    expect(data.sessions[0].caughtWith).toEqual(['Armbar', 'Bow and arrow']);
    expect(mustAdd(emptyData(), { ...base, caughtWith: [] }).sessions[0]).not.toHaveProperty(
      'caughtWith',
    );
    expect(cleanCaught('Armbar')).toEqual([]);
    expect(cleanCaught(['Armbar', 7, null])).toEqual(['Armbar']);
  });

  it('counts each name once a session, most common first, with its latest spelling', () => {
    const sessions: Session[] = [
      { id: 'a', ...base, date: '2026-10-01', caughtWith: ['armbar', 'Triangle'] },
      { id: 'b', ...base, date: '2026-11-03', caughtWith: ['Armbar'] },
      { id: 'c', ...base, date: '2026-10-20', caughtWith: ['Kimura', 'ARMBAR'] },
      { id: 'd', ...base, date: '2026-11-05', caughtWith: ['Guillotine'] },
      { id: 'e', ...base, date: '2026-11-07' },
    ];
    expect(caughtTally(sessions)).toEqual([
      { name: 'Armbar', sessions: 3, last: '2026-11-03' },
      // One session each: most recent first.
      { name: 'Guillotine', sessions: 1, last: '2026-11-05' },
      { name: 'Kimura', sessions: 1, last: '2026-10-20' },
      { name: 'Triangle', sessions: 1, last: '2026-10-01' },
    ]);
    expect(caughtTally([])).toEqual([]);
  });

  it('finds a session by what it was caught with', () => {
    const data = mustAdd(mustAdd(emptyData(), { ...base, caughtWith: ['Bow and arrow'] }), base);
    expect(filterSessions(data.sessions, { type: 'all', text: 'arrow' })).toHaveLength(1);
  });
});
