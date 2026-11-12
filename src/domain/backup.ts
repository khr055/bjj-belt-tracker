import { daysBetween, todayIso } from './dates';
import { parseDataWithReport } from './parse';
import { findHistoryConflict } from './promotions';
import type { AppData, Result } from './types';

export const BACKUP_FORMAT = 'bjj-belt-tracker-backup';
/**
 * Version 2 added session notes, the weekly goal and competitions. Version 3 added techniques.
 * Version 4 added the day each technique reached its stage. Version 5 added the kind of session,
 * rounds rolled and the techniques landed in rolling. Version 6 added time off, black belt degrees
 * above the 4th, and competition wins linked to a journal technique. Version 7 added what a
 * session's rolling was caught with, and a web link on a technique. Older files still restore.
 */
export const BACKUP_VERSION = 7;

const NOT_A_BACKUP = "That file isn't a Belt Tracker backup.";

export function backupFileName(now: Date = new Date()): string {
  return `bjj-belt-tracker-backup-${todayIso(now)}.json`;
}

/** The contents of a backup file: everything the app stores, plus when it was saved. */
export function createBackupText(data: AppData, now: Date = new Date()): string {
  return JSON.stringify(
    { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now.toISOString(), data },
    null,
    2,
  );
}

export interface BackupContents {
  data: AppData;
  /** Local calendar day the backup was saved, when the file says. */
  exportedOn: string | null;
  /** Records in the file that were malformed or duplicated, and so left out. */
  skipped: number;
}

/** A reminder appears this many days after the last backup, or after it was put off. */
export const BACKUP_REMINDER_DAYS = 30;
/** Someone who has never backed up is reminded once they have this much to lose. */
export const BACKUP_REMINDER_MIN_RECORDS = 10;

export type BackupReminder = { kind: 'never' } | { kind: 'overdue'; days: number };

/**
 * Whether to suggest a backup. `lastBackup` is the day the data on this device was last saved to
 * a file; `snoozedOn` is the day the reminder was last put off.
 */
export function backupReminder(
  data: AppData,
  lastBackup: string | null,
  snoozedOn: string | null,
  today: string,
): BackupReminder | null {
  const records =
    data.promotions.length +
    data.sessions.length +
    data.competitions.length +
    data.techniques.length +
    data.timeOff.length;
  if (records === 0) return null;
  if (snoozedOn !== null && daysBetween(snoozedOn, today) < BACKUP_REMINDER_DAYS) return null;
  if (lastBackup === null) {
    return records >= BACKUP_REMINDER_MIN_RECORDS ? { kind: 'never' } : null;
  }
  const days = daysBetween(lastBackup, today);
  return days >= BACKUP_REMINDER_DAYS ? { kind: 'overdue', days } : null;
}

/** Reads a backup file, refusing anything that isn't one or whose history can't be right. */
export function readBackup(text: string, today: string): Result<BackupContents> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: NOT_A_BACKUP };
  }
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: NOT_A_BACKUP };

  const file = raw as Record<string, unknown>;
  if (file.format !== BACKUP_FORMAT || typeof file.version !== 'number') {
    return { ok: false, error: NOT_A_BACKUP };
  }
  if (file.version > BACKUP_VERSION) {
    return {
      ok: false,
      error: 'That backup was made by a newer version of the app. Update the app and try again.',
    };
  }

  const { data, skipped } = parseDataWithReport(file.data);
  const conflict = findHistoryConflict(data.promotions, today);
  if (conflict) {
    return { ok: false, error: `That backup's promotion history doesn't add up: ${conflict}` };
  }

  const exportedAt = typeof file.exportedAt === 'string' ? Date.parse(file.exportedAt) : Number.NaN;
  return {
    ok: true,
    value: {
      data,
      exportedOn: Number.isNaN(exportedAt) ? null : todayIso(new Date(exportedAt)),
      skipped,
    },
  };
}
