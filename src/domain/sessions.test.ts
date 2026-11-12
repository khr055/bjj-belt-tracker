import { describe, expect, it } from 'vitest';
import {
  addSession,
  deleteSession,
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
    expect(sessionDefaults(data.sessions)).toEqual({ durationMinutes: 90, type: 'nogi' });
    expect(sessionDefaults([])).toEqual({ durationMinutes: 60, type: 'gi' });
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
    expect(stats.allTime).toEqual({ sessions: 3, minutes: 210, giSessions: 2, nogiSessions: 1 });
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
