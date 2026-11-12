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

    await user.type(within(list).getByLabelText('Search notes and techniques'), 'leg');
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
    addedOn: '2024-01-01',
  };
  const TRIANGLE: Technique = {
    id: 't2',
    name: 'Triangle',
    position: 'guard',
    status: 'landing',
    addedOn: '2024-01-01',
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
    expect(passing).toHaveTextContent('Learning · Not ticked on a session yet');
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
    await user.type(within(list).getByLabelText('Search notes and techniques'), 'triangle');
    expect(within(list).getByRole('status')).toHaveTextContent('Found 1 of 1 session');
    await user.clear(within(list).getByLabelText('Search notes and techniques'));
    await user.type(within(list).getByLabelText('Search notes and techniques'), 'kimura');
    expect(within(list).getByText('No sessions match.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Techniques' }));
    expect(screen.getByRole('list', { name: 'Guard passing' })).toHaveTextContent(
      `Drilling · Trained in 1 session · last on ${formatDate(todayIso())}`,
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
    expect(within(form).getByRole('checkbox', { name: 'Triangle' })).toBeChecked();
    await user.click(within(form).getByRole('checkbox', { name: 'Triangle' }));
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
    expect(stored().techniques[0]).toEqual({ ...KNEE_CUT, status: 'landing' });

    await user.click(screen.getByRole('button', { name: 'Delete Knee cut pass' }));
    await user.click(screen.getByRole('button', { name: 'Confirm delete Knee cut pass' }));
    expect(stored().techniques).toEqual([TRIANGLE]);
    expect(stored().sessions).toEqual([
      { id: 's1', date: '2024-05-01', durationMinutes: 60, type: 'gi' },
    ]);
  });

  it('shows what is being worked on and what has gone stale on the overview', () => {
    const today = todayIso();
    seed({
      techniques: [
        { ...KNEE_CUT, addedOn: addDays(today, -90) },
        { ...TRIANGLE, addedOn: addDays(today, -90) },
        { id: 't3', name: 'Armbar', position: 'guard', status: 'learning', addedOn: addDays(today, -90) },
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
      { id: 't1', name: 'Armbar', position: 'guard', status: 'drilling', addedOn: '2025-02-10' },
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
