import { isIsoDate } from '../domain/dates';
import { parseData } from '../domain/parse';
import { emptyData, type AppData } from '../domain/types';

export const STORAGE_KEY = 'bjj-belt-tracker:v1';
export const LAST_BACKUP_KEY = 'bjj-belt-tracker:last-backup';

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

/** The day a backup file was last saved from this device, if ever. */
export function loadLastBackup(): string | null {
  try {
    const stored = window.localStorage.getItem(LAST_BACKUP_KEY);
    return isIsoDate(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function saveLastBackup(date: string): void {
  try {
    window.localStorage.setItem(LAST_BACKUP_KEY, date);
  } catch {
    // Only the reminder is lost; the backup file itself is unaffected.
  }
}
