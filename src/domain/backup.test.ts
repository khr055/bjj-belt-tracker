import { describe, expect, it } from 'vitest';
import {
  backupFileName,
  backupReminder,
  BACKUP_FORMAT,
  BACKUP_VERSION,
  createBackupText,
  readBackup,
} from './backup';
import { emptyData, type AppData, type Session } from './types';

const TODAY = '2026-11-11';
const SAVED_AT = new Date(2026, 10, 10, 9, 30);

const DATA: AppData = {
  rank: { belt: 'blue', stripes: 2 },
  promotions: [
    { id: 'p1', belt: 'white', stripes: 0, date: '2022-01-10' },
    { id: 'p2', belt: 'blue', stripes: 0, date: '2024-03-02', promotedBy: 'Coach', academy: 'Gym' },
  ],
  sessions: [
    {
      id: 's1',
      date: '2026-11-01',
      durationMinutes: 90,
      type: 'nogi',
      notes: 'Guard retention',
      techniqueIds: ['t1'],
    },
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
  techniques: [
    {
      id: 't1',
      name: 'Knee shield retention',
      position: 'half-guard',
      status: 'drilling',
      notes: 'Frame first',
      addedOn: '2026-10-20',
      statusSince: '2026-11-02',
    },
    {
      id: 't2',
      name: 'Triangle',
      position: 'guard',
      status: 'landing',
      addedOn: '2026-09-01',
      statusSince: '2026-09-01',
    },
  ],
  timeOff: [{ id: 'o1', startDate: '2026-08-03', endDate: '2026-08-16', reason: 'injury', notes: 'Rib' }],
};

function file(overrides: Record<string, unknown>): string {
  return JSON.stringify({ format: BACKUP_FORMAT, version: 1, data: DATA, ...overrides });
}

function errorOf(text: string): string {
  const result = readBackup(text, TODAY);
  if (result.ok) throw new Error('expected the backup to be refused');
  return result.error;
}

describe('backupReminder', () => {
  function withSessions(amount: number): AppData {
    const sessions: Session[] = Array.from({ length: amount }, (_, index) => ({
      id: `s${index}`,
      date: '2026-10-01',
      durationMinutes: 60,
      type: 'gi',
    }));
    return { ...emptyData(), sessions };
  }

  it('stays quiet when there is nothing to lose', () => {
    expect(backupReminder(emptyData(), null, null, TODAY)).toBeNull();
    expect(backupReminder({ ...emptyData(), weeklyGoal: 3 }, '2020-01-01', null, TODAY)).toBeNull();
  });

  it('counts techniques as history worth backing up', () => {
    const data = { ...emptyData(), techniques: DATA.techniques };
    expect(backupReminder(data, '2026-09-01', null, TODAY)).toEqual({ kind: 'overdue', days: 71 });
  });

  it('waits for ten records before suggesting a first backup', () => {
    expect(backupReminder(withSessions(9), null, null, TODAY)).toBeNull();
    expect(backupReminder(withSessions(10), null, null, TODAY)).toEqual({ kind: 'never' });
  });

  it('suggests another backup 30 days after the last one', () => {
    expect(backupReminder(withSessions(1), '2026-10-13', null, TODAY)).toBeNull();
    expect(backupReminder(withSessions(1), '2026-10-12', null, TODAY)).toEqual({
      kind: 'overdue',
      days: 30,
    });
    expect(backupReminder(withSessions(1), '2026-09-01', null, TODAY)).toEqual({
      kind: 'overdue',
      days: 71,
    });
  });

  it('stays quiet for 30 days after being put off', () => {
    expect(backupReminder(withSessions(10), null, '2026-11-01', TODAY)).toBeNull();
    expect(backupReminder(withSessions(1), '2026-09-01', '2026-10-13', TODAY)).toBeNull();
    expect(backupReminder(withSessions(1), '2026-09-01', '2026-10-12', TODAY)).not.toBeNull();
  });
});

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
    expect(result.ok && result.value.data).toEqual({
      ...old,
      weeklyGoal: null,
      competitions: [],
      techniques: [],
      timeOff: [],
    });
  });

  it('restores a version 2 backup, made before techniques existed', () => {
    const { techniques: _techniques, ...old } = DATA;
    const sessions = [{ id: 's1', date: '2026-11-01', durationMinutes: 90, type: 'nogi' }];
    const result = readBackup(file({ version: 2, data: { ...old, sessions } }), TODAY);
    expect(result.ok && result.value.data).toEqual({ ...old, sessions, techniques: [] });
    expect(result.ok && result.value.skipped).toBe(0);
  });

  it('restores a version 3 backup, made before stages were dated', () => {
    const techniques = DATA.techniques.map(({ statusSince: _statusSince, ...old }) => old);
    const result = readBackup(file({ version: 3, data: { ...DATA, techniques } }), TODAY);
    expect(result.ok && result.value.data.techniques).toEqual(
      DATA.techniques.map((technique) => ({ ...technique, statusSince: technique.addedOn })),
    );
    expect(result.ok && result.value.skipped).toBe(0);
  });

  it('keeps the kind, rounds and landed techniques a version 5 backup holds', () => {
    const [first] = DATA.techniques;
    const sessions = [
      {
        id: 's1',
        date: '2026-11-01',
        durationMinutes: 90,
        type: 'nogi',
        kind: 'open-mat',
        rounds: 6,
        landedIds: [first.id],
      },
      // What cannot be right is dropped from the session; the session is kept.
      {
        id: 's2',
        date: '2026-11-02',
        durationMinutes: 60,
        type: 'gi',
        kind: 'seminar',
        rounds: 99,
        landedIds: ['gone'],
      },
    ];
    const result = readBackup(file({ version: 5, data: { ...DATA, sessions } }), TODAY);
    expect(result.ok && result.value.data.sessions).toEqual([
      sessions[0],
      { id: 's2', date: '2026-11-02', durationMinutes: 60, type: 'gi' },
    ]);
    expect(result.ok && result.value.skipped).toBe(0);
  });

  it('restores a version 5 backup, made before time off existed', () => {
    const { timeOff: _timeOff, ...old } = DATA;
    const result = readBackup(file({ version: 5, data: old }), TODAY);
    expect(result.ok && result.value.data).toEqual({ ...old, timeOff: [] });
    expect(result.ok && result.value.skipped).toBe(0);
  });

  it('keeps the time off, degrees and linked wins a version 6 backup holds', () => {
    const [first] = DATA.techniques;
    const data = {
      ...DATA,
      rank: { belt: 'black', stripes: 5 },
      promotions: [{ id: 'p1', belt: 'black', stripes: 5, date: '2026-01-01' }],
      competitions: [
        {
          id: 'c1',
          date: '2026-10-17',
          name: 'Autumn Open',
          type: 'gi',
          matches: [
            { id: 'm1', result: 'win', method: 'submission', techniqueId: first.id },
            // A link that cannot be right is dropped; the match and its words are kept.
            { id: 'm2', result: 'win', method: 'submission', techniqueId: 'gone', submission: 'Armbar' },
            { id: 'm3', result: 'loss', method: 'submission', techniqueId: first.id },
          ],
        },
      ],
      timeOff: [
        { id: 'o1', startDate: '2026-08-03', endDate: '2026-08-16', reason: 'injury' },
        // A last day that cannot be right spoils the record: it is not read as still going on.
        { id: 'o2', startDate: '2026-09-10', endDate: '2026-09-01', reason: 'travel' },
        { id: 'o3', startDate: '2026-09-12', endDate: 5, reason: 'travel' },
        { id: 'o4', startDate: '2026-09-20', reason: 'holiday' },
        { id: 'o5', startDate: '2026-10-20', reason: 'illness' },
        // A blank or null last day is no last day.
        { id: 'o6', startDate: '2026-10-21', endDate: '', reason: 'other' },
        { id: 'o7', startDate: '2026-10-22', endDate: null, reason: 'other' },
      ],
    };
    const result = readBackup(file({ version: 6, data }), TODAY);
    if (!result.ok) throw new Error(result.error);
    expect(result.value.data.rank).toEqual({ belt: 'black', stripes: 5 });
    expect(result.value.data.competitions[0].matches).toEqual([
      { id: 'm1', result: 'win', method: 'submission', techniqueId: first.id },
      { id: 'm2', result: 'win', method: 'submission', submission: 'Armbar' },
      { id: 'm3', result: 'loss', method: 'submission' },
    ]);
    expect(result.value.data.timeOff).toEqual([
      { id: 'o1', startDate: '2026-08-03', endDate: '2026-08-16', reason: 'injury' },
      { id: 'o5', startDate: '2026-10-20', reason: 'illness' },
      { id: 'o6', startDate: '2026-10-21', reason: 'other' },
      { id: 'o7', startDate: '2026-10-22', reason: 'other' },
    ]);
    expect(result.value.skipped).toBe(3);
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
