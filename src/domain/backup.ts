import { todayIso } from './dates';
import { parseDataWithReport } from './parse';
import { findHistoryConflict } from './promotions';
import type { AppData, Result } from './types';

export const BACKUP_FORMAT = 'bjj-belt-tracker-backup';
/** Version 2 added session notes, the weekly goal and competitions. Version 1 files still restore. */
export const BACKUP_VERSION = 2;

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
