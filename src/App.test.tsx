import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App from './App';
import { createBackupText, readBackup } from './domain/backup';
import { addDays, formatDate, formatShortDate, todayIso, weekStart } from './domain/dates';
import { emptyData, type AppData, type Session, type Technique } from './domain/types';
import { downloadTextFile } from './state/files';
import { BACKUP_SNOOZE_KEY, LAST_BACKUP_KEY, STORAGE_KEY } from './state/storage';

// jsdom has no downloads or share sheet; capture what would have been saved instead.
vi.mock('./state/files', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./state/files')>()),
  downloadTextFile: vi.fn(),
  canShareFiles: () => false,
}));

function seed(data: Partial<AppData>) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...emptyData(), ...data }));
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

describe('Training log', () => {
  it('logs a session with notes and finds it by type and by searching the notes', async () => {
    seed({
      sessions: [
        { id: 'old', date: '2024-05-01', durationMinutes: 60, type: 'nogi', notes: 'Leg locks' },
      ],
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Training' }));

    const form = screen.getByRole('form', { name: 'Log session' });
    await user.type(within(form).getByLabelText(/Notes/), 'Knee cut passing');
    await user.click(within(form).getByRole('button', { name: 'Log session' }));
    // The notes belong to the class just logged, so the next one starts blank.
    expect(within(form).getByLabelText(/Notes/)).toHaveValue('');
    expect(stored().sessions[1]).toMatchObject({ type: 'nogi', notes: 'Knee cut passing' });

    const list = screen.getByRole('region', { name: 'Sessions' });
    expect(within(list).getByText('Knee cut passing')).toBeInTheDocument();
    expect(within(list).getByText('Leg locks')).toBeInTheDocument();

    await user.type(within(list).getByLabelText('Search notes, kinds and techniques'), 'leg');
    expect(within(list).queryByText('Knee cut passing')).not.toBeInTheDocument();
    expect(within(list).getByText('Leg locks')).toBeInTheDocument();
    expect(within(list).getByRole('status')).toHaveTextContent('Found 1 of 2 sessions · 1 hours');

    // Both sessions are no-gi, so asking for gi leaves nothing.
    await user.click(within(list).getByRole('button', { name: 'Gi' }));
    expect(within(list).getByText('No sessions match.')).toBeInTheDocument();

    await user.click(within(list).getByRole('button', { name: 'Clear filters' }));
    expect(within(list).getByText('Knee cut passing')).toBeInTheDocument();
    expect(within(list).getByText('Leg locks')).toBeInTheDocument();
    expect(within(list).getByRole('status')).toBeEmptyDOMElement();
  });

  it('edits the notes on a session', async () => {
    seed({
      sessions: [{ id: 's1', date: '2024-05-01', durationMinutes: 60, type: 'gi', notes: 'Old' }],
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Training' }));

    await user.click(screen.getByRole('button', { name: 'Edit Gi session on 1 May 2024' }));
    const form = screen.getByRole('form', { name: 'Edit session' });
    await user.clear(within(form).getByLabelText(/Notes/));
    await user.click(within(form).getByRole('button', { name: 'Save changes' }));
    expect(stored().sessions[0]).toEqual({
      id: 's1',
      date: '2024-05-01',
      durationMinutes: 60,
      type: 'gi',
    });
  });

  it('sets a weekly goal and tracks this week against it', async () => {
    const thisWeek = weekStart(todayIso());
    seed({
      sessions: [
        { id: 's1', date: thisWeek, durationMinutes: 60, type: 'gi' },
        { id: 's2', date: addDays(thisWeek, -7), durationMinutes: 60, type: 'gi' },
        { id: 's3', date: addDays(thisWeek, -6), durationMinutes: 60, type: 'gi' },
      ],
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Training' }));
    expect(screen.queryByRole('group', { name: "This week's goal" })).not.toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: '2 sessions a week' }));
    const goal = screen.getByRole('group', { name: "This week's goal" });
    expect(goal).toHaveTextContent('1 of 2 sessions');
    expect(goal).toHaveTextContent('1 to go · Reached in 1 of the last 1 full week');
    expect(within(goal).getByRole('progressbar')).toHaveValue(1);
    expect(stored().weeklyGoal).toBe(2);
    expect(screen.getByRole('group', { name: 'Sessions per week, last 8 weeks' })).toHaveTextContent(
      'The dashed line is your goal of 2 a week.',
    );

    await user.click(screen.getByRole('button', { name: 'Overview' }));
    const week = screen.getByRole('group', { name: 'This week' });
    expect(week).toHaveTextContent('1 session');
    expect(week).toHaveTextContent('1 to go for your goal of 2');

    await user.click(screen.getByRole('button', { name: 'Training' }));
    await user.click(screen.getByRole('radio', { name: 'No goal' }));
    expect(screen.queryByRole('group', { name: "This week's goal" })).not.toBeInTheDocument();
    expect(stored().weeklyGoal).toBeNull();
  });
});

describe('Competitions', () => {
  it('logs a competition and its matches and shows the record', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.queryByRole('region', { name: 'Competition record' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Compete' }));
    expect(screen.getByText(/No competitions logged yet/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Log competition' }));
    const form = screen.getByRole('form', { name: 'Log competition' });
    await user.type(within(form).getByLabelText('Competition name'), 'Autumn Open');
    fireEvent.change(within(form).getByLabelText('Competition date'), {
      target: { value: '2024-10-19' },
    });
    await user.type(within(form).getByLabelText(/Division/), 'Adult, blue belt');
    await user.click(within(form).getByRole('radio', { name: 'Gold' }));
    await user.click(within(form).getByRole('button', { name: 'Save competition' }));

    const list = screen.getByRole('region', { name: 'Competitions' });
    expect(list).toHaveTextContent('19 Oct 2024 · Gi · Adult, blue belt · Gold medal');
    expect(list).toHaveTextContent('No matches yet');

    // A new match has nothing chosen, so a result is never recorded by accident.
    await user.click(screen.getByRole('button', { name: 'Add match to Autumn Open' }));
    let matchForm = screen.getByRole('form', { name: 'Add match' });
    await user.click(within(matchForm).getByRole('button', { name: 'Save match' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Choose win, loss or draw.');
    await user.click(within(matchForm).getByRole('radio', { name: 'Win' }));
    await user.click(within(matchForm).getByRole('button', { name: 'Save match' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Choose how the match was decided.');
    await user.click(within(matchForm).getByRole('radio', { name: 'Submission' }));
    await user.type(within(matchForm).getByRole('textbox', { name: /Submission/ }), 'Armbar');
    await user.type(within(matchForm).getByRole('textbox', { name: /Opponent/ }), 'A. Rival');
    await user.click(within(matchForm).getByRole('button', { name: 'Save match' }));

    await user.click(screen.getByRole('button', { name: 'Add match to Autumn Open' }));
    matchForm = screen.getByRole('form', { name: 'Add match' });
    await user.click(within(matchForm).getByRole('radio', { name: 'Loss' }));
    await user.click(within(matchForm).getByRole('radio', { name: 'Points' }));
    await user.click(within(matchForm).getByRole('button', { name: 'Save match' }));

    const matches = screen.getByRole('list', { name: 'Matches at Autumn Open' });
    const rows = within(matches).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Win by submission (Armbar)');
    expect(rows[0]).toHaveTextContent('vs A. Rival');
    expect(rows[1]).toHaveTextContent('Loss on points');
    expect(list).toHaveTextContent('1 win · 1 loss');

    const record = screen.getByRole('region', { name: 'Competition record' });
    const figures = within(record).getByRole('group', { name: 'Match record' });
    expect(figures).toHaveTextContent('1 win·1 loss');
    expect(figures).toHaveTextContent('2 matches across 1 competition');
    expect(record).toHaveTextContent('Wins1 by submission');
    expect(record).toHaveTextContent('Losses1 on points');
    expect(record).toHaveTextContent('Medals1 gold');

    await user.click(screen.getByRole('button', { name: 'Overview' }));
    expect(screen.getByRole('region', { name: 'Competition record' })).toHaveTextContent(
      '2 matches across 1 competition',
    );
  });

  it('edits and deletes matches and competitions', async () => {
    seed({
      competitions: [
        {
          id: 'c1',
          date: '2024-10-19',
          name: 'Autumn Open',
          type: 'gi',
          matches: [{ id: 'm1', result: 'win', method: 'points' }],
        },
      ],
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Compete' }));

    await user.click(screen.getByRole('button', { name: 'Edit match 1 at Autumn Open' }));
    let matchForm = screen.getByRole('form', { name: 'Edit match' });
    expect(within(matchForm).getByRole('radio', { name: 'Points' })).toBeChecked();
    await user.click(within(matchForm).getByRole('radio', { name: 'Draw' }));
    expect(within(matchForm).queryByRole('group', { name: 'Decided by' })).not.toBeInTheDocument();
    await user.click(within(matchForm).getByRole('button', { name: 'Save changes' }));
    expect(stored().competitions[0].matches).toEqual([{ id: 'm1', result: 'draw' }]);

    await user.click(screen.getByRole('button', { name: 'Edit match 1 at Autumn Open' }));
    matchForm = screen.getByRole('form', { name: 'Edit match' });
    await user.click(within(matchForm).getByRole('button', { name: 'Delete match 1 at Autumn Open' }));
    await user.click(
      within(matchForm).getByRole('button', { name: 'Confirm delete match 1 at Autumn Open' }),
    );
    expect(stored().competitions[0].matches).toEqual([]);
    expect(screen.queryByRole('form', { name: 'Edit match' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Edit Autumn Open' }));
    const form = screen.getByRole('form', { name: 'Edit competition' });
    await user.clear(within(form).getByLabelText('Competition name'));
    await user.type(within(form).getByLabelText('Competition name'), 'Winter Open');
    await user.click(within(form).getByRole('button', { name: 'Save changes' }));
    expect(stored().competitions[0]).toMatchObject({ id: 'c1', name: 'Winter Open' });

    await user.click(screen.getByRole('button', { name: 'Delete Winter Open' }));
    await user.click(screen.getByRole('button', { name: 'Confirm delete Winter Open' }));
    expect(stored().competitions).toEqual([]);
    expect(screen.getByText(/No competitions logged yet/)).toBeInTheDocument();
  });

  it('lists an upcoming competition with a countdown and no matches or medal', async () => {
    seed({
      competitions: [
        {
          id: 'c1',
          date: '2024-10-19',
          name: 'Autumn Open',
          type: 'gi',
          matches: [{ id: 'm1', result: 'win', method: 'points' }],
        },
      ],
    });
    const user = userEvent.setup();
    render(<App />);
    expect(screen.queryByRole('region', { name: 'Next competition' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Compete' }));

    await user.click(screen.getByRole('button', { name: 'Log competition' }));
    const form = screen.getByRole('form', { name: 'Log competition' });
    await user.type(within(form).getByLabelText('Competition name'), 'Winter Open');
    expect(within(form).getByRole('group', { name: 'Medal' })).toBeInTheDocument();
    fireEvent.change(within(form).getByLabelText('Competition date'), {
      target: { value: addDays(todayIso(), 12) },
    });
    expect(within(form).queryByRole('group', { name: 'Medal' })).not.toBeInTheDocument();
    await user.click(within(form).getByRole('button', { name: 'Save competition' }));

    const upcoming = screen.getByRole('list', { name: 'Upcoming' });
    expect(upcoming).toHaveTextContent('Winter Open');
    expect(upcoming).toHaveTextContent('In 12 days');
    expect(screen.queryByRole('button', { name: 'Add match to Winter Open' })).not.toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Past competitions' })).toHaveTextContent('Autumn Open');
    // The record counts only competitions that have taken place.
    expect(screen.getByRole('region', { name: 'Competition record' })).toHaveTextContent(
      '1 match across 1 competition',
    );

    await user.click(screen.getByRole('button', { name: 'Overview' }));
    const next = screen.getByRole('region', { name: 'Next competition' });
    expect(next).toHaveTextContent('In 12 days');
    expect(next).toHaveTextContent('Winter Open');
  });
});

describe('Technique journal', () => {
  const KNEE_CUT: Technique = {
    id: 't1',
    name: 'Knee cut pass',
    position: 'passing',
    status: 'drilling',
    addedOn: '2024-01-01', statusSince: '2024-01-01',
  };
  const TRIANGLE: Technique = {
    id: 't2',
    name: 'Triangle',
    position: 'guard',
    status: 'landing',
    addedOn: '2024-01-01', statusSince: '2024-01-01',
  };

  it('adds techniques, grouped by position, and filters them by stage', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.queryByRole('region', { name: 'Techniques' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Techniques' }));
    expect(screen.getByText(/No techniques yet/)).toBeInTheDocument();

    // A position has to be chosen; the stage starts at learning.
    await user.click(screen.getByRole('button', { name: 'Add technique' }));
    let form = screen.getByRole('form', { name: 'Add technique' });
    await user.type(within(form).getByLabelText('Technique name'), 'Knee cut pass');
    await user.click(within(form).getByRole('button', { name: 'Save technique' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a position.');
    await user.click(within(form).getByRole('radio', { name: 'Guard passing' }));
    expect(within(form).getByRole('radio', { name: 'Learning' })).toBeChecked();
    await user.type(within(form).getByLabelText(/Notes/), 'Head on the far side');
    await user.click(within(form).getByRole('button', { name: 'Save technique' }));

    await user.click(screen.getByRole('button', { name: 'Add technique' }));
    form = screen.getByRole('form', { name: 'Add technique' });
    await user.type(within(form).getByLabelText('Technique name'), 'knee cut pass');
    await user.click(within(form).getByRole('radio', { name: 'Guard' }));
    await user.click(within(form).getByRole('button', { name: 'Save technique' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'You already have a technique called Knee cut pass.',
    );
    await user.clear(within(form).getByLabelText('Technique name'));
    await user.type(within(form).getByLabelText('Technique name'), 'Triangle');
    await user.click(within(form).getByRole('radio', { name: 'Landing in rolling' }));
    await user.click(within(form).getByRole('button', { name: 'Save technique' }));

    expect(stored().techniques).toMatchObject([
      {
        name: 'Knee cut pass',
        position: 'passing',
        status: 'learning',
        notes: 'Head on the far side',
        addedOn: todayIso(),
      },
      { name: 'Triangle', position: 'guard', status: 'landing', addedOn: todayIso() },
    ]);

    const passing = screen.getByRole('list', { name: 'Guard passing' });
    expect(passing).toHaveTextContent('Knee cut pass');
    expect(passing).toHaveTextContent(`Learning since ${formatDate(todayIso())}`);
    expect(passing).toHaveTextContent('Not ticked on a session yet');
    expect(passing).toHaveTextContent('Head on the far side');
    expect(screen.getByRole('list', { name: 'Guard' })).toHaveTextContent('Triangle');

    const stages = screen.getByRole('group', { name: 'Show techniques' });
    expect(within(stages).getByRole('button', { name: 'All 2' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(within(stages).getByRole('button', { name: 'Landing in rolling 1' }));
    expect(screen.queryByRole('list', { name: 'Guard passing' })).not.toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Guard' })).toHaveTextContent('Triangle');
    await user.click(within(stages).getByRole('button', { name: 'Drilling 0' }));
    expect(screen.getByText('No techniques at this stage.')).toBeInTheDocument();
  });

  it('ticks techniques on a session and shows when each was last trained', async () => {
    seed({ techniques: [KNEE_CUT, TRIANGLE] });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Training' }));

    // The technique being worked on is offered first; the rest are a tap away.
    const form = screen.getByRole('form', { name: 'Log session' });
    const picker = within(form).getByRole('group', { name: /Techniques worked on/ });
    expect(within(picker).queryByRole('checkbox', { name: 'Triangle' })).not.toBeInTheDocument();
    await user.click(within(picker).getByRole('checkbox', { name: 'Knee cut pass' }));
    await user.click(within(picker).getByRole('button', { name: 'Show 1 more' }));
    await user.click(within(picker).getByRole('checkbox', { name: 'Triangle' }));
    await user.click(within(form).getByRole('button', { name: 'Log session' }));

    expect(stored().sessions[0].techniqueIds).toEqual(['t1', 't2']);
    // The ticks belong to the class just logged, so the next one starts clear.
    expect(within(picker).getByRole('checkbox', { name: 'Knee cut pass' })).not.toBeChecked();

    const list = screen.getByRole('region', { name: 'Sessions' });
    expect(list).toHaveTextContent('Worked on: Knee cut pass, Triangle');
    await user.type(within(list).getByLabelText('Search notes, kinds and techniques'), 'triangle');
    expect(within(list).getByRole('status')).toHaveTextContent('Found 1 of 1 session');
    await user.clear(within(list).getByLabelText('Search notes, kinds and techniques'));
    await user.type(within(list).getByLabelText('Search notes, kinds and techniques'), 'kimura');
    expect(within(list).getByText('No sessions match.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Techniques' }));
    expect(screen.getByRole('list', { name: 'Guard passing' })).toHaveTextContent(
      `Trained in 1 session · last on ${formatDate(todayIso())}`,
    );
  });

  it('unticks a technique when a session is edited', async () => {
    seed({
      techniques: [KNEE_CUT, TRIANGLE],
      sessions: [
        { id: 's1', date: '2024-05-01', durationMinutes: 60, type: 'gi', techniqueIds: ['t2', 't1'] },
      ],
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Training' }));

    await user.click(screen.getByRole('button', { name: 'Edit Gi session on 1 May 2024' }));
    const form = screen.getByRole('form', { name: 'Edit session' });
    // A ticked technique is shown even though it is no longer being worked on.
    const picker = within(form).getByRole('group', { name: /Techniques worked on/ });
    expect(within(picker).getByRole('checkbox', { name: 'Triangle' })).toBeChecked();
    await user.click(within(picker).getByRole('checkbox', { name: 'Triangle' }));
    await user.click(within(form).getByRole('button', { name: 'Save changes' }));
    expect(stored().sessions[0].techniqueIds).toEqual(['t1']);
  });

  it('edits a technique, and deleting one takes it off its sessions', async () => {
    seed({
      techniques: [KNEE_CUT, TRIANGLE],
      sessions: [
        { id: 's1', date: '2024-05-01', durationMinutes: 60, type: 'gi', techniqueIds: ['t1'] },
      ],
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Techniques' }));

    await user.click(screen.getByRole('button', { name: 'Edit Knee cut pass' }));
    const form = screen.getByRole('form', { name: 'Edit technique' });
    expect(within(form).getByRole('radio', { name: 'Guard passing' })).toBeChecked();
    await user.click(within(form).getByRole('radio', { name: 'Landing in rolling' }));
    await user.click(within(form).getByRole('button', { name: 'Save changes' }));
    expect(stored().techniques[0]).toEqual({
      ...KNEE_CUT,
      status: 'landing',
      statusSince: todayIso(),
    });

    await user.click(screen.getByRole('button', { name: 'Delete Knee cut pass' }));
    await user.click(screen.getByRole('button', { name: 'Confirm delete Knee cut pass' }));
    expect(stored().techniques).toEqual([TRIANGLE]);
    expect(stored().sessions).toEqual([
      { id: 's1', date: '2024-05-01', durationMinutes: 60, type: 'gi' },
    ]);
  });

  it('moves a technique to the next stage in one tap and dates the move', async () => {
    seed({
      techniques: [{ ...KNEE_CUT, status: 'learning' }],
      sessions: [
        { id: 's1', date: '2024-05-01', durationMinutes: 60, type: 'gi', techniqueIds: ['t1'] },
        { id: 's2', date: '2024-05-08', durationMinutes: 60, type: 'gi', techniqueIds: ['t1'] },
      ],
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Techniques' }));

    const list = screen.getByRole('list', { name: 'Guard passing' });
    expect(list).toHaveTextContent('Learning since 1 Jan 2024');
    await user.click(screen.getByRole('button', { name: 'Move Knee cut pass to drilling' }));
    expect(list).toHaveTextContent(`Drilling since ${formatDate(todayIso())}`);
    expect(stored().techniques[0]).toMatchObject({ status: 'drilling', statusSince: todayIso() });

    await user.click(
      screen.getByRole('button', { name: 'Move Knee cut pass to landing in rolling' }),
    );
    expect(list).toHaveTextContent(
      `Landing in rolling since ${formatDate(todayIso())} · after 2 sessions`,
    );
    // There is no stage beyond landing in rolling.
    expect(screen.queryByRole('button', { name: /^Move Knee cut pass/ })).not.toBeInTheDocument();
  });

  it('shows the sessions a technique was trained in', async () => {
    seed({
      techniques: [KNEE_CUT, TRIANGLE],
      sessions: [
        { id: 's1', date: '2024-05-01', durationMinutes: 60, type: 'gi', techniqueIds: ['t1'] },
        {
          id: 's2',
          date: '2024-05-08',
          durationMinutes: 90,
          type: 'nogi',
          techniqueIds: ['t1'],
          notes: 'Finished from headquarters',
        },
        { id: 's3', date: '2024-05-09', durationMinutes: 60, type: 'gi' },
      ],
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Techniques' }));

    const toggle = screen.getByRole('button', { name: 'Sessions for Knee cut pass' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const history = screen.getByRole('list', { name: 'Sessions for Knee cut pass' });
    const rows = within(history).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('8 May 2024 · No-gi · 90 min');
    expect(rows[0]).toHaveTextContent('Finished from headquarters');
    expect(rows[1]).toHaveTextContent('1 May 2024 · Gi · 60 min');

    await user.click(toggle);
    expect(screen.queryByRole('list', { name: 'Sessions for Knee cut pass' })).not.toBeInTheDocument();
    // A technique with no sessions has no history to open.
    expect(screen.queryByRole('button', { name: 'Sessions for Triangle' })).not.toBeInTheDocument();
  });

  it('shows what is being worked on and what has gone stale on the overview', () => {
    const today = todayIso();
    seed({
      techniques: [
        { ...KNEE_CUT, addedOn: addDays(today, -90), statusSince: addDays(today, -90) },
        { ...TRIANGLE, addedOn: addDays(today, -90), statusSince: addDays(today, -90) },
        { id: 't3', name: 'Armbar', position: 'guard', status: 'learning', addedOn: addDays(today, -90), statusSince: addDays(today, -90) },
      ],
      sessions: [
        { id: 's1', date: addDays(today, -2), durationMinutes: 60, type: 'gi', techniqueIds: ['t1'] },
        { id: 's2', date: addDays(today, -40), durationMinutes: 60, type: 'gi', techniqueIds: ['t3', 't2'] },
      ],
    });
    render(<App />);

    const card = screen.getByRole('region', { name: 'Techniques' });
    const workingOn = within(card).getByRole('group', { name: 'Working on' });
    expect(workingOn).toHaveTextContent('2 techniques');
    expect(workingOn).toHaveTextContent('1 learning · 1 drilling · 1 landing in rolling');
    expect(card).toHaveTextContent(`RecentKnee cut pass (${formatShortDate(addDays(today, -2))})`);
    expect(card).toHaveTextContent('StaleArmbar (40 days)');
    expect(card).toHaveTextContent('Stale means not trained for 30 days or more.');
  });
});

describe('Mat time on the timeline', () => {
  it('shows the sessions and hours logged at each belt and each rank', async () => {
    seed({
      rank: { belt: 'blue', stripes: 1 },
      promotions: [
        { id: 'start', belt: 'white', stripes: 0, date: '2022-01-10' },
        { id: 'blue', belt: 'blue', stripes: 0, date: '2024-06-01' },
        { id: 'blue-1', belt: 'blue', stripes: 1, date: '2025-02-01' },
      ],
      sessions: [
        { id: 's1', date: '2024-05-31', durationMinutes: 60, type: 'gi' },
        // A session on the day of a promotion counts towards the new rank.
        { id: 's2', date: '2024-06-01', durationMinutes: 90, type: 'gi' },
        { id: 's3', date: '2024-09-01', durationMinutes: 90, type: 'nogi' },
        { id: 's4', date: '2025-03-01', durationMinutes: 60, type: 'gi' },
      ],
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Timeline' }));

    const belts = within(screen.getByRole('region', { name: 'Time at each belt' })).getAllByRole(
      'listitem',
    );
    expect(belts[0]).toHaveTextContent('1 session · 1 hour');
    expect(belts[1]).toHaveTextContent('3 sessions · 4 hours');

    // Newest first.
    const ranks = within(screen.getByRole('region', { name: 'Promotions' })).getAllByRole(
      'listitem',
    );
    expect(ranks[0]).toHaveTextContent('1 session · 1 hour');
    expect(ranks[1]).toHaveTextContent('2 sessions · 3 hours');
    expect(ranks[2]).toHaveTextContent('1 session · 1 hour');
  });

  it('says nothing about mat time for a stretch with no sessions logged', async () => {
    seed({
      rank: { belt: 'blue', stripes: 0 },
      promotions: [
        { id: 'start', belt: 'white', stripes: 0, date: '2022-01-10' },
        { id: 'blue', belt: 'blue', stripes: 0, date: '2024-06-01' },
      ],
      sessions: [{ id: 's1', date: '2024-07-01', durationMinutes: 60, type: 'gi' }],
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Timeline' }));

    const [white, blue] = within(
      screen.getByRole('region', { name: 'Time at each belt' }),
    ).getAllByRole('listitem');
    expect(white).not.toHaveTextContent('session');
    expect(blue).toHaveTextContent('1 session · 1 hour');
  });
});

describe('Kinds of session and rounds', () => {
  it('logs the kind and the rounds rolled and shows them in the list and the totals', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Training' }));

    const form = screen.getByRole('form', { name: 'Log session' });
    // A first session is taken to be a class until told otherwise.
    expect(within(form).getByRole('radio', { name: 'Class' })).toBeChecked();
    await user.click(within(form).getByRole('radio', { name: 'Open mat' }));
    await user.type(within(form).getByLabelText(/Rounds rolled/), '6');
    await user.click(within(form).getByRole('button', { name: 'Log session' }));

    expect(stored().sessions[0]).toMatchObject({ kind: 'open-mat', rounds: 6 });
    // The kind carries over to the next session; the rounds belong to the one just logged.
    expect(within(form).getByRole('radio', { name: 'Open mat' })).toBeChecked();
    expect(within(form).getByLabelText(/Rounds rolled/)).toHaveValue(null);

    const list = screen.getByRole('region', { name: 'Sessions' });
    expect(list).toHaveTextContent('Gi · Open mat · 6 rounds');
    await user.type(within(list).getByLabelText('Search notes, kinds and techniques'), 'open mat');
    expect(within(list).getByRole('status')).toHaveTextContent('Found 1 of 1 session');

    await user.click(screen.getByRole('button', { name: 'Overview' }));
    expect(screen.getByRole('group', { name: 'This week' })).toHaveTextContent('6 rounds');
    expect(screen.getByRole('group', { name: 'All time' })).toHaveTextContent('6 rounds');
  });

  it('leaves rounds blank when none are entered, and refuses too many', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Training' }));

    const form = screen.getByRole('form', { name: 'Log session' });
    fireEvent.change(within(form).getByLabelText(/Rounds rolled/), { target: { value: '31' } });
    fireEvent.submit(form);
    expect(within(form).getByRole('alert')).toHaveTextContent('between 0 and 30 rounds');
    expect(stored()).toBeNull();

    fireEvent.change(within(form).getByLabelText(/Rounds rolled/), { target: { value: '' } });
    fireEvent.submit(form);
    expect(stored().sessions[0]).not.toHaveProperty('rounds');
    await user.click(screen.getByRole('button', { name: 'Overview' }));
    expect(screen.getByRole('group', { name: 'All time' })).not.toHaveTextContent('round');
  });

  it('keeps a session from before kinds were recorded without one until it is chosen', async () => {
    seed({ sessions: [{ id: 's1', date: '2024-05-01', durationMinutes: 60, type: 'gi' }] });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Training' }));

    await user.click(screen.getByRole('button', { name: 'Edit Gi session on 1 May 2024' }));
    let form = screen.getByRole('form', { name: 'Edit session' });
    for (const radio of within(within(form).getByRole('group', { name: 'Kind' })).getAllByRole(
      'radio',
    )) {
      expect(radio).not.toBeChecked();
    }
    await user.click(within(form).getByRole('button', { name: 'Save changes' }));
    expect(stored().sessions[0]).not.toHaveProperty('kind');

    await user.click(screen.getByRole('button', { name: 'Edit Gi session on 1 May 2024' }));
    form = screen.getByRole('form', { name: 'Edit session' });
    await user.click(within(form).getByRole('radio', { name: 'Drilling' }));
    await user.click(within(form).getByRole('button', { name: 'Save changes' }));
    expect(stored().sessions[0]).toMatchObject({ kind: 'drilling' });
  });
});

describe('Techniques landed in rolling', () => {
  const KNEE_CUT: Technique = {
    id: 't1',
    name: 'Knee cut pass',
    position: 'passing',
    status: 'drilling',
    addedOn: '2024-01-01',
    statusSince: '2024-01-01',
  };
  const TRIANGLE: Technique = {
    id: 't2',
    name: 'Triangle',
    position: 'guard',
    status: 'landing',
    addedOn: '2024-01-01',
    statusSince: '2024-01-01',
  };
  const ARMBAR: Technique = {
    id: 't3',
    name: 'Armbar',
    position: 'guard',
    status: 'learning',
    addedOn: '2024-01-01',
    statusSince: '2024-01-01',
  };

  it('marks techniques as landed on a session and shows the evidence on each technique', async () => {
    seed({ techniques: [KNEE_CUT, TRIANGLE, ARMBAR] });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Training' }));

    const form = screen.getByRole('form', { name: 'Log session' });
    const worked = within(form).getByRole('group', { name: /Techniques worked on/ });
    const landed = within(form).getByRole('group', { name: /Landed in rolling/ });
    // What already lands is offered first, then whatever is ticked as worked on today.
    expect(within(landed).getByRole('checkbox', { name: 'Triangle' })).toBeInTheDocument();
    expect(within(landed).queryByRole('checkbox', { name: 'Knee cut pass' })).not.toBeInTheDocument();
    await user.click(within(worked).getByRole('checkbox', { name: 'Knee cut pass' }));
    await user.click(within(landed).getByRole('checkbox', { name: 'Knee cut pass' }));
    await user.click(within(landed).getByRole('checkbox', { name: 'Triangle' }));
    await user.click(within(form).getByRole('button', { name: 'Log session' }));

    expect(stored().sessions[0]).toMatchObject({ techniqueIds: ['t1'], landedIds: ['t1', 't2'] });
    expect(within(landed).getByRole('checkbox', { name: 'Triangle' })).not.toBeChecked();

    const list = screen.getByRole('region', { name: 'Sessions' });
    expect(list).toHaveTextContent('Worked on: Knee cut pass');
    expect(list).toHaveTextContent('Landed: Knee cut pass, Triangle');

    await user.click(screen.getByRole('button', { name: 'Techniques' }));
    const today = formatDate(todayIso());
    const passing = screen.getByRole('list', { name: 'Guard passing' });
    expect(passing).toHaveTextContent(`Landed in rolling in 1 session · last on ${today}`);
    // Landing it counts as training it, even though it was not ticked as worked on.
    const guard = within(screen.getByRole('list', { name: 'Guard' })).getAllByRole('listitem');
    expect(guard[0]).toHaveTextContent('Armbar');
    expect(guard[0]).not.toHaveTextContent('Landed in rolling in');
    expect(guard[1]).toHaveTextContent(`Trained in 1 session · last on ${today}`);
    expect(guard[1]).toHaveTextContent(`Landed in rolling in 1 session · last on ${today}`);

    await user.click(screen.getByRole('button', { name: 'Sessions for Triangle' }));
    expect(screen.getByRole('list', { name: 'Sessions for Triangle' })).toHaveTextContent(
      '60 min · Landed',
    );
  });

  it('takes a technique off the landed list when a session is edited', async () => {
    seed({
      techniques: [KNEE_CUT, TRIANGLE],
      sessions: [
        {
          id: 's1',
          date: '2024-05-01',
          durationMinutes: 60,
          type: 'gi',
          techniqueIds: ['t1'],
          landedIds: ['t1', 't2'],
        },
      ],
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Training' }));

    await user.click(screen.getByRole('button', { name: 'Edit Gi session on 1 May 2024' }));
    const form = screen.getByRole('form', { name: 'Edit session' });
    const landed = within(form).getByRole('group', { name: /Landed in rolling/ });
    await user.click(within(landed).getByRole('checkbox', { name: 'Triangle' }));
    await user.click(within(form).getByRole('button', { name: 'Save changes' }));
    expect(stored().sessions[0]).toMatchObject({ techniqueIds: ['t1'], landedIds: ['t1'] });
  });
});

describe('Wins by a technique from the journal', () => {
  const TRIANGLE: Technique = {
    id: 't1',
    name: 'Triangle',
    position: 'guard',
    status: 'landing',
    addedOn: '2024-01-01',
    statusSince: '2024-01-01',
  };
  const OPEN = { id: 'c1', date: '2024-10-19', name: 'Autumn Open', type: 'gi' as const };

  it('picks the submission from the journal and shows the win on the technique', async () => {
    seed({ techniques: [TRIANGLE], competitions: [{ ...OPEN, matches: [] }] });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Compete' }));

    await user.click(screen.getByRole('button', { name: 'Add match to Autumn Open' }));
    const form = screen.getByRole('form', { name: 'Add match' });
    // The journal is offered only for a win by submission.
    await user.click(within(form).getByRole('radio', { name: 'Loss' }));
    await user.click(within(form).getByRole('radio', { name: 'Submission' }));
    expect(within(form).queryByRole('combobox')).not.toBeInTheDocument();
    await user.click(within(form).getByRole('radio', { name: 'Win' }));
    const picker = within(form).getByRole('combobox', { name: /Technique from your journal/ });
    expect(within(form).getByRole('textbox', { name: /Submission/ })).toBeInTheDocument();
    await user.selectOptions(picker, 'Triangle');
    // Choosing from the journal takes the place of typing the submission in.
    expect(within(form).queryByRole('textbox', { name: /Submission/ })).not.toBeInTheDocument();
    await user.click(within(form).getByRole('button', { name: 'Save match' }));

    expect(stored().competitions[0].matches[0]).toMatchObject({
      result: 'win',
      method: 'submission',
      techniqueId: 't1',
    });
    expect(screen.getByRole('list', { name: 'Matches at Autumn Open' })).toHaveTextContent(
      'Win by submission (Triangle)',
    );

    await user.click(screen.getByRole('button', { name: 'Techniques' }));
    expect(screen.getByRole('list', { name: 'Guard' })).toHaveTextContent(
      'Won 1 match in competition',
    );
  });

  it('keeps the name on the match when the technique is deleted', async () => {
    seed({
      techniques: [TRIANGLE],
      competitions: [
        { ...OPEN, matches: [{ id: 'm1', result: 'win', method: 'submission', techniqueId: 't1' }] },
      ],
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Techniques' }));
    await user.click(screen.getByRole('button', { name: 'Delete Triangle' }));
    await user.click(screen.getByRole('button', { name: 'Confirm delete Triangle' }));

    expect(stored().competitions[0].matches[0]).toEqual({
      id: 'm1',
      result: 'win',
      method: 'submission',
      submission: 'Triangle',
    });
    await user.click(screen.getByRole('button', { name: 'Compete' }));
    expect(screen.getByRole('list', { name: 'Matches at Autumn Open' })).toHaveTextContent(
      'Win by submission (Triangle)',
    );
  });

  it('keeps the technique as words when a linked win is changed to a loss', async () => {
    seed({
      techniques: [TRIANGLE],
      competitions: [
        { ...OPEN, matches: [{ id: 'm1', result: 'win', method: 'submission', techniqueId: 't1' }] },
      ],
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Compete' }));
    await user.click(screen.getByRole('button', { name: 'Edit match 1 at Autumn Open' }));
    const form = screen.getByRole('form', { name: 'Edit match' });
    await user.click(within(form).getByRole('radio', { name: 'Loss' }));
    expect(within(form).getByRole('textbox', { name: /Submission/ })).toHaveValue('Triangle');
    await user.click(within(form).getByRole('button', { name: 'Save changes' }));
    expect(stored().competitions[0].matches[0]).toEqual({
      id: 'm1',
      result: 'loss',
      method: 'submission',
      submission: 'Triangle',
    });
  });

  it('keeps the link when a linked win is changed to a loss and back', async () => {
    seed({
      techniques: [TRIANGLE],
      competitions: [
        { ...OPEN, matches: [{ id: 'm1', result: 'win', method: 'submission', techniqueId: 't1' }] },
      ],
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Compete' }));
    await user.click(screen.getByRole('button', { name: 'Edit match 1 at Autumn Open' }));
    const form = screen.getByRole('form', { name: 'Edit match' });
    await user.click(within(form).getByRole('radio', { name: 'Loss' }));
    await user.click(within(form).getByRole('radio', { name: 'Win' }));
    expect(within(form).getByRole('combobox')).toHaveValue('t1');
    expect(within(form).queryByRole('textbox', { name: /Submission/ })).not.toBeInTheDocument();
    // Choosing to type it in after all starts from an empty box, not the name filled in for the loss.
    await user.selectOptions(within(form).getByRole('combobox'), 'Not in my journal');
    expect(within(form).getByRole('textbox', { name: /Submission/ })).toHaveValue('');
    await user.selectOptions(within(form).getByRole('combobox'), 'Triangle');
    await user.click(within(form).getByRole('button', { name: 'Save changes' }));
    expect(stored().competitions[0].matches[0]).toEqual({
      id: 'm1',
      result: 'win',
      method: 'submission',
      techniqueId: 't1',
    });
  });

  it('types the submission in when the journal is empty', async () => {
    seed({ competitions: [{ ...OPEN, matches: [] }] });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Compete' }));
    await user.click(screen.getByRole('button', { name: 'Add match to Autumn Open' }));
    const form = screen.getByRole('form', { name: 'Add match' });
    await user.click(within(form).getByRole('radio', { name: 'Win' }));
    await user.click(within(form).getByRole('radio', { name: 'Submission' }));
    expect(within(form).queryByRole('combobox')).not.toBeInTheDocument();
    expect(within(form).getByRole('textbox', { name: /Submission/ })).toBeInTheDocument();
  });
});

describe('Time off', () => {
  it('carries the streak across weeks off and leaves them out of the average and goal', async () => {
    const thisWeek = weekStart(todayIso());
    seed({
      weeklyGoal: 2,
      sessions: [
        { id: 's1', date: thisWeek, durationMinutes: 60, type: 'gi' },
        { id: 's2', date: addDays(thisWeek, -21), durationMinutes: 60, type: 'gi' },
        { id: 's3', date: addDays(thisWeek, -20), durationMinutes: 60, type: 'gi' },
      ],
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Training' }));

    // Two missed weeks end the streak and count against the average and the goal.
    const streak = screen.getByRole('group', { name: 'Current streak' });
    const average = screen.getByRole('group', { name: 'Weekly average' });
    const goal = screen.getByRole('group', { name: "This week's goal" });
    expect(streak).toHaveTextContent('1 week');
    expect(average).toHaveTextContent('0.7 sessions');
    expect(average).toHaveTextContent('Over the last 3 full weeks');
    expect(goal).toHaveTextContent('Reached in 1 of the last 3 full weeks');

    const card = screen.getByRole('region', { name: 'Time off' });
    expect(card).toHaveTextContent("those weeks won't break your streak");
    await user.click(within(card).getByRole('button', { name: 'Add time off' }));
    const form = within(card).getByRole('form', { name: 'Add time off' });
    fireEvent.change(within(form).getByLabelText('First day off'), {
      target: { value: addDays(thisWeek, -14) },
    });
    fireEvent.change(within(form).getByLabelText(/Last day off/), {
      target: { value: addDays(thisWeek, -1) },
    });
    await user.click(within(form).getByRole('radio', { name: 'Travel' }));
    await user.type(within(form).getByLabelText(/Notes/), 'Two weeks away');
    await user.click(within(form).getByRole('button', { name: 'Save time off' }));

    expect(stored().timeOff).toEqual([
      {
        id: stored().timeOff[0].id,
        startDate: addDays(thisWeek, -14),
        endDate: addDays(thisWeek, -1),
        reason: 'travel',
        notes: 'Two weeks away',
      },
    ]);
    const list = within(card).getByRole('list', { name: 'Time off' });
    expect(list).toHaveTextContent(
      `${formatDate(addDays(thisWeek, -14))} to ${formatDate(addDays(thisWeek, -1))}`,
    );
    expect(list).toHaveTextContent('Travel');
    expect(list).toHaveTextContent('Two weeks away');

    expect(streak).toHaveTextContent('2 weeks');
    expect(streak).toHaveTextContent('Including this week · Not counting 2 weeks off');
    expect(average).toHaveTextContent('2.0 sessions');
    expect(average).toHaveTextContent('Over the last 1 full week');
    expect(goal).toHaveTextContent('Reached in 1 of the last 1 full week');

    const chart = screen.getByRole('group', { name: 'Sessions per week, last 8 weeks' });
    const bars = within(chart).getAllByRole('img');
    expect(bars[6]).toHaveAccessibleName(
      `Week of ${formatShortDate(addDays(thisWeek, -7))}, time off: 0 sessions, 0 hours`,
    );
    expect(chart).toHaveTextContent(
      'Shaded weeks include time off and are left out of your average and goal record.',
    );
  });

  it('holds the streak during time off that is still going on, until it is ended or deleted', async () => {
    const thisWeek = weekStart(todayIso());
    seed({
      sessions: [{ id: 's1', date: addDays(thisWeek, -14), durationMinutes: 60, type: 'gi' }],
      timeOff: [{ id: 'o1', startDate: addDays(thisWeek, -10), reason: 'injury' }],
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Training' }));

    const streak = screen.getByRole('group', { name: 'Current streak' });
    expect(streak).toHaveTextContent('1 week');
    expect(streak).toHaveTextContent('Held while you are off');
    const card = screen.getByRole('region', { name: 'Time off' });
    expect(card).toHaveTextContent('You are on time off (injury)');
    expect(card).toHaveTextContent(`Since ${formatDate(addDays(thisWeek, -10))}`);
    expect(card).toHaveTextContent('Ongoing');

    // A last day before the first is refused.
    const label = `time off from ${formatDate(addDays(thisWeek, -10))}`;
    await user.click(within(card).getByRole('button', { name: `Edit ${label}` }));
    const form = within(card).getByRole('form', { name: 'Edit time off' });
    fireEvent.change(within(form).getByLabelText(/Last day off/), {
      target: { value: addDays(thisWeek, -11) },
    });
    fireEvent.submit(form);
    expect(within(form).getByRole('alert')).toHaveTextContent("can't be before the first");
    await user.click(within(form).getByRole('button', { name: 'Cancel' }));

    await user.click(within(card).getByRole('button', { name: `Delete ${label}` }));
    await user.click(within(card).getByRole('button', { name: `Confirm delete ${label}` }));
    expect(stored().timeOff).toEqual([]);
    expect(streak).toHaveTextContent('0 weeks');
    expect(streak).toHaveTextContent('Train this week to start one');
  });
});

describe('The weekly chart', () => {
  it('switches between sessions, hours and rounds', async () => {
    const thisWeek = weekStart(todayIso());
    seed({
      weeklyGoal: 3,
      sessions: [
        { id: 's1', date: thisWeek, durationMinutes: 90, type: 'gi', rounds: 5 },
        { id: 's2', date: addDays(thisWeek, -7), durationMinutes: 60, type: 'gi', rounds: 4 },
        { id: 's3', date: addDays(thisWeek, -6), durationMinutes: 75, type: 'gi' },
      ],
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Training' }));

    const chart = screen.getByRole('group', { name: 'Sessions per week, last 8 weeks' });
    const shows = within(chart).getByRole('group', { name: 'Chart shows' });
    expect(within(shows).getByRole('button', { name: 'Sessions' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(chart).toHaveTextContent('The dashed line is your goal of 3 a week.');
    // Each bar says everything the week holds, whichever figure it is drawn from.
    expect(within(chart).getAllByRole('img')[6]).toHaveAccessibleName(
      `Week of ${formatShortDate(addDays(thisWeek, -7))}: 2 sessions, 2.3 hours, 4 rounds`,
    );

    await user.click(within(shows).getByRole('button', { name: 'Hours' }));
    const hours = screen.getByRole('group', { name: 'Hours per week, last 8 weeks' });
    expect(hours).toHaveTextContent('Hours per week');
    // The goal is in sessions, so its line is not drawn against hours.
    expect(hours).not.toHaveTextContent('dashed line');
    // The week in progress is labelled with its figure.
    expect(hours).toHaveTextContent('1.5');

    await user.click(within(shows).getByRole('button', { name: 'Rounds' }));
    const rounds = screen.getByRole('group', { name: 'Rounds per week, last 8 weeks' });
    expect(rounds).toHaveTextContent('Rounds count only the sessions that record them.');

    const rows = within(screen.getByRole('table')).getAllByRole('row');
    expect(rows[0]).toHaveTextContent('Week startingSessionsHoursRounds');
    expect(rows[7]).toHaveTextContent(`${formatShortDate(addDays(thisWeek, -7))}22.34`);
  });

  it('says the goal is not counted in a week with time off', () => {
    const today = todayIso();
    seed({
      weeklyGoal: 3,
      sessions: [{ id: 's1', date: addDays(today, -30), durationMinutes: 60, type: 'gi' }],
      timeOff: [{ id: 'o1', startDate: addDays(today, -3), reason: 'injury' }],
    });
    render(<App />);
    const tile = screen.getByRole('group', { name: 'This week' });
    expect(tile).toHaveTextContent('Time off this week, so your goal of 3 is not counted');
    expect(tile).not.toHaveTextContent('to go');
  });
});

describe('Time off that is planned, or was never ended', () => {
  it('holds the streak for time off later this week without saying you are off today', async () => {
    const today = todayIso();
    const thisWeek = weekStart(today);
    // Time off that starts on the last day of this week, or after today if that is today.
    const starts = addDays(thisWeek, 6) > today ? addDays(thisWeek, 6) : addDays(today, 1);
    seed({
      sessions: [{ id: 's1', date: addDays(thisWeek, -7), durationMinutes: 60, type: 'gi' }],
      timeOff: [{ id: 'o1', startDate: starts, reason: 'travel' }],
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Training' }));

    const card = screen.getByRole('region', { name: 'Time off' });
    expect(card).toHaveTextContent(`From ${formatDate(starts)}`);
    expect(card).toHaveTextContent('Planned');
    expect(card).not.toHaveTextContent('You are on time off');
    const streak = screen.getByRole('group', { name: 'Current streak' });
    expect(streak).not.toHaveTextContent('while you are off');
    // Sunday is the one day on which "later this week" is next week.
    if (starts <= addDays(thisWeek, 6)) {
      expect(streak).toHaveTextContent('Held: this week includes time off');
    }
  });

  it('offers to end open time off once a session has been logged since it began', async () => {
    const today = todayIso();
    seed({
      sessions: [
        { id: 's1', date: addDays(today, -100), durationMinutes: 60, type: 'gi' },
        { id: 's2', date: addDays(today, -20), durationMinutes: 60, type: 'gi' },
        { id: 's3', date: addDays(today, -6), durationMinutes: 60, type: 'gi' },
      ],
      timeOff: [{ id: 'o1', startDate: addDays(today, -90), reason: 'injury', notes: 'Knee' }],
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Training' }));

    // Every finished week counts as off, which is said, not passed off as being new to the app.
    const average = screen.getByRole('group', { name: 'Weekly average' });
    expect(average).toHaveTextContent('After your next full week without time off');

    const card = screen.getByRole('region', { name: 'Time off' });
    expect(card).toHaveTextContent(
      `has no last day, but you trained on ${formatDate(addDays(today, -20))}`,
    );
    const lastDay = addDays(today, -21);
    // The offer still applies with the edit form open, and ending it there closes the form, so its
    // blank last day cannot be saved back over the new one.
    const from = formatDate(addDays(today, -90));
    await user.click(within(card).getByRole('button', { name: `Edit time off from ${from}` }));
    await user.click(
      within(card).getByRole('button', {
        name: `End time off from ${from} on ${formatDate(lastDay)}`,
      }),
    );
    expect(within(card).queryByRole('form', { name: 'Edit time off' })).not.toBeInTheDocument();

    expect(stored().timeOff).toEqual([
      { id: 'o1', startDate: addDays(today, -90), endDate: lastDay, reason: 'injury', notes: 'Knee' },
    ]);
    expect(card).not.toHaveTextContent('has no last day');
    expect(card).toHaveTextContent(`${formatDate(addDays(today, -90))} to ${formatDate(lastDay)}`);
    expect(average).toHaveTextContent(/Over the last \d full weeks?/);
  });
});

describe('Time off: planned periods and older ones never ended', () => {
  it('marks every period that has yet to start as planned, with or without a last day', async () => {
    const today = todayIso();
    seed({
      timeOff: [
        { id: 'o1', startDate: addDays(today, 20), endDate: addDays(today, 30), reason: 'travel' },
        { id: 'o2', startDate: addDays(today, 40), endDate: addDays(today, 40), reason: 'other' },
        { id: 'o3', startDate: addDays(today, -30), endDate: addDays(today, -20), reason: 'illness' },
      ],
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Training' }));
    const [single, trip, past] = within(screen.getByRole('list', { name: 'Time off' })).getAllByRole(
      'listitem',
    );
    expect(single).toHaveTextContent('Planned');
    expect(trip).toHaveTextContent('Planned');
    expect(past).not.toHaveTextContent('Planned');
    expect(past).not.toHaveTextContent('Ongoing');
  });

  it('offers to end an older open period even while a newer one covers today', async () => {
    const today = todayIso();
    seed({
      sessions: [{ id: 's1', date: addDays(today, -40), durationMinutes: 60, type: 'gi' }],
      timeOff: [
        { id: 'old', startDate: addDays(today, -60), reason: 'injury' },
        { id: 'new', startDate: addDays(today, -2), reason: 'illness' },
      ],
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Training' }));

    const card = screen.getByRole('region', { name: 'Time off' });
    // The newer one has not been trained since, so it is simply time off.
    expect(card).toHaveTextContent('You are on time off (illness)');
    expect(card).toHaveTextContent(
      `Your time off since ${formatDate(addDays(today, -60))} has no last day`,
    );
    // A form open for something else keeps what was typed in it.
    await user.click(within(card).getByRole('button', { name: 'Add time off' }));
    await user.type(
      within(within(card).getByRole('form', { name: 'Add time off' })).getByLabelText(/Notes/),
      'Holiday',
    );
    await user.click(
      within(card).getByRole('button', {
        name: `End time off from ${formatDate(addDays(today, -60))} on ${formatDate(addDays(today, -41))}`,
      }),
    );
    expect(
      within(within(card).getByRole('form', { name: 'Add time off' })).getByLabelText(/Notes/),
    ).toHaveValue('Holiday');
    await user.click(within(card).getByRole('button', { name: 'Cancel' }));
    expect(stored().timeOff[0]).toMatchObject({ id: 'old', endDate: addDays(today, -41) });
    expect(stored().timeOff[1]).not.toHaveProperty('endDate');
    expect(card).not.toHaveTextContent('has no last day');
    expect(card).toHaveTextContent('You are on time off (illness)');
  });
});

describe('Stale techniques and time off', () => {
  it('pauses the stale clock during time off, on the overview and in the journal', async () => {
    const today = todayIso();
    const technique = (id: string, name: string): Technique => ({
      id,
      name,
      position: 'guard',
      status: 'drilling',
      addedOn: addDays(today, -200),
      statusSince: addDays(today, -200),
    });
    seed({
      techniques: [technique('t1', 'Armbar'), technique('t2', 'Triangle')],
      sessions: [
        { id: 's1', date: addDays(today, -40), durationMinutes: 60, type: 'gi', techniqueIds: ['t1'] },
        { id: 's2', date: addDays(today, -90), durationMinutes: 60, type: 'gi', techniqueIds: ['t2'] },
      ],
    });
    const user = userEvent.setup();
    const first = render(<App />);
    const card = () => screen.getByRole('region', { name: 'Techniques' });
    // With no time off, both have gone stale.
    expect(card()).toHaveTextContent('StaleTriangle (90 days), Armbar (40 days)');
    expect(card()).toHaveTextContent('Stale means not trained for 30 days or more.');
    first.unmount();

    // Twenty days off, ending five days ago.
    seed({
      ...stored(),
      timeOff: [
        { id: 'o1', startDate: addDays(today, -24), endDate: addDays(today, -5), reason: 'injury' },
      ],
    });
    render(<App />);
    expect(card()).toHaveTextContent('StaleTriangle (70 days, not counting 20 days off)');
    // Armbar is no longer stale, and was not trained in the last 30 days, so it is in neither row.
    expect(card()).not.toHaveTextContent('Recent');
    expect(card()).not.toHaveTextContent('Armbar');
    expect(card()).toHaveTextContent(
      'Stale means not trained for 30 days or more, not counting time off.',
    );

    await user.click(screen.getByRole('button', { name: 'Techniques' }));
    const [armbar, triangle] = within(screen.getByRole('list', { name: 'Guard' })).getAllByRole(
      'listitem',
    );
    expect(armbar).not.toHaveTextContent('Not trained for');
    expect(triangle).toHaveTextContent('Not trained for 70 days, not counting 20 days off');
  });
});

describe('Black belt degrees', () => {
  it('sets a black belt rank in degrees, beyond the four a coloured belt holds', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('radio', { name: 'Brown' }));
    expect(screen.getByRole('group', { name: 'Stripes' })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: '5 stripes' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Black' }));
    const degrees = screen.getByRole('group', { name: 'Degrees' });
    expect(within(degrees).getAllByRole('radio')).toHaveLength(7);
    await user.click(within(degrees).getByRole('radio', { name: '5 degrees' }));
    // Degrees are not stripes: going back to a coloured belt starts the count again.
    await user.click(screen.getByRole('radio', { name: 'Brown' }));
    expect(screen.getByRole('radio', { name: '0 stripes' })).toBeChecked();
    // Stripes carry over between coloured belts, but not into black belt degrees.
    await user.click(screen.getByRole('radio', { name: '3 stripes' }));
    await user.click(screen.getByRole('radio', { name: 'Purple' }));
    expect(screen.getByRole('radio', { name: '3 stripes' })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: 'Black' }));
    expect(screen.getByRole('radio', { name: '0 degrees' })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: '5 degrees' }));
    await user.click(screen.getByRole('button', { name: 'Save rank' }));

    expect(screen.getByRole('heading', { name: 'Black belt, 5th degree' })).toBeInTheDocument();
    expect(stored().rank).toEqual({ belt: 'black', stripes: 5 });
    expect(screen.getByRole('region', { name: 'Time in grade' })).toHaveTextContent(
      'IBJJF requires 5 years at the 5th degree before the 6th degree. Log your promotion to the 5th degree',
    );
  });

  it('shows the time served towards the next degree', () => {
    seed({
      rank: { belt: 'black', stripes: 1 },
      promotions: [
        { id: 'black', belt: 'black', stripes: 0, date: '2015-01-01' },
        { id: 'black-1', belt: 'black', stripes: 1, date: '2018-03-01' },
      ],
    });
    render(<App />);

    const card = screen.getByRole('region', { name: 'Time in grade' });
    expect(card).toHaveTextContent('Minimum met.');
    expect(card).toHaveTextContent(
      'IBJJF requires 3 years before the 2nd degree, which you reached on 1 Mar 2021.',
    );
    expect(within(card).getByRole('progressbar')).toHaveValue(100);
  });

  it('counts three years at black belt towards the 1st degree, and stops at the 6th', () => {
    const today = todayIso();
    seed({
      rank: { belt: 'black', stripes: 0 },
      promotions: [{ id: 'black', belt: 'black', stripes: 0, date: addDays(today, -365) }],
    });
    const first = render(<App />);
    expect(screen.getByRole('region', { name: 'Time in grade' })).toHaveTextContent(
      /of the 3 years IBJJF requires at black belt before the 1st degree/,
    );
    first.unmount();

    seed({ rank: { belt: 'black', stripes: 6 } });
    render(<App />);
    expect(screen.getByRole('region', { name: 'Time in grade' })).toHaveTextContent(
      "The 7th degree is the coral belt, which this app doesn't track.",
    );
  });

  it('logs a black belt, not a degree, when a brown belt with stripes is promoted', async () => {
    seed({ rank: { belt: 'brown', stripes: 2 } });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Timeline' }));
    await user.click(screen.getByRole('button', { name: 'Log promotion' }));
    const form = screen.getByRole('form', { name: 'Log promotion' });
    // The undated current rank is suggested; choosing black must not make it a 2nd degree.
    expect(within(form).getByRole('radio', { name: '2 stripes' })).toBeChecked();
    await user.click(within(form).getByRole('radio', { name: 'Black' }));
    await user.click(within(form).getByRole('button', { name: 'Save promotion' }));
    expect(stored().rank).toEqual({ belt: 'black', stripes: 0 });
    expect(stored().promotions[0]).toMatchObject({ belt: 'black', stripes: 0 });
  });

  it('logs a degree on the timeline', async () => {
    seed({
      rank: { belt: 'black', stripes: 0 },
      promotions: [{ id: 'black', belt: 'black', stripes: 0, date: '2020-01-01' }],
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Timeline' }));
    await user.click(screen.getByRole('button', { name: 'Log promotion' }));
    const form = screen.getByRole('form', { name: 'Log promotion' });
    // The next degree is suggested.
    expect(within(form).getByRole('radio', { name: '1 degree' })).toBeChecked();
    fireEvent.change(within(form).getByLabelText('Promotion date'), {
      target: { value: '2023-02-01' },
    });
    await user.click(within(form).getByRole('button', { name: 'Save promotion' }));

    expect(screen.getByRole('region', { name: 'Promotions' })).toHaveTextContent(
      'Black belt, 1st degree',
    );
    expect(stored().rank).toEqual({ belt: 'black', stripes: 1 });
  });
});

describe('Long session lists', () => {
  it('shows the most recent 30 sessions and more on request', async () => {
    const sessions: Session[] = Array.from({ length: 35 }, (_, index) => ({
      id: `s${index}`,
      date: addDays('2024-01-01', index),
      durationMinutes: 60,
      type: 'gi',
    }));
    seed({ sessions });
    window.localStorage.setItem(LAST_BACKUP_KEY, todayIso());
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Training' }));

    const list = screen.getByRole('region', { name: 'Sessions' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(30);
    expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent('4 Feb 2024');
    expect(list).toHaveTextContent('Showing 30 of 35');

    await user.click(within(list).getByRole('button', { name: 'Show more' }));
    expect(within(list).getAllByRole('listitem')).toHaveLength(35);
    expect(within(list).queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument();
  });
});

describe('Backup reminder', () => {
  const sessions: Session[] = Array.from({ length: 10 }, (_, index) => ({
    id: `s${index}`,
    date: addDays('2024-01-01', index),
    durationMinutes: 60,
    type: 'gi',
  }));

  it('suggests a first backup once there is history, and can be put off', async () => {
    seed({ sessions });
    const user = userEvent.setup();
    const first = render(<App />);

    const reminder = screen.getByRole('region', { name: 'Backup reminder' });
    expect(reminder).toHaveTextContent('has never been backed up');
    await user.click(within(reminder).getByRole('button', { name: 'Not now' }));
    expect(screen.queryByRole('region', { name: 'Backup reminder' })).not.toBeInTheDocument();
    expect(window.localStorage.getItem(BACKUP_SNOOZE_KEY)).toBe(todayIso());

    first.unmount();
    render(<App />);
    expect(screen.queryByRole('region', { name: 'Backup reminder' })).not.toBeInTheDocument();
  });

  it('says how old the last backup is and leads to the Backup tab', async () => {
    seed({ sessions: sessions.slice(0, 1) });
    window.localStorage.setItem(LAST_BACKUP_KEY, addDays(todayIso(), -45));
    const user = userEvent.setup();
    render(<App />);

    const reminder = screen.getByRole('region', { name: 'Backup reminder' });
    expect(reminder).toHaveTextContent('Your last backup was 45 days ago.');
    await user.click(within(reminder).getByRole('button', { name: 'Back up now' }));
    expect(screen.getByRole('heading', { name: 'Back up' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Download backup' }));
    await user.click(screen.getByRole('button', { name: 'Overview' }));
    expect(screen.queryByRole('region', { name: 'Backup reminder' })).not.toBeInTheDocument();
  });

  it('stays quiet with little history or a recent backup', () => {
    seed({ sessions: sessions.slice(0, 9) });
    const first = render(<App />);
    expect(screen.queryByRole('region', { name: 'Backup reminder' })).not.toBeInTheDocument();
    first.unmount();

    seed({ sessions });
    window.localStorage.setItem(LAST_BACKUP_KEY, addDays(todayIso(), -29));
    render(<App />);
    expect(screen.queryByRole('region', { name: 'Backup reminder' })).not.toBeInTheDocument();
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
    ...emptyData(),
    rank: { belt: 'blue', stripes: 1 },
    promotions: [
      { id: 'p1', belt: 'blue', stripes: 0, date: '2024-06-01' },
      { id: 'p2', belt: 'blue', stripes: 1, date: '2025-02-01' },
    ],
    sessions: [
      { id: 's1', date: '2025-03-01', durationMinutes: 90, type: 'gi', notes: 'Closed guard' },
    ],
    weeklyGoal: 2,
    competitions: [
      {
        id: 'c1',
        date: '2025-04-12',
        name: 'Spring Open',
        type: 'gi',
        medal: 'silver',
        matches: [{ id: 'm1', result: 'win', method: 'points' }],
      },
    ],
    techniques: [
      { id: 't1', name: 'Armbar', position: 'guard', status: 'drilling', addedOn: '2025-02-10', statusSince: '2025-02-10' },
    ],
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
    expect(screen.getByText(/^Last backup: /)).toBeInTheDocument();
  });

  it('has nothing to download before any data exists', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Backup' }));
    expect(screen.getByRole('button', { name: 'Download backup' })).toBeDisabled();
  });

  it('shows what a backup contains and only replaces data once confirmed', async () => {
    const existing: AppData = {
      ...emptyData(),
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
    expect(confirm).toHaveTextContent('In the backup: Blue belt, 1 stripe · 2 promotions · 1 session · 1 competition · 1 technique');
    expect(confirm).toHaveTextContent(
      'Restoring replaces everything on this device now: White belt, 2 stripes · 0 promotions · 1 session · 0 competitions · 0 techniques.',
    );
    expect(stored()).toEqual(existing);

    await user.click(within(confirm).getByRole('button', { name: 'Restore this backup' }));
    expect(stored()).toEqual(HISTORY);
    expect(screen.getByRole('status')).toHaveTextContent('Restored 2 promotions, 1 session, 1 competition and 1 technique.');
    // The data now matches a file saved today, so it counts as backed up today.
    expect(window.localStorage.getItem(LAST_BACKUP_KEY)).toBe(todayIso());

    await user.click(screen.getByRole('button', { name: 'Overview' }));
    expect(screen.getByRole('heading', { name: 'Blue belt, 1 stripe' })).toBeInTheDocument();
  });

  it('keeps the current data when the restore is cancelled', async () => {
    seed(HISTORY);
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Backup' }));

    const empty = emptyData();
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
