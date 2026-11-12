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

    await user.type(within(list).getByLabelText('Search sessions'), 'leg');
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
    await user.type(within(list).getByLabelText('Search sessions'), 'triangle');
    expect(within(list).getByRole('status')).toHaveTextContent('Found 1 of 1 session');
    await user.clear(within(list).getByLabelText('Search sessions'));
    await user.type(within(list).getByLabelText('Search sessions'), 'kimura');
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
    await user.type(within(list).getByLabelText('Search sessions'), 'open mat');
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

describe('Caught with', () => {
  it('records what a session was caught with and shows what catches you most', async () => {
    seed({
      sessions: [
        { id: 's1', date: '2024-05-01', durationMinutes: 60, type: 'gi', caughtWith: ['Armbar'] },
        { id: 's2', date: '2024-05-08', durationMinutes: 60, type: 'gi', caughtWith: ['Armbar', 'Kimura'] },
      ],
    });
    const user = userEvent.setup();
    render(<App />);

    const card = screen.getByRole('region', { name: 'Caught with' });
    const rows = within(card).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Armbar');
    expect(rows[0]).toHaveTextContent('2 sessions');
    expect(rows[0]).toHaveTextContent('Last on 8 May');
    expect(rows[1]).toHaveTextContent('Kimura');

    await user.click(screen.getByRole('button', { name: 'Training' }));
    const form = screen.getByRole('form', { name: 'Log session' });
    const picker = within(form).getByRole('group', { name: /Caught with/ });
    // Names used before are one tap; a new one is typed, and Enter adds it without logging.
    await user.click(within(picker).getByRole('checkbox', { name: 'Armbar' }));
    await user.type(within(picker).getByLabelText('Add a submission you were caught with'), 'triangle{Enter}');
    expect(stored().sessions).toHaveLength(2);
    expect(within(picker).getByRole('checkbox', { name: 'triangle' })).toBeChecked();
    // Typing a name used before, in another case, ticks the one already there.
    await user.type(within(picker).getByLabelText('Add a submission you were caught with'), 'KIMURA');
    await user.click(within(picker).getByRole('button', { name: 'Add' }));
    expect(within(picker).getByRole('checkbox', { name: 'Kimura' })).toBeChecked();
    await user.click(within(picker).getByRole('checkbox', { name: 'Kimura' }));
    await user.click(within(form).getByRole('button', { name: 'Log session' }));

    expect(stored().sessions[2].caughtWith).toEqual(['Armbar', 'triangle']);
    // The next session starts clear.
    expect(within(picker).getByRole('checkbox', { name: 'Armbar' })).not.toBeChecked();

    const list = screen.getByRole('region', { name: 'Sessions' });
    expect(list).toHaveTextContent('Caught with: Armbar, triangle');
    await user.type(within(list).getByLabelText('Search sessions'), 'kimura');
    expect(within(list).getByRole('status')).toHaveTextContent('Found 1 of 3 sessions');

    await user.click(screen.getByRole('button', { name: 'Overview' }));
    expect(
      within(screen.getByRole('region', { name: 'Caught with' })).getAllByRole('listitem')[0],
    ).toHaveTextContent('3 sessions');
  });

  it('keeps a submission that was typed but not added when the session is logged', async () => {
    seed({
      sessions: [
        { id: 's1', date: '2024-05-01', durationMinutes: 60, type: 'gi', caughtWith: ['Armbar'] },
      ],
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Training' }));
    const form = screen.getByRole('form', { name: 'Log session' });
    const box = within(form).getByLabelText('Add a submission you were caught with');
    // Typed in another case, and never confirmed with Add or Enter.
    await user.type(box, 'ARMBAR');
    await user.click(within(form).getByRole('button', { name: 'Log session' }));
    expect(stored().sessions[1].caughtWith).toEqual(['Armbar']);
    // The box is cleared with the rest, so it does not carry into the next session.
    expect(box).toHaveValue('');

    await user.click(screen.getByRole('button', { name: 'Edit Gi session on 1 May 2024' }));
    const edit = screen.getByRole('form', { name: 'Edit session' });
    await user.type(within(edit).getByLabelText('Add a submission you were caught with'), 'Kimura');
    await user.click(within(edit).getByRole('button', { name: 'Save changes' }));
    expect(stored().sessions[0].caughtWith).toEqual(['Armbar', 'Kimura']);
  });

  it('lets text typed before the tenth tick be cleared, so the session can be saved', async () => {
    const names = Array.from({ length: 10 }, (_, index) => `Submission ${index + 1}`);
    seed({
      sessions: [
        { id: 's1', date: '2024-05-01', durationMinutes: 60, type: 'gi', caughtWith: names.slice(0, 9) },
      ],
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Training' }));
    await user.click(screen.getByRole('button', { name: 'Edit Gi session on 1 May 2024' }));
    const form = screen.getByRole('form', { name: 'Edit session' });
    const picker = within(form).getByRole('group', { name: /Caught with/ });
    const box = within(picker).getByLabelText('Add a submission you were caught with');

    await user.type(box, 'Kimura');
    await user.type(box, '{Backspace}'.repeat(6));
    await user.type(box, names[9]);
    await user.click(within(picker).getByRole('button', { name: 'Add' }));
    // Ten are ticked now. An eleventh typed in is refused, and can be cleared.
    await user.type(box, 'Kimura');
    expect(within(picker).getByRole('button', { name: 'Add' })).toBeDisabled();
    expect(picker).toHaveTextContent('Untick one to add another, or clear the box to save.');
    await user.click(within(form).getByRole('button', { name: 'Save changes' }));
    expect(within(form).getByRole('alert')).toHaveTextContent('Record up to 10 submissions');
    expect(stored().sessions[0].caughtWith).toHaveLength(9);

    expect(box).toBeEnabled();
    await user.clear(box);
    await user.click(within(form).getByRole('button', { name: 'Save changes' }));
    expect(stored().sessions[0].caughtWith).toEqual(names);
  });

  it('takes a submission off a session when it is edited, and hides the card with none', async () => {
    seed({
      sessions: [
        { id: 's1', date: '2024-05-01', durationMinutes: 60, type: 'gi', caughtWith: ['Armbar'] },
      ],
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Training' }));
    await user.click(screen.getByRole('button', { name: 'Edit Gi session on 1 May 2024' }));
    const form = screen.getByRole('form', { name: 'Edit session' });
    await user.click(within(form).getByRole('checkbox', { name: 'Armbar' }));
    await user.click(within(form).getByRole('button', { name: 'Save changes' }));
    expect(stored().sessions[0]).not.toHaveProperty('caughtWith');

    await user.click(screen.getByRole('button', { name: 'Overview' }));
    expect(screen.queryByRole('region', { name: 'Caught with' })).not.toBeInTheDocument();
  });
});

describe('A link on a technique', () => {
  it('adds a link, opens it in a new tab, and refuses one that is not a web address', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Techniques' }));
    await user.click(screen.getByRole('button', { name: 'Add technique' }));
    const form = screen.getByRole('form', { name: 'Add technique' });
    await user.type(within(form).getByLabelText('Technique name'), 'Knee cut pass');
    await user.click(within(form).getByRole('radio', { name: 'Guard passing' }));
    await user.type(within(form).getByLabelText(/Link/), 'javascript:alert(1)');
    await user.click(within(form).getByRole('button', { name: 'Save technique' }));
    expect(within(form).getByRole('alert')).toHaveTextContent('Enter a web address for the link');
    expect(stored()).toBeNull();

    await user.clear(within(form).getByLabelText(/Link/));
    await user.type(within(form).getByLabelText(/Link/), 'www.youtube.com/watch?v=abc');
    await user.click(within(form).getByRole('button', { name: 'Save technique' }));

    expect(stored().techniques[0].link).toBe('https://www.youtube.com/watch?v=abc');
    const link = screen.getByRole('link', {
      name: 'Open the link for Knee cut pass (youtube.com), in a new tab',
    });
    expect(link).toHaveAttribute('href', 'https://www.youtube.com/watch?v=abc');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveTextContent('Open link (youtube.com)');

    // Clearing the box removes the link.
    await user.click(screen.getByRole('button', { name: 'Edit Knee cut pass' }));
    const edit = screen.getByRole('form', { name: 'Edit technique' });
    expect(within(edit).getByLabelText(/Link/)).toHaveValue('https://www.youtube.com/watch?v=abc');
    await user.clear(within(edit).getByLabelText(/Link/));
    await user.click(within(edit).getByRole('button', { name: 'Save changes' }));
    expect(stored().techniques[0]).not.toHaveProperty('link');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});

describe('The trends card with and without sessions', () => {
  it('survives the first session being logged and the last one deleted', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Training' }));
    expect(screen.getByText('Log a few sessions to see your weekly trend and streak.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Log session' }));
    const chart = screen.getByRole('group', { name: 'Sessions per week, last 8 weeks' });
    await user.click(within(chart).getByRole('button', { name: 'Hours' }));
    expect(screen.getByRole('group', { name: 'Hours per week, last 8 weeks' })).toBeInTheDocument();

    const label = `Gi session on ${formatDate(todayIso())}`;
    await user.click(screen.getByRole('button', { name: `Delete ${label}` }));
    await user.click(screen.getByRole('button', { name: `Confirm delete ${label}` }));
    expect(screen.getByText('Log a few sessions to see your weekly trend and streak.')).toBeInTheDocument();
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
      'Replace everything removes what is on this device now: White belt, 2 stripes · 0 promotions · 1 session · 0 competitions · 0 techniques.',
    );
    expect(stored()).toEqual(existing);

    await user.click(within(confirm).getByRole('button', { name: 'Replace everything' }));
    expect(stored()).toEqual(HISTORY);
    expect(screen.getByRole('status')).toHaveTextContent('Restored 2 promotions, 1 session, 1 competition and 1 technique.');
    // The data now matches a file saved today, so it counts as backed up today.
    expect(window.localStorage.getItem(LAST_BACKUP_KEY)).toBe(todayIso());

    await user.click(screen.getByRole('button', { name: 'Overview' }));
    expect(screen.getByRole('heading', { name: 'Blue belt, 1 stripe' })).toBeInTheDocument();
  });

  it('adds a backup to what is on the device without removing anything', async () => {
    const existing: AppData = {
      ...emptyData(),
      rank: { belt: 'blue', stripes: 1 },
      sessions: [
        { id: 's1', date: '2025-03-01', durationMinutes: 90, type: 'gi', notes: 'Changed on this device' },
        { id: 'only-here', date: '2025-05-01', durationMinutes: 60, type: 'nogi' },
      ],
    };
    seed(existing);
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Backup' }));

    await user.upload(screen.getByLabelText('Backup file'), backupFile(HISTORY));
    const confirm = await screen.findByRole('group', { name: 'Confirm restore' });
    expect(confirm).toHaveTextContent(
      'Add to this device keeps everything here and adds what is missing: 2 promotions, 1 competition and 1 technique; your weekly goal is set to 2. 1 record already here stays as this device has it.',
    );
    expect(stored()).toEqual(existing);

    await user.click(within(confirm).getByRole('button', { name: 'Add to this device' }));
    const after = stored();
    // Both of this device's sessions are as they were, and the rest came from the file.
    expect(after.sessions).toEqual(existing.sessions);
    expect(after.promotions).toEqual(HISTORY.promotions);
    expect(after.competitions).toEqual(HISTORY.competitions);
    expect(after.techniques).toEqual(HISTORY.techniques);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Added 2 promotions, 1 competition and 1 technique.',
    );
    // The device now holds more than the file, so it does not count as backed up.
    expect(window.localStorage.getItem(LAST_BACKUP_KEY)).toBeNull();
  });

  it('offers a higher rank and a weekly goal from a backup that holds no new records', async () => {
    const existing: AppData = {
      ...emptyData(),
      rank: { belt: 'white', stripes: 4 },
      sessions: [{ id: 's1', date: '2025-03-01', durationMinutes: 60, type: 'gi' }],
    };
    seed(existing);
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Backup' }));

    const file: AppData = { ...existing, rank: { belt: 'blue', stripes: 0 }, weeklyGoal: 3 };
    await user.upload(screen.getByLabelText('Backup file'), backupFile(file));
    const confirm = await screen.findByRole('group', { name: 'Confirm restore' });
    expect(confirm).toHaveTextContent(
      'adds what is missing: your rank moves up to Blue belt; your weekly goal is set to 3.',
    );
    await user.click(within(confirm).getByRole('button', { name: 'Add to this device' }));
    expect(stored()).toEqual({ ...existing, rank: { belt: 'blue', stripes: 0 }, weeklyGoal: 3 });
    expect(screen.getByRole('status')).toHaveTextContent('Updated this device from the backup.');
  });

  it('says so when matches in a backup do not fit in a full competition', async () => {
    const open = { id: 'c1', date: '2025-04-12', name: 'Spring Open', type: 'gi' as const };
    const match = (id: string) => ({ id, result: 'win' as const, method: 'points' as const });
    const existing: AppData = {
      ...emptyData(),
      competitions: [{ ...open, matches: Array.from({ length: 30 }, (_, i) => match(`here-${i}`)) }],
    };
    seed(existing);
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Backup' }));

    const file: AppData = {
      ...emptyData(),
      competitions: [{ ...open, matches: [match('there-1'), match('there-2')] }],
    };
    await user.upload(screen.getByLabelText('Backup file'), backupFile(file));
    const confirm = await screen.findByRole('group', { name: 'Confirm restore' });
    expect(confirm).toHaveTextContent(
      "2 matches in the backup can't be added: a competition holds up to 30 matches, and the one on this device is full.",
    );
    expect(confirm).not.toHaveTextContent('Everything in this backup is already on this device');
    expect(within(confirm).queryByRole('button', { name: 'Add to this device' })).not.toBeInTheDocument();
  });

  it('offers only to replace when the backup has nothing new, or cannot be added', async () => {
    seed(HISTORY);
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Backup' }));

    await user.upload(screen.getByLabelText('Backup file'), backupFile(HISTORY));
    let confirm = await screen.findByRole('group', { name: 'Confirm restore' });
    expect(confirm).toHaveTextContent('Everything in this backup is already on this device');
    expect(within(confirm).queryByRole('button', { name: 'Add to this device' })).not.toBeInTheDocument();
    expect(within(confirm).getByRole('button', { name: 'Replace everything' })).toBeInTheDocument();
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }));

    // A purple belt dated before this device's blue belt cannot sit in one history with it.
    const clashing: AppData = {
      ...emptyData(),
      rank: { belt: 'purple', stripes: 0 },
      promotions: [{ id: 'px', belt: 'purple', stripes: 0, date: '2023-01-01' }],
    };
    await user.upload(screen.getByLabelText('Backup file'), backupFile(clashing));
    confirm = await screen.findByRole('group', { name: 'Confirm restore' });
    expect(confirm).toHaveTextContent("This backup can't be added to this device.");
    expect(within(confirm).queryByRole('button', { name: 'Add to this device' })).not.toBeInTheDocument();
    expect(stored()).toEqual(HISTORY);
  });

  it('simply restores onto a device with no data', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Backup' }));
    await user.upload(screen.getByLabelText('Backup file'), backupFile(HISTORY));
    const confirm = await screen.findByRole('group', { name: 'Confirm restore' });
    expect(confirm).toHaveTextContent('This device has no data yet');
    expect(within(confirm).queryByRole('button', { name: 'Add to this device' })).not.toBeInTheDocument();
    await user.click(within(confirm).getByRole('button', { name: 'Restore this backup' }));
    expect(stored()).toEqual(HISTORY);
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

describe('Checking in', () => {
  it('records today\'s class in one tap, like the last session', async () => {
    seed({ sessions: [{ id: 'old', date: '2024-05-01', durationMinutes: 90, type: 'nogi', kind: 'open-mat' }] });
    const user = userEvent.setup();
    render(<App />);

    const card = screen.getByRole('region', { name: 'Check in' });
    expect(card).toHaveTextContent('One tap records that you were here.');
    expect(card).toHaveTextContent('Records a 90 min No-gi class today');
    await user.click(within(card).getByRole('button', { name: 'Check in to class' }));

    // As long as the last session and in the same gi or no-gi, but a class whatever that was.
    expect(stored().sessions[1]).toEqual({
      id: stored().sessions[1].id,
      date: todayIso(),
      durationMinutes: 90,
      type: 'nogi',
      kind: 'class',
    });
    expect(card).toHaveTextContent('Checked in today. 1 session, 1.5 hours.');
    expect(screen.getByRole('group', { name: 'This week' })).toHaveTextContent('1 session');

    // A second class the same day is one more tap.
    await user.click(within(card).getByRole('button', { name: 'Check in to another class' }));
    expect(card).toHaveTextContent('Checked in today. 2 sessions, 3 hours.');
    expect(stored().sessions).toHaveLength(3);
  });
});

describe('Coach view', () => {
  async function asCoach() {
    const user = userEvent.setup();
    render(<App />);
    const views = screen.getByRole('group', { name: 'View as' });
    expect(within(views).getByRole('button', { name: 'Student' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(within(views).getByRole('button', { name: 'Coach' }));
    return user;
  }

  it('switches between the student\'s own record and the academy', async () => {
    const user = await asCoach();
    expect(screen.getByRole('heading', { name: 'Riverside Jiu-Jitsu' })).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent('Preview with a sample academy.');
    // The student's sections are not part of the coach's view.
    expect(screen.queryByRole('navigation', { name: 'Sections' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Student' }));
    expect(screen.getByRole('navigation', { name: 'Sections' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Riverside Jiu-Jitsu' })).not.toBeInTheDocument();
  });

  it('shows the academy at a glance: this week, minimum time met, gone quiet and new joiners', async () => {
    await asCoach();
    expect(screen.getByRole('group', { name: 'People training this week' })).toHaveTextContent('of 15');

    const met = screen.getByRole('region', { name: 'Minimum time met' });
    expect(within(met).getByRole('list')).toHaveTextContent('Alex Romero');
    expect(met).toHaveTextContent('Promotion is still your decision.');

    const quiet = screen.getByRole('region', { name: 'Gone quiet' });
    const rows = within(quiet).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Emeka Obi');
    expect(rows[0]).toHaveTextContent('34 days');
    expect(rows[1]).toHaveTextContent('Hana Sato');
    // Farah has not trained for longer, but is away.
    expect(quiet).not.toHaveTextContent('Farah Haddad');

    const joined = screen.getByRole('region', { name: 'Joined recently' });
    // With nothing recorded yet, you count as having joined today, ahead of last week's joiner.
    const [you, lena] = within(joined).getAllByRole('listitem');
    expect(you).toHaveTextContent('You');
    expect(lena).toHaveTextContent('Lena Fischer');
    expect(lena).toHaveTextContent('No rank yet');
  });

  it('finds students by name and belt', async () => {
    const user = await asCoach();
    await user.click(screen.getByRole('button', { name: 'Students' }));
    const card = screen.getByRole('region', { name: 'Students' });
    expect(within(card).getByRole('status')).toHaveTextContent('15 members');

    await user.type(within(card).getByLabelText('Search by name'), 'chen');
    expect(within(card).getByRole('status')).toHaveTextContent('1 of 15 members');
    const [row] = within(within(card).getByRole('list', { name: 'Students' })).getAllByRole('listitem');
    expect(row).toHaveTextContent('Chen Wei');
    expect(row).toHaveTextContent('Purple belt, 1 stripe');
    expect(row).toHaveTextContent('in 30 days');

    await user.clear(within(card).getByLabelText('Search by name'));
    await user.click(within(card).getByRole('button', { name: /^Brown/ }));
    expect(within(card).getByRole('status')).toHaveTextContent('1 of 15 members');
    expect(within(card).getByRole('list', { name: 'Students' })).toHaveTextContent('Priya Nair');

    await user.click(within(card).getByRole('button', { name: /^All/ }));
    await user.selectOptions(within(card).getByLabelText('Sort by'), 'Rank');
    expect(
      within(within(card).getByRole('list', { name: 'Students' })).getAllByRole('listitem')[0],
    ).toHaveTextContent('Marco Silva');
  });

  it('opens a student, shows rank and attendance only, and records a promotion', async () => {
    const user = await asCoach();
    await user.click(screen.getByRole('button', { name: 'Students' }));
    await user.click(screen.getByRole('button', { name: 'Open Lena Fischer' }));

    expect(screen.getByRole('heading', { name: 'Lena Fischer' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Lena Fischer' })).toHaveTextContent('No rank yet');
    const attendance = screen.getByRole('region', { name: 'Attendance' });
    expect(attendance).toHaveTextContent('Last 30 days');
    expect(within(attendance).getAllByRole('img')).toHaveLength(8);
    expect(attendance).toHaveTextContent('Their notes, techniques and competitions are theirs alone');
    // The same card a student sees, worded for the coach reading it.
    await user.click(screen.getByRole('button', { name: '‹ Back to students' }));
    await user.click(screen.getByRole('button', { name: 'Open Alex Romero' }));
    const grade = screen.getByRole('region', { name: 'Time in grade' });
    expect(grade).toHaveTextContent("Minimum met. They've spent");
    expect(grade).toHaveTextContent('Promotion is your decision.');
    await user.click(screen.getByRole('button', { name: '‹ Back to students' }));
    await user.click(screen.getByRole('button', { name: 'Open Lena Fischer' }));

    // A new member has no rank until a coach gives them one; white belt is suggested.
    await user.click(screen.getByRole('button', { name: 'Record a promotion' }));
    const form = screen.getByRole('form', { name: 'Log promotion' });
    expect(within(form).getByRole('radio', { name: 'White' })).toBeChecked();
    await user.click(within(form).getByRole('button', { name: 'Save promotion' }));
    expect(screen.getByRole('status')).toHaveTextContent('Recorded White belt for Lena Fischer.');
    expect(screen.getByRole('region', { name: 'Promotions' })).toHaveTextContent('White belt');

    // The next rank up is suggested, and a rank cannot be given twice.
    await user.click(screen.getByRole('button', { name: 'Record a promotion' }));
    const again = screen.getByRole('form', { name: 'Log promotion' });
    expect(within(again).getByRole('radio', { name: '1 stripe' })).toBeChecked();
    await user.click(within(again).getByRole('radio', { name: '0 stripes' }));
    await user.click(within(again).getByRole('button', { name: 'Save promotion' }));
    expect(within(again).getByRole('alert')).toHaveTextContent("You've already logged White belt");

    await user.click(screen.getByRole('button', { name: '‹ Back to students' }));
    expect(screen.getByRole('region', { name: 'Students' })).toBeInTheDocument();
  });

  it('lets a coach promote you, and take it back, with your own record following', async () => {
    seed({
      rank: { belt: 'white', stripes: 3 },
      promotions: [{ id: 'p1', belt: 'white', stripes: 3, date: '2025-06-01' }],
      sessions: [{ id: 's1', date: '2025-07-01', durationMinutes: 60, type: 'gi', notes: 'Private note' }],
    });
    const user = await asCoach();
    await user.click(screen.getByRole('button', { name: 'Students' }));
    await user.click(screen.getByRole('button', { name: 'Open You' }));
    // Your own notes are not part of what a coach sees.
    expect(screen.queryByText('Private note')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'You' })).toHaveTextContent('White belt, 3 stripes');

    await user.click(screen.getByRole('button', { name: 'Record a promotion' }));
    const form = screen.getByRole('form', { name: 'Log promotion' });
    expect(within(form).getByRole('radio', { name: '4 stripes' })).toBeChecked();
    await user.click(within(form).getByRole('button', { name: 'Save promotion' }));
    expect(stored().rank).toEqual({ belt: 'white', stripes: 4 });
    expect(stored().promotions).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'Student' }));
    expect(screen.getByRole('heading', { name: 'White belt, 4 stripes' })).toBeInTheDocument();

    // Taken back by the coach, the rank falls to the one before.
    await user.click(screen.getByRole('button', { name: 'Coach' }));
    await user.click(screen.getByRole('button', { name: 'Students' }));
    await user.click(screen.getByRole('button', { name: 'Open You' }));
    await user.click(screen.getByRole('button', { name: 'Delete White belt, 4 stripes for You' }));
    await user.click(
      screen.getByRole('button', { name: 'Confirm delete White belt, 4 stripes for You' }),
    );
    expect(stored().rank).toEqual({ belt: 'white', stripes: 3 });
    expect(stored().promotions.map((p) => p.id)).toEqual(['p1']);
  });

  it('shows the joining code and manages roles, always keeping an owner', async () => {
    const user = await asCoach();
    await user.click(screen.getByRole('button', { name: 'Manage' }));
    const code = screen.getByLabelText('Joining code');
    expect(code).toHaveTextContent('riverside-7q4k');
    await user.click(screen.getByRole('button', { name: 'Replace code' }));
    expect(code).not.toHaveTextContent('riverside-7q4k');

    const members = screen.getByRole('region', { name: 'Members and roles' });
    await user.selectOptions(within(members).getByLabelText('Role for Alex Romero'), 'Coach');
    expect(within(members).getByLabelText('Role for Alex Romero')).toHaveValue('coach');

    // The only owner cannot step down or be removed.
    await user.selectOptions(within(members).getByLabelText('Role for Marco Silva'), 'Student');
    expect(within(members).getByRole('alert')).toHaveTextContent('An academy needs at least one owner');
    expect(within(members).getByLabelText('Role for Marco Silva')).toHaveValue('owner');

    await user.click(within(members).getByRole('button', { name: 'Delete Hana Sato from the academy' }));
    await user.click(
      within(members).getByRole('button', { name: 'Confirm delete Hana Sato from the academy' }),
    );
    expect(within(members).queryByText('Hana Sato')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Students' }));
    expect(within(screen.getByRole('region', { name: 'Students' })).getByRole('status')).toHaveTextContent(
      '14 members',
    );
  });
});

describe('Training calendar', () => {
  // Built from the same string helpers the app uses, so the tests hold on any day they run.
  const MONTH_NAMES = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  const monthTitle = (date: string) =>
    `${MONTH_NAMES[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`;
  const longDate = (date: string) => `${Number(date.slice(8, 10))} ${monthTitle(date)}`;
  const firstOfMonth = (date: string) => `${date.slice(0, 7)}-01`;
  /** The 1st of the month a number of months away from this one. */
  const monthAway = (months: number) => {
    let first = firstOfMonth(todayIso());
    for (let step = 0; step < Math.abs(months); step += 1) {
      // Into the next month from the 1st, or the previous one from the day before it.
      first = firstOfMonth(addDays(first, months > 0 ? 31 : -1));
    }
    return first;
  };

  async function openCalendar() {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Training' }));
    return { user, card: screen.getByRole('region', { name: 'Calendar' }) };
  }

  it('shows this month with what is on each day, and the details of the day chosen', async () => {
    const today = todayIso();
    // Another day of this month with nothing on it.
    const quiet = today.endsWith('-01') ? addDays(today, 1) : addDays(today, -1);
    seed({
      rank: { belt: 'blue', stripes: 1 },
      promotions: [{ id: 'p1', belt: 'blue', stripes: 1, date: today }],
      sessions: [
        { id: 's1', date: today, durationMinutes: 90, type: 'gi', kind: 'class', rounds: 6 },
        { id: 's2', date: today, durationMinutes: 60, type: 'nogi' },
      ],
      competitions: [{ id: 'c1', date: today, name: 'Autumn Open', type: 'gi', matches: [] }],
      timeOff: [{ id: 't1', startDate: today, reason: 'injury' }],
    });
    const before = stored();
    const { user, card } = await openCalendar();

    expect(within(card).getByRole('heading', { name: monthTitle(today) })).toBeInTheDocument();
    expect(card).toHaveTextContent('2 sessions · 2.5 hours · 6 rounds');

    const grid = within(card).getByRole('grid', { name: `Training calendar, ${monthTitle(today)}` });
    expect(
      within(grid)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    // Every day of the month has a button, and the first sits under its weekday.
    const first = firstOfMonth(today);
    const dayButtons = within(grid).getAllByRole('button');
    expect(dayButtons).toHaveLength(Number(addDays(monthAway(1), -1).slice(8, 10)));
    const firstRow = within(grid).getAllByRole('row')[1];
    const blanks = within(firstRow)
      .getAllByRole('cell')
      .filter((cell) => cell.textContent === '');
    expect(blanks).toHaveLength((new Date(`${first}T12:00:00`).getDay() + 6) % 7);

    const todayButton = within(grid).getByRole('button', {
      name: `${longDate(today)} (today): 2 sessions, time off, promotion, competition`,
    });
    const quietButton = within(grid).getByRole('button', {
      name: `${longDate(quiet)}: nothing logged`,
    });
    expect(todayButton).toHaveAttribute('aria-pressed', 'false');
    expect(card).toHaveTextContent('Choose a day to see what is on it.');

    await user.click(todayButton);
    expect(todayButton).toHaveAttribute('aria-pressed', 'true');
    const details = within(card).getByRole('group', { name: longDate(today) });
    const items = within(details)
      .getAllByRole('listitem')
      .map((item) => item.textContent);
    expect(items).toEqual([
      '★ Promotion: Blue belt, 1 stripe',
      '◆ Competition: Autumn Open',
      'Gi · Class · 6 rounds · 90 min',
      'No-gi · 60 min',
      'Time off (injury)',
    ]);

    // Another day takes the selection; a day with nothing on it says so.
    await user.click(quietButton);
    expect(todayButton).toHaveAttribute('aria-pressed', 'false');
    expect(quietButton).toHaveAttribute('aria-pressed', 'true');
    expect(within(card).queryByRole('group', { name: longDate(today) })).not.toBeInTheDocument();
    expect(within(card).getByRole('group', { name: longDate(quiet) })).toHaveTextContent(
      'Nothing logged',
    );

    // Choosing the same day again closes it.
    await user.click(quietButton);
    expect(quietButton).toHaveAttribute('aria-pressed', 'false');
    expect(within(card).queryByRole('group', { name: longDate(quiet) })).not.toBeInTheDocument();

    // Looking at the calendar stores nothing.
    expect(stored()).toEqual(before);
  });

  it('moves to earlier and later months, with planned time off and competitions to come', async () => {
    const today = todayIso();
    const lastMonth = monthAway(-1);
    const nextMonth = monthAway(1);
    const tripStart = addDays(nextMonth, 2);
    const tripEnd = addDays(nextMonth, 4);
    const comp = addDays(nextMonth, 9);
    seed({
      sessions: [{ id: 's1', date: lastMonth, durationMinutes: 60, type: 'gi' }],
      competitions: [{ id: 'c1', date: comp, name: 'Winter Open', type: 'nogi', matches: [] }],
      timeOff: [
        { id: 't1', startDate: tripStart, endDate: tripEnd, reason: 'travel' },
        // Still to start and with no last day: nothing is known about it yet.
        { id: 't2', startDate: addDays(nextMonth, 20), reason: 'other' },
      ],
    });
    const { user, card } = await openCalendar();

    expect(card).toHaveTextContent('No sessions this month');
    expect(within(card).queryByRole('button', { name: 'This month' })).not.toBeInTheDocument();

    await user.click(within(card).getByRole('button', { name: 'Previous month' }));
    expect(within(card).getByRole('heading', { name: monthTitle(lastMonth) })).toBeInTheDocument();
    expect(card).toHaveTextContent('1 session · 1 hour');
    expect(
      within(card).getByRole('grid', { name: `Training calendar, ${monthTitle(lastMonth)}` }),
    ).toBeInTheDocument();
    await user.click(within(card).getByRole('button', { name: `${longDate(lastMonth)}: 1 session` }));
    expect(within(card).getByRole('group', { name: longDate(lastMonth) })).toHaveTextContent(
      'Gi · 60 min',
    );

    // Changing month closes the day that was open.
    await user.click(within(card).getByRole('button', { name: 'Next month' }));
    expect(within(card).getByRole('heading', { name: monthTitle(today) })).toBeInTheDocument();
    expect(within(card).queryByRole('group', { name: longDate(lastMonth) })).not.toBeInTheDocument();

    await user.click(within(card).getByRole('button', { name: 'Next month' }));
    expect(within(card).getByRole('heading', { name: monthTitle(nextMonth) })).toBeInTheDocument();
    for (const date of [tripStart, addDays(tripStart, 1), tripEnd]) {
      expect(
        within(card).getByRole('button', { name: `${longDate(date)}: time off` }),
      ).toBeInTheDocument();
    }
    expect(
      within(card).getByRole('button', { name: `${longDate(addDays(tripEnd, 1))}: nothing logged` }),
    ).toBeInTheDocument();
    expect(
      within(card).getByRole('button', {
        name: `${longDate(addDays(nextMonth, 20))}: nothing logged`,
      }),
    ).toBeInTheDocument();
    await user.click(within(card).getByRole('button', { name: `${longDate(comp)}: competition` }));
    expect(within(card).getByRole('group', { name: longDate(comp) })).toHaveTextContent(
      'Competition: Winter Open',
    );
    await user.click(within(card).getByRole('button', { name: `${longDate(tripStart)}: time off` }));
    expect(within(card).getByRole('group', { name: longDate(tripStart) })).toHaveTextContent(
      'Time off (travel)',
    );

    await user.click(within(card).getByRole('button', { name: 'This month' }));
    expect(within(card).getByRole('heading', { name: monthTitle(today) })).toBeInTheDocument();
    expect(
      within(card).getByRole('button', { name: `${longDate(today)} (today): nothing logged` }),
    ).toBeInTheDocument();
  });

  it('hands focus to today when "This month" is used, and leaves browser shortcuts alone', async () => {
    const today = todayIso();
    const { user, card } = await openCalendar();
    await user.click(within(card).getByRole('button', { name: 'Previous month' }));
    const back = within(card).getByRole('button', { name: 'This month' });
    back.focus();
    await user.keyboard('{Enter}');
    // The button is gone now; focus must not fall back to the top of the page.
    expect(within(card).queryByRole('button', { name: 'This month' })).not.toBeInTheDocument();
    expect(document.activeElement).toHaveAccessibleName(
      `${longDate(today)} (today): nothing logged`,
    );

    // With a modifier held, the arrow keys belong to the browser (Alt+Left is Back).
    await user.keyboard('{Alt>}{ArrowLeft}{/Alt}{Control>}{Home}{/Control}{Meta>}{ArrowLeft}{/Meta}');
    expect(document.activeElement).toHaveAccessibleName(
      `${longDate(today)} (today): nothing logged`,
    );
  });

  it('caps the badge on a day with many sessions, and still says how many', async () => {
    const today = todayIso();
    seed({
      sessions: Array.from({ length: 12 }, (_, index) => ({
        id: `s${index}`,
        date: today,
        durationMinutes: 30,
        type: 'gi' as const,
      })),
    });
    const { card } = await openCalendar();
    const day = within(card).getByRole('button', { name: `${longDate(today)} (today): 12 sessions` });
    expect(day).toHaveTextContent('9+');
  });

  it('reaches every day from the keyboard, with one stop for Tab', async () => {
    const today = todayIso();
    const { user, card } = await openCalendar();
    const grid = within(card).getByRole('grid');

    // Only today takes Tab; the arrow keys move between days.
    const tabbable = within(grid)
      .getAllByRole('button')
      .filter((button) => button.tabIndex === 0);
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0]).toHaveAccessibleName(`${longDate(today)} (today): nothing logged`);

    tabbable[0].focus();
    await user.keyboard('{ArrowDown}');
    const nextWeek = addDays(today, 7);
    expect(document.activeElement).toHaveAccessibleName(`${longDate(nextWeek)}: nothing logged`);
    expect(within(card).getByRole('heading', { name: monthTitle(nextWeek) })).toBeInTheDocument();

    await user.keyboard('{ArrowUp}{Enter}');
    expect(document.activeElement).toHaveAccessibleName(
      `${longDate(today)} (today): nothing logged`,
    );
    expect(document.activeElement).toHaveAttribute('aria-pressed', 'true');
    expect(within(card).getByRole('group', { name: longDate(today) })).toHaveTextContent(
      'Nothing logged',
    );
  });
});

describe('App icons', () => {
  function iconLinks() {
    const href = (rel: string) =>
      document.head.querySelector(`link[rel="${rel}"]`)?.getAttribute('href');
    return [href('manifest'), href('apple-touch-icon'), href('icon')];
  }

  it('shows the current belt as the tab icon and the icon a new install would get', async () => {
    // The links index.html declares; the test page has none of its own.
    document.head.innerHTML =
      '<link rel="manifest" href="/manifest.webmanifest" />' +
      '<link rel="icon" type="image/svg+xml" href="/favicon.svg" />' +
      '<link rel="apple-touch-icon" href="/apple-touch-icon.png" />';
    try {
      const user = userEvent.setup();
      const first = render(<App />);
      expect(iconLinks()).toEqual(['/manifest.webmanifest', '/apple-touch-icon.png', '/favicon.svg']);

      await user.click(screen.getByRole('radio', { name: 'Blue' }));
      await user.click(screen.getByRole('radio', { name: '2 stripes' }));
      await user.click(screen.getByRole('button', { name: 'Save rank' }));
      expect(iconLinks()).toEqual([
        '/ranks/blue-2.webmanifest',
        '/ranks/blue-2-180.png',
        '/ranks/blue-2.svg',
      ]);

      await user.click(screen.getByRole('button', { name: 'Edit rank' }));
      await user.click(screen.getByRole('radio', { name: 'Black' }));
      await user.click(screen.getByRole('radio', { name: '6 degrees' }));
      await user.click(screen.getByRole('button', { name: 'Save rank' }));
      expect(iconLinks()).toEqual([
        '/ranks/black-6.webmanifest',
        '/ranks/black-6-180.png',
        '/ranks/black-6.svg',
      ]);

      // Opening the app again with a rank already stored.
      first.unmount();
      document.head.querySelector('link[rel="icon"]')?.setAttribute('href', '/favicon.svg');
      render(<App />);
      expect(iconLinks()[2]).toBe('/ranks/black-6.svg');
    } finally {
      document.head.innerHTML = '';
    }
  });
});
