import { describe, expect, it } from 'vitest';
import { emptyData, type AppData } from '../domain/types';
import { parseData, parseDataWithReport } from '../domain/parse';
import { loadData, loadLastBackup, saveData, saveLastBackup, STORAGE_KEY } from './storage';

describe('storage', () => {
  it('round-trips app data through localStorage', () => {
    const data: AppData = {
      rank: { belt: 'blue', stripes: 2 },
      promotions: [{ id: 'p1', belt: 'blue', stripes: 0, date: '2024-01-01', academy: 'Home Gym' }],
      sessions: [{ id: 's1', date: '2024-02-01', durationMinutes: 90, type: 'nogi' }],
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

  it('remembers the last backup date', () => {
    expect(loadLastBackup()).toBeNull();
    saveLastBackup('2026-11-11');
    expect(loadLastBackup()).toBe('2026-11-11');
  });
});
