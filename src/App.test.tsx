import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from './App';
import type { AppData } from './domain/types';
import { STORAGE_KEY } from './state/storage';

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
