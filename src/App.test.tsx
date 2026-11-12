import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App from './App';
import { createBackupText, readBackup } from './domain/backup';
import { addDays, formatShortDate, todayIso, weekStart } from './domain/dates';
import type { AppData } from './domain/types';
import { downloadTextFile } from './state/files';
import { STORAGE_KEY } from './state/storage';

// jsdom has no downloads or share sheet; capture what would have been saved instead.
vi.mock('./state/files', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./state/files')>()),
  downloadTextFile: vi.fn(),
  canShareFiles: () => false,
}));

function seed(data: AppData) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function stored(): AppData {
  return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null');
}

describe('App', () => {
  it('sets the current rank, keeps it across reloads and lets it be edited', async () => {
    const user = userEvent.setup();
    const first = render(<App />);

    expect(screen.getByRole('heading', { name: 'Set your current rank' })).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Blue' }));
    await user.click(screen.getByRole('radio', { name: '2 stripes' }));
    await user.click(screen.getByRole('button', { name: 'Save rank' }));
    expect(screen.getByRole('heading', { name: 'Blue belt, 2 stripes' })).toBeInTheDocument();

    first.unmount();
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Blue belt, 2 stripes' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Edit rank' }));
    await user.click(screen.getByRole('radio', { name: '3 stripes' }));
    await user.click(screen.getByRole('button', { name: 'Save rank' }));
    expect(screen.getByRole('heading', { name: 'Blue belt, 3 stripes' })).toBeInTheDocument();
  });

  it('logs a promotion, shows it on the timeline and updates the current rank', async () => {
    seed({ rank: { belt: 'white', stripes: 4 }, promotions: [], sessions: [] });
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Timeline' }));
    await user.click(screen.getByRole('button', { name: 'Log promotion' }));
    const form = screen.getByRole('form', { name: 'Log promotion' });
    await user.click(within(form).getByRole('radio', { name: 'Blue' }));
    await user.click(within(form).getByRole('radio', { name: '0 stripes' }));
    fireEvent.change(within(form).getByLabelText('Promotion date'), {
      target: { value: '2024-06-01' },
    });
    await user.type(within(form).getByLabelText(/Promoted by/), 'Professor Silva');
    await user.click(within(form).getByRole('button', { name: 'Save promotion' }));

    const promotions = screen.getByRole('region', { name: 'Promotions' });
    expect(within(promotions).getByText('Blue belt')).toBeInTheDocument();
    expect(within(promotions).getByText('1 Jun 2024')).toBeInTheDocument();
    expect(within(promotions).getByText('Promoted by Professor Silva')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Time at each belt' })).toHaveTextContent('so far');

    await user.click(screen.getByRole('button', { name: 'Overview' }));
    expect(screen.getByRole('heading', { name: 'Blue belt' })).toBeInTheDocument();
  });

  it('rejects an out-of-order promotion and leaves the history unchanged', async () => {
    seed({
      rank: { belt: 'blue', stripes: 0 },
      promotions: [{ id: 'blue', belt: 'blue', stripes: 0, date: '2024-06-01' }],
      sessions: [],
    });
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Timeline' }));
    await user.click(screen.getByRole('button', { name: 'Log promotion' }));
    const form = screen.getByRole('form', { name: 'Log promotion' });
    await user.click(within(form).getByRole('radio', { name: 'Purple' }));
    await user.click(within(form).getByRole('radio', { name: '0 stripes' }));
    fireEvent.change(within(form).getByLabelText('Promotion date'), {
      target: { value: '2024-01-01' },
    });
    await user.click(within(form).getByRole('button', { name: 'Save promotion' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      "Purple belt can't be dated before Blue belt (1 Jun 2024).",
    );
    expect(stored().promotions).toHaveLength(1);
  });

  it('logs sessions and recalculates mat time since the last promotion', async () => {
    seed({
      rank: { belt: 'blue', stripes: 0 },
      promotions: [{ id: 'blue', belt: 'blue', stripes: 0, date: '2024-06-01' }],
      sessions: [{ id: 'old', date: '2024-05-01', durationMinutes: 60, type: 'gi' }],
    });
    const user = userEvent.setup();
    render(<App />);

    const since = screen.getByRole('group', { name: 'Since last promotion' });
    const allTime = screen.getByRole('group', { name: 'All time' });
    expect(since).toHaveTextContent('0 sessions');
    expect(allTime).toHaveTextContent('1 session');

    // Date defaults to today, duration and type to the last session; one preset tap and submit.
    await user.click(screen.getByRole('button', { name: '90 min' }));
    await user.click(screen.getByRole('button', { name: 'Log session' }));

    expect(since).toHaveTextContent('1 session');
    expect(since).toHaveTextContent('1.5 hours');
    expect(allTime).toHaveTextContent('2 sessions');
    expect(screen.getByRole('status')).toHaveTextContent('Logged 90 min Gi session.');
    expect(stored().sessions).toHaveLength(2);
  });

  it('edits and deletes a session from the training tab', async () => {
    seed({
      rank: { belt: 'blue', stripes: 0 },
      promotions: [],
      sessions: [{ id: 's1', date: '2024-05-01', durationMinutes: 60, type: 'gi' }],
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Training' }));

    await user.click(screen.getByRole('button', { name: 'Edit Gi session on 1 May 2024' }));
    const form = screen.getByRole('form', { name: 'Edit session' });
    await user.click(within(form).getByRole('radio', { name: 'No-gi' }));
    await user.click(within(form).getByRole('button', { name: 'Save changes' }));
    expect(stored().sessions[0]).toMatchObject({ type: 'nogi', durationMinutes: 60 });

    await user.click(screen.getByRole('button', { name: 'Delete No-gi session on 1 May 2024' }));
    await user.click(
      screen.getByRole('button', { name: 'Confirm delete No-gi session on 1 May 2024' }),
    );
    expect(screen.getByText('No sessions logged yet.')).toBeInTheDocument();
    expect(stored().sessions).toEqual([]);
  });
});

describe('Training trends', () => {
  it('shows the streak, weekly average and sessions per week', async () => {
    const thisWeek = weekStart(todayIso());
    seed({
      rank: { belt: 'blue', stripes: 0 },
      promotions: [],
      sessions: [
        { id: 's1', date: thisWeek, durationMinutes: 60, type: 'gi' },
        { id: 's2', date: addDays(thisWeek, -7), durationMinutes: 90, type: 'gi' },
        { id: 's3', date: addDays(thisWeek, -14), durationMinutes: 60, type: 'nogi' },
        { id: 's4', date: addDays(thisWeek, -13), durationMinutes: 60, type: 'gi' },
      ],
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Training' }));

    const streak = screen.getByRole('group', { name: 'Current streak' });
    expect(streak).toHaveTextContent('3 weeks');
    expect(streak).toHaveTextContent('Including this week');

    const average = screen.getByRole('group', { name: 'Weekly average' });
    expect(average).toHaveTextContent('1.5 sessions');
    expect(average).toHaveTextContent('Over the last 2 full weeks');

    const chart = screen.getByRole('group', { name: 'Sessions per week, last 8 weeks' });
    const bars = within(chart).getAllByRole('img');
    expect(bars).toHaveLength(8);
    expect(bars[7]).toHaveAccessibleName(
      `This week (from ${formatShortDate(thisWeek)}): 1 session, 1 hours`,
    );
    expect(bars[5]).toHaveAccessibleName(
      `Week of ${formatShortDate(addDays(thisWeek, -14))}: 2 sessions, 2 hours`,
    );
    expect(bars[0]).toHaveAccessibleName(
      `Week of ${formatShortDate(addDays(thisWeek, -49))}: 0 sessions, 0 hours`,
    );

    // The same figures are available as a table.
    const rows = within(screen.getByRole('table')).getAllByRole('row');
    expect(rows).toHaveLength(9);
    expect(rows[8]).toHaveTextContent(`${formatShortDate(thisWeek)} (this week)`);
  });

  it('invites logging when there are no sessions yet', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Training' }));
    expect(screen.getByRole('region', { name: 'Training trends' })).toHaveTextContent(
      'Log a few sessions to see your weekly trend and streak.',
    );
  });
});

describe('Time in grade', () => {
  it('shows when the IBJJF minimum at the current belt was met', () => {
    seed({
      rank: { belt: 'blue', stripes: 2 },
      promotions: [{ id: 'blue', belt: 'blue', stripes: 0, date: '2020-01-01' }],
      sessions: [],
    });
    render(<App />);

    const card = screen.getByRole('region', { name: 'Time in grade' });
    expect(card).toHaveTextContent('Minimum met.');
    expect(card).toHaveTextContent('IBJJF requires 2 years, which you reached on 1 Jan 2022.');
    expect(within(card).getByRole('progressbar')).toHaveValue(100);
  });

  it('asks for the belt promotion when the current belt has no logged date', () => {
    seed({ rank: { belt: 'purple', stripes: 0 }, promotions: [], sessions: [] });
    render(<App />);

    expect(screen.getByRole('region', { name: 'Time in grade' })).toHaveTextContent(
      'IBJJF requires 18 months at purple belt. Log your promotion to purple belt',
    );
  });

  it('says there is no minimum at white belt and stays hidden until a rank is set', () => {
    const first = render(<App />);
    expect(screen.queryByRole('region', { name: 'Time in grade' })).not.toBeInTheDocument();
    first.unmount();

    seed({ rank: { belt: 'white', stripes: 1 }, promotions: [], sessions: [] });
    render(<App />);
    expect(screen.getByRole('region', { name: 'Time in grade' })).toHaveTextContent(
      'IBJJF sets no minimum time at white belt before blue belt.',
    );
  });
});

describe('Backup and restore', () => {
  const HISTORY: AppData = {
    rank: { belt: 'blue', stripes: 1 },
    promotions: [
      { id: 'p1', belt: 'blue', stripes: 0, date: '2024-06-01' },
      { id: 'p2', belt: 'blue', stripes: 1, date: '2025-02-01' },
    ],
    sessions: [{ id: 's1', date: '2025-03-01', durationMinutes: 90, type: 'gi' }],
  };

  function backupFile(data: AppData, name = 'backup.json'): File {
    return new File([createBackupText(data)], name, { type: 'application/json' });
  }

  it('downloads a backup that restores to the same data', async () => {
    seed(HISTORY);
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Backup' }));

    expect(screen.getByText('No backup has been made from this device yet.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Download backup' }));

    const [name, text] = vi.mocked(downloadTextFile).mock.calls.at(-1)!;
    expect(name).toMatch(/^bjj-belt-tracker-backup-\d{4}-\d{2}-\d{2}\.json$/);
    const restored = readBackup(text, '2026-11-11');
    expect(restored.ok && restored.value.data).toEqual(HISTORY);
    expect(screen.getByText(/^Last backup from this device: /)).toBeInTheDocument();
  });

  it('has nothing to download before any data exists', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Backup' }));
    expect(screen.getByRole('button', { name: 'Download backup' })).toBeDisabled();
  });

  it('shows what a backup contains and only replaces data once confirmed', async () => {
    const existing: AppData = {
      rank: { belt: 'white', stripes: 2 },
      promotions: [],
      sessions: [{ id: 'old', date: '2023-01-01', durationMinutes: 60, type: 'gi' }],
    };
    seed(existing);
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Backup' }));

    await user.upload(screen.getByLabelText('Backup file'), backupFile(HISTORY));
    const confirm = await screen.findByRole('group', { name: 'Confirm restore' });
    expect(confirm).toHaveTextContent('In the backup: Blue belt, 1 stripe · 2 promotions · 1 session');
    expect(confirm).toHaveTextContent(
      'Restoring replaces everything on this device now: White belt, 2 stripes · 0 promotions · 1 session.',
    );
    expect(stored()).toEqual(existing);

    await user.click(within(confirm).getByRole('button', { name: 'Restore this backup' }));
    expect(stored()).toEqual(HISTORY);
    expect(screen.getByRole('status')).toHaveTextContent('Restored 2 promotions and 1 session.');

    await user.click(screen.getByRole('button', { name: 'Overview' }));
    expect(screen.getByRole('heading', { name: 'Blue belt, 1 stripe' })).toBeInTheDocument();
  });

  it('keeps the current data when the restore is cancelled', async () => {
    seed(HISTORY);
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Backup' }));

    const empty: AppData = { rank: null, promotions: [], sessions: [] };
    await user.upload(screen.getByLabelText('Backup file'), backupFile(empty));
    const confirm = await screen.findByRole('group', { name: 'Confirm restore' });
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('group', { name: 'Confirm restore' })).not.toBeInTheDocument();
    expect(stored()).toEqual(HISTORY);
  });

  it('refuses a file that is not a backup', async () => {
    seed(HISTORY);
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Backup' }));

    const notABackup = new File(['{"hello":"world"}'], 'notes.json', { type: 'application/json' });
    await user.upload(screen.getByLabelText('Backup file'), notABackup);

    expect(await screen.findByRole('alert')).toHaveTextContent("That file isn't a Belt Tracker backup.");
    expect(screen.queryByRole('group', { name: 'Confirm restore' })).not.toBeInTheDocument();
    expect(stored()).toEqual(HISTORY);
  });
});
