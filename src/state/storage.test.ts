import { describe, expect, it } from 'vitest';
import { emptyData, type AppData } from '../domain/types';
import { parseData, parseDataWithReport } from '../domain/parse';
import { loadData, loadLastBackup, saveData, saveLastBackup, STORAGE_KEY } from './storage';

describe('storage', () => {
  it('round-trips app data through localStorage', () => {
    const data: AppData = {
      rank: { belt: 'blue', stripes: 2 },
      promotions: [{ id: 'p1', belt: 'blue', stripes: 0, date: '2024-01-01', academy: 'Home Gym' }],
      sessions: [
        { id: 's1', date: '2024-02-01', durationMinutes: 90, type: 'nogi', notes: 'Leg locks' },
      ],
      weeklyGoal: 3,
      competitions: [
        {
          id: 'c1',
          date: '2024-03-09',
          name: 'Spring Open',
          type: 'gi',
          medal: 'silver',
          matches: [
            { id: 'm1', result: 'win', method: 'submission', submission: 'Armbar' },
            { id: 'm2', result: 'loss', method: 'points', opponent: 'A. Rival' },
          ],
        },
      ],
    };
    expect(saveData(data)).toBe(true);
    expect(loadData()).toEqual(data);
  });

  it('starts empty when nothing is stored or the stored value is corrupt', () => {
    expect(loadData()).toEqual(emptyData());
    window.localStorage.setItem(STORAGE_KEY, '{not json');
    expect(loadData()).toEqual(emptyData());
  });

  it('drops invalid records and keeps the valid ones', () => {
    const parsed = parseData({
      rank: { belt: 'red', stripes: 9 },
      promotions: [
        { id: 'ok', belt: 'purple', stripes: 1, date: '2024-01-01' },
        { id: 'bad-date', belt: 'blue', stripes: 0, date: '2024-02-31' },
        { belt: 'blue', stripes: 0, date: '2023-01-01' },
      ],
      sessions: [
        { id: 'ok', date: '2024-03-01', durationMinutes: 60, type: 'gi' },
        { id: 'bad', date: '2024-03-01', durationMinutes: '60', type: 'gi' },
      ],
    });
    expect(parsed.promotions.map((p) => p.id)).toEqual(['ok']);
    expect(parsed.sessions.map((s) => s.id)).toEqual(['ok']);
    // An invalid stored rank falls back to the highest logged promotion.
    expect(parsed.rank).toEqual({ belt: 'purple', stripes: 1 });
  });

  it('counts malformed and duplicate records as skipped', () => {
    const report = parseDataWithReport({
      rank: null,
      promotions: [
        { id: 'p', belt: 'blue', stripes: 0, date: '2024-01-01' },
        { id: 'p', belt: 'blue', stripes: 1, date: '2024-06-01' },
      ],
      sessions: [{ id: 's', date: 'soon', durationMinutes: 60, type: 'gi' }],
    });
    expect(report.data.promotions).toHaveLength(1);
    expect(report.skipped).toBe(2);
  });

  it('loads data saved before notes, goals and competitions existed', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        rank: { belt: 'white', stripes: 1 },
        promotions: [],
        sessions: [{ id: 's1', date: '2024-02-01', durationMinutes: 60, type: 'gi' }],
      }),
    );
    expect(loadData()).toEqual({
      ...emptyData(),
      rank: { belt: 'white', stripes: 1 },
      sessions: [{ id: 's1', date: '2024-02-01', durationMinutes: 60, type: 'gi' }],
    });
  });

  it('tidies notes, goals and competitions, dropping what does not hold up', () => {
    const report = parseDataWithReport({
      sessions: [{ id: 's1', date: '2024-02-01', durationMinutes: 60, type: 'gi', notes: '   ' }],
      weeklyGoal: 12,
      competitions: [
        {
          id: 'c1',
          date: '2024-03-09',
          name: '  Spring Open ',
          type: 'gi',
          medal: 'platinum',
          matches: [
            { id: 'm1', result: 'draw', method: 'points', submission: 'Armbar' },
            { id: 'm2', result: 'win', method: 'points', submission: 'Armbar' },
            { id: 'm3', result: 'win' },
            { id: 'm1', result: 'loss', method: 'decision' },
          ],
        },
        { id: 'c2', date: '2024-03-09', name: '', type: 'gi', matches: [] },
        { id: 'c3', date: '2024-03-09', name: 'No matches listed', type: 'nogi' },
      ],
    });
    expect(report.data.sessions[0]).not.toHaveProperty('notes');
    expect(report.data.weeklyGoal).toBeNull();
    expect(report.data.competitions).toEqual([
      {
        id: 'c1',
        date: '2024-03-09',
        name: 'Spring Open',
        type: 'gi',
        matches: [
          { id: 'm1', result: 'draw' },
          { id: 'm2', result: 'win', method: 'points' },
        ],
      },
      { id: 'c3', date: '2024-03-09', name: 'No matches listed', type: 'nogi', matches: [] },
    ]);
    // One competition with no name, one match with no method and one with a repeated id.
    expect(report.skipped).toBe(3);
  });

  it('remembers the last backup date', () => {
    expect(loadLastBackup()).toBeNull();
    saveLastBackup('2026-11-11');
    expect(loadLastBackup()).toBe('2026-11-11');
  });
});
