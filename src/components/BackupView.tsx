import { useId, useState, type ChangeEvent } from 'react';
import {
  backupFileName,
  createBackupText,
  readBackup,
  type BackupContents,
} from '../domain/backup';
import { formatDate } from '../domain/dates';
import { formatRank } from '../domain/rank';
import type { AppData } from '../domain/types';
import { canShareFiles, downloadTextFile, readFileText, shareTextFile } from '../state/files';
import { loadLastBackup, saveLastBackup } from '../state/storage';

interface Props {
  data: AppData;
  today: string;
  onRestore(data: AppData): void;
}

interface PendingRestore {
  fileName: string;
  contents: BackupContents;
}

function count(amount: number, noun: string): string {
  return `${amount} ${noun}${amount === 1 ? '' : 's'}`;
}

function describe(data: AppData): string {
  return [
    data.rank ? formatRank(data.rank) : 'No rank set',
    count(data.promotions.length, 'promotion'),
    count(data.sessions.length, 'session'),
    count(data.competitions.length, 'competition'),
  ].join(' · ');
}

function isEmpty(data: AppData): boolean {
  return (
    data.rank === null &&
    data.promotions.length === 0 &&
    data.sessions.length === 0 &&
    data.competitions.length === 0 &&
    data.weeklyGoal === null
  );
}

export function BackupView({ data, today, onRestore }: Props) {
  const fileInputId = useId();
  const [shareable] = useState(canShareFiles);
  const [lastBackup, setLastBackup] = useState(loadLastBackup);
  const [pending, setPending] = useState<PendingRestore | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const nothingToBackUp = isEmpty(data);

  const markBackedUp = () => {
    saveLastBackup(today);
    setLastBackup(today);
  };

  const download = () => {
    downloadTextFile(backupFileName(), createBackupText(data));
    markBackedUp();
  };

  const share = async () => {
    const shared = await shareTextFile(backupFileName(), createBackupText(data), 'BJJ Belt Tracker backup');
    if (shared) markBackedUp();
  };

  const chooseFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;
    setStatus(null);
    try {
      const result = readBackup(await readFileText(file), today);
      setError(result.ok ? null : result.error);
      setPending(result.ok ? { fileName: file.name, contents: result.value } : null);
    } catch {
      setError("That file couldn't be read.");
      setPending(null);
    }
    // Clear the picker so choosing the same file again still fires a change.
    input.value = '';
  };

  const restore = () => {
    if (!pending) return;
    const restored = pending.contents.data;
    onRestore(restored);
    // The data now matches a file saved on that day, so that is when it was last backed up.
    const { exportedOn } = pending.contents;
    if (exportedOn) {
      saveLastBackup(exportedOn);
      setLastBackup(exportedOn);
    }
    setPending(null);
    setStatus(
      `Restored ${count(restored.promotions.length, 'promotion')}, ${count(restored.sessions.length, 'session')} and ${count(restored.competitions.length, 'competition')}.`,
    );
  };

  return (
    <>
      <section className="card" aria-labelledby="backup-heading">
        <h2 id="backup-heading">Back up</h2>
        <p className="muted">
          Your history is stored only in this browser on this device. Save a backup file somewhere
          safe, such as your cloud drive or an email to yourself.
        </p>
        <p>
          <strong>On this device:</strong> {describe(data)}
        </p>
        <div className="actions">
          <button
            type="button"
            className="button button--primary"
            disabled={nothingToBackUp}
            onClick={download}
          >
            Download backup
          </button>
          {shareable && (
            <button type="button" className="button" disabled={nothingToBackUp} onClick={share}>
              Share backup
            </button>
          )}
        </div>
        <p className="muted">
          {nothingToBackUp
            ? 'There is nothing to back up yet.'
            : lastBackup
              ? `Last backup: ${formatDate(lastBackup)}`
              : 'No backup has been made from this device yet.'}
        </p>
      </section>

      <section className="card" aria-labelledby="restore-heading">
        <h2 id="restore-heading">Restore</h2>
        <p className="muted">
          Choose a backup file to load it onto this device. You will see what it contains before
          anything changes.
        </p>
        <div className="field">
          <label htmlFor={fileInputId}>Backup file</label>
          <input
            id={fileInputId}
            type="file"
            accept=".json,application/json"
            onChange={chooseFile}
          />
        </div>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        {pending && (
          <div className="confirm" role="group" aria-label="Confirm restore">
            <p>
              <strong>{pending.fileName}</strong>
              {pending.contents.exportedOn && `, saved ${formatDate(pending.contents.exportedOn)}`}
            </p>
            <p>
              <strong>In the backup:</strong> {describe(pending.contents.data)}
            </p>
            {pending.contents.skipped > 0 && (
              <p className="notice">
                {count(pending.contents.skipped, 'record')} in the file couldn't be read and will
                be left out.
              </p>
            )}
            <p className={nothingToBackUp ? 'muted' : 'error'}>
              {nothingToBackUp
                ? 'This device has no data yet, so nothing will be overwritten.'
                : `Restoring replaces everything on this device now: ${describe(data)}.`}
            </p>
            <div className="actions">
              <button type="button" className="button button--danger" onClick={restore}>
                Restore this backup
              </button>
              <button type="button" className="button" onClick={() => setPending(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}

        <p className="saved" role="status">
          {status}
        </p>
      </section>
    </>
  );
}
