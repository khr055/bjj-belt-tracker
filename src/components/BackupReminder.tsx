import { useState } from 'react';
import { backupReminder } from '../domain/backup';
import type { AppData } from '../domain/types';
import { loadBackupSnooze, loadLastBackup, saveBackupSnooze } from '../state/storage';

interface Props {
  data: AppData;
  today: string;
  /** Takes the practitioner to the place where a backup is made. */
  onBackUp(): void;
}

/** Suggests a backup when there is history on this device and no recent backup file. */
export function BackupReminder({ data, today, onBackUp }: Props) {
  const [lastBackup] = useState(loadLastBackup);
  const [snoozedOn, setSnoozedOn] = useState(loadBackupSnooze);
  const reminder = backupReminder(data, lastBackup, snoozedOn, today);

  if (!reminder) return null;

  const snooze = () => {
    saveBackupSnooze(today);
    setSnoozedOn(today);
  };

  return (
    <section className="notice notice--action" aria-label="Backup reminder">
      <p>
        {reminder.kind === 'never'
          ? 'Your history is stored only on this device and has never been backed up.'
          : `Your last backup was ${reminder.days} days ago. Anything logged since then is stored only on this device.`}
      </p>
      <div className="actions actions--tight">
        <button type="button" className="button button--small" onClick={onBackUp}>
          Back up now
        </button>
        <button type="button" className="button button--small" onClick={snooze}>
          Not now
        </button>
      </div>
    </section>
  );
}
