import { useId, useState, type ChangeEvent } from 'react';
import {
  backupFileName,
  createBackupText,
  readBackup,
  type BackupContents,
} from '../domain/backup';
import { formatDate } from '../domain/dates';
import {
  changesAnything,
  describeAdded,
  mergeData,
  MAX_MATCHES_NOTE,
  totalAdded,
  type Merged,
} from '../domain/merge';
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
    count(data.techniques.length, 'technique'),
    // Left out when there is none, as most people have none to speak of.
    ...(data.timeOff.length > 0
      ? [`${data.timeOff.length} ${data.timeOff.length === 1 ? 'period' : 'periods'} of time off`]
      : []),
  ].join(' · ');
}

/** What adding the file brings: the records, then a raised rank or a goal taken from it. */
function describeMerge(merged: Merged): string {
  const parts = [
    totalAdded(merged.added) > 0 ? describeAdded(merged.added) : '',
    merged.rankRaisedTo ? `your rank moves up to ${formatRank(merged.rankRaisedTo)}` : '',
    merged.goalSetTo !== null ? `your weekly goal is set to ${merged.goalSetTo}` : '',
  ].filter(Boolean);
  return parts.join('; ');
}

function isEmpty(data: AppData): boolean {
  return (
    data.rank === null &&
    data.promotions.length === 0 &&
    data.sessions.length === 0 &&
    data.competitions.length === 0 &&
    data.techniques.length === 0 &&
    data.timeOff.length === 0 &&
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

  // What adding the file to this device would do, worked out before anything is offered.
  const merge = pending && !nothingToBackUp ? mergeData(data, pending.contents.data, today) : null;

  const add = () => {
    if (!merge?.ok) return;
    onRestore(merge.value.data);
    // The device now holds more than the file does, so this is not a backup of it.
    setPending(null);
    const added = describeAdded(merge.value.added);
    setStatus(added ? `Added ${added}.` : 'Updated this device from the backup.');
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
      `Restored ${count(restored.promotions.length, 'promotion')}, ${count(restored.sessions.length, 'session')}, ${count(restored.competitions.length, 'competition')} and ${count(restored.techniques.length, 'technique')}.`,
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
          anything changes, and can add it to what is here or replace what is here with it.
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
            {nothingToBackUp && (
              <p className="muted">This device has no data yet, so nothing will be overwritten.</p>
            )}
            {merge?.ok && changesAnything(merge.value) && (
              <p>
                <strong>Add to this device</strong> keeps everything here and adds what is
                missing: {describeMerge(merge.value)}.
                {merge.value.alreadyHere > 0 &&
                  ` ${count(merge.value.alreadyHere, 'record')} already here ${
                    merge.value.alreadyHere === 1 ? 'stays' : 'stay'
                  } as this device has ${merge.value.alreadyHere === 1 ? 'it' : 'them'}.`}
              </p>
            )}
            {merge?.ok && !changesAnything(merge.value) && merge.value.matchesLeftOut === 0 && (
              <p className="muted">
                Everything in this backup is already on this device, so there is nothing to add.
              </p>
            )}
            {merge?.ok && merge.value.matchesLeftOut > 0 && (
              <p className="notice">
                {merge.value.matchesLeftOut}{' '}
                {merge.value.matchesLeftOut === 1 ? 'match' : 'matches'} in the backup can't be
                added: {MAX_MATCHES_NOTE}
              </p>
            )}
            {merge && !merge.ok && (
              <p className="notice">This backup can't be added to this device. {merge.error}</p>
            )}
            {!nothingToBackUp && (
              <p className="error">
                <strong>Replace everything</strong> removes what is on this device now:{' '}
                {describe(data)}.
              </p>
            )}
            <div className="actions">
              {merge?.ok && changesAnything(merge.value) && (
                <button type="button" className="button button--primary" onClick={add}>
                  Add to this device
                </button>
              )}
              <button type="button" className="button button--danger" onClick={restore}>
                {nothingToBackUp ? 'Restore this backup' : 'Replace everything'}
              </button>
              <button type="button" className="button" onClick={() => setPending(null)}>
                Cancel
              </button>
            </div>
            {merge?.ok && changesAnything(merge.value) && (
              <p className="hint">
                Adding never removes a record or changes one that is here. A record you changed on
                the other device keeps this device's version, and one you deleted here comes back
                if the backup still has it.
              </p>
            )}
          </div>
        )}

        <p className="saved" role="status">
          {status}
        </p>
      </section>
    </>
  );
}
