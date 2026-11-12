import { isIsoDate } from '../domain/dates';
import { parseData } from '../domain/parse';
import { emptyData, type AppData } from '../domain/types';

export const STORAGE_KEY = 'bjj-belt-tracker:v1';
export const LAST_BACKUP_KEY = 'bjj-belt-tracker:last-backup';
export const BACKUP_SNOOZE_KEY = 'bjj-belt-tracker:backup-snooze';

export function loadData(): AppData {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored ? parseData(JSON.parse(stored)) : emptyData();
  } catch {
    return emptyData();
  }
}

/** Returns false when the browser refused the write (private mode, quota). */
export function saveData(data: AppData): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

function loadDate(key: string): string | null {
  try {
    const stored = window.localStorage.getItem(key);
    return isIsoDate(stored) ? stored : null;
  } catch {
    return null;
  }
}

function saveDate(key: string, date: string): void {
  try {
    window.localStorage.setItem(key, date);
  } catch {
    // Only the reminder is affected; the data and any backup file are not.
  }
}

/** The day the data on this device was last saved to a backup file, if ever. */
export function loadLastBackup(): string | null {
  return loadDate(LAST_BACKUP_KEY);
}

export function saveLastBackup(date: string): void {
  saveDate(LAST_BACKUP_KEY, date);
}

/** The day the backup reminder was last put off, if ever. */
export function loadBackupSnooze(): string | null {
  return loadDate(BACKUP_SNOOZE_KEY);
}

export function saveBackupSnooze(date: string): void {
  saveDate(BACKUP_SNOOZE_KEY, date);
}
