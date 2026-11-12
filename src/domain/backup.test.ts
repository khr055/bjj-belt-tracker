import { describe, expect, it } from 'vitest';
import {
  backupFileName,
  BACKUP_FORMAT,
  BACKUP_VERSION,
  createBackupText,
  readBackup,
} from './backup';
import { emptyData, type AppData } from './types';

const TODAY = '2026-11-11';
const SAVED_AT = new Date(2026, 10, 10, 9, 30);

const DATA: AppData = {
  rank: { belt: 'blue', stripes: 2 },
  promotions: [
    { id: 'p1', belt: 'white', stripes: 0, date: '2022-01-10' },
    { id: 'p2', belt: 'blue', stripes: 0, date: '2024-03-02', promotedBy: 'Coach', academy: 'Gym' },
  ],
  sessions: [
    { id: 's1', date: '2026-11-01', durationMinutes: 90, type: 'nogi', notes: 'Guard retention' },
  ],
  weeklyGoal: 3,
  competitions: [
    {
      id: 'c1',
      date: '2026-10-17',
      name: 'Autumn Open',
      type: 'gi',
      division: 'Adult, blue belt, middleweight',
      medal: 'gold',
      notes: 'First gold',
      matches: [
        { id: 'm1', result: 'win', method: 'submission', submission: 'Triangle', opponent: 'A. Rival' },
        { id: 'm2', result: 'win', method: 'points' },
      ],
    },
  ],
};

function file(overrides: Record<string, unknown>): string {
  return JSON.stringify({ format: BACKUP_FORMAT, version: 1, data: DATA, ...overrides });
}

function errorOf(text: string): string {
  const result = readBackup(text, TODAY);
  if (result.ok) throw new Error('expected the backup to be refused');
  return result.error;
}

describe('backup files', () => {
  it('names the file after the day it was saved', () => {
    expect(backupFileName(SAVED_AT)).toBe('bjj-belt-tracker-backup-2026-11-10.json');
  });

  it('restores exactly what was backed up', () => {
    const result = readBackup(createBackupText(DATA, SAVED_AT), TODAY);
    expect(result).toEqual({
      ok: true,
      value: { data: DATA, exportedOn: '2026-11-10', skipped: 0 },
    });
  });

  it('round-trips an empty app', () => {
    const empty = emptyData();
    const result = readBackup(createBackupText(empty, SAVED_AT), TODAY);
    expect(result.ok && result.value.data).toEqual(empty);
  });

  it.each([
    ['not JSON', 'hello'],
    ['a JSON value that is not an object', '42'],
    ['JSON from somewhere else', JSON.stringify({ rank: null, promotions: [], sessions: [] })],
    ['a backup with no version', JSON.stringify({ format: BACKUP_FORMAT, data: DATA })],
  ])('refuses %s', (_label, text) => {
    expect(errorOf(text)).toBe("That file isn't a Belt Tracker backup.");
  });

  it('refuses a backup from a newer version of the app', () => {
    expect(errorOf(file({ version: BACKUP_VERSION + 1 }))).toContain('newer version');
  });

  it('restores a version 1 backup, made before goals and competitions existed', () => {
    const old = { rank: DATA.rank, promotions: DATA.promotions, sessions: [] };
    const result = readBackup(file({ version: 1, data: old }), TODAY);
    expect(result.ok && result.value.data).toEqual({ ...old, weeklyGoal: null, competitions: [] });
  });

  it('saves backups in the current version', () => {
    expect(JSON.parse(createBackupText(DATA, SAVED_AT)).version).toBe(BACKUP_VERSION);
  });

  it('refuses a history whose promotions are out of order', () => {
    const promotions = [
      { id: 'a', belt: 'purple', stripes: 0, date: '2020-01-01' },
      { id: 'b', belt: 'blue', stripes: 0, date: '2022-01-01' },
    ];
    expect(errorOf(file({ data: { ...DATA, promotions } }))).toContain("doesn't add up");
  });

  it('refuses promotions dated in the future', () => {
    const promotions = [{ id: 'a', belt: 'blue', stripes: 0, date: '2027-01-01' }];
    expect(errorOf(file({ data: { ...DATA, promotions } }))).toContain('future');
  });

  it('leaves out unreadable records and reports how many', () => {
    const sessions = [...DATA.sessions, { id: 's2', date: 'last week', durationMinutes: 60, type: 'gi' }];
    const result = readBackup(file({ data: { ...DATA, sessions } }), TODAY);
    expect(result.ok && result.value.skipped).toBe(1);
    expect(result.ok && result.value.data.sessions).toEqual(DATA.sessions);
    expect(result.ok && result.value.exportedOn).toBeNull();
  });
});
