import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Account } from '../state/account';
import type { AccountActions } from '../state/useAccount';
import { AccountView } from './AccountView';

function actions(overrides: Partial<AccountActions> = {}): AccountActions {
  const ok = async () => null;
  return {
    signInWithGoogle: vi.fn(ok),
    sendSignInLink: vi.fn(ok),
    signOut: vi.fn(ok),
    createAcademy: vi.fn(ok),
    joinAcademy: vi.fn(ok),
    leaveAcademy: vi.fn(ok),
    rename: vi.fn(ok),
    retry: vi.fn(),
    ...overrides,
  };
}

const SAM: Account = {
  userId: 'u1',
  email: 'sam@example.test',
  name: 'Sam',
  rank: { belt: 'blue', stripes: 2 },
  memberships: [],
};

describe('AccountView', () => {
  it('shows nothing where signing in is not set up, and says so while it is checking', () => {
    const { container, rerender } = render(<AccountView state={{ status: 'off' }} actions={actions()} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<AccountView state={{ status: 'loading' }} actions={actions()} />);
    expect(screen.getByRole('status')).toHaveTextContent('Checking whether you are signed in');
  });

  it('signs in with Google, or by a link sent to an email address', async () => {
    const user = userEvent.setup();
    const acts = actions();
    render(<AccountView state={{ status: 'signed-out' }} actions={acts} />);

    await user.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(acts.signInWithGoogle).toHaveBeenCalledOnce();

    const form = screen.getByRole('form', { name: 'Email me a sign-in link' });
    await user.type(within(form).getByLabelText('Email address'), 'sam@example.test');
    await user.click(within(form).getByRole('button', { name: 'Email me a sign-in link' }));
    expect(acts.sendSignInLink).toHaveBeenCalledWith('sam@example.test');
    expect(within(form).getByRole('status')).toHaveTextContent('Sent. Check your inbox.');
  });

  it('says why signing in could not start, and lets it be tried again', async () => {
    const user = userEvent.setup();
    const acts = actions({ signInWithGoogle: vi.fn(async () => "Couldn't start signing in with Google.") });
    render(<AccountView state={{ status: 'signed-out' }} actions={acts} />);
    await user.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't start signing in with Google.");
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeEnabled();
  });

  it('shows who is signed in and their rank, and joins an academy by code', async () => {
    const user = userEvent.setup();
    const acts = actions({
      joinAcademy: vi.fn(async (code: string) => (code === 'good' ? null : 'That code does not match an academy.')),
    });
    render(<AccountView state={{ status: 'signed-in', account: SAM }} actions={acts} />);

    const card = screen.getByRole('region', { name: 'Your account' });
    expect(card).toHaveTextContent('sam@example.test');
    expect(card).toHaveTextContent('Blue belt, 2 stripes');
    expect(within(card).getByLabelText('Name your coaches see')).toHaveValue('Sam');
    expect(screen.getByRole('region', { name: 'Your academy' })).toHaveTextContent(
      'You are not in an academy yet.',
    );

    const join = screen.getByRole('form', { name: 'Join' });
    await user.type(within(join).getByLabelText('Joining code'), 'bad');
    await user.click(within(join).getByRole('button', { name: 'Join' }));
    expect(within(join).getByRole('alert')).toHaveTextContent('That code does not match an academy.');
    await user.clear(within(join).getByLabelText('Joining code'));
    await user.type(within(join).getByLabelText('Joining code'), 'good');
    await user.click(within(join).getByRole('button', { name: 'Join' }));
    expect(within(join).queryByRole('alert')).not.toBeInTheDocument();
    expect(within(join).getByRole('status')).toHaveTextContent('Joined.');
  });

  it('lists academies with the role, shows the code only to those who have it, and leaves one', async () => {
    const user = userEvent.setup();
    const acts = actions();
    const account: Account = {
      ...SAM,
      rank: null,
      memberships: [
        { academyId: 'a1', academyName: 'Ana BJJ', role: 'owner', joinCode: 'abc123' },
        { academyId: 'a2', academyName: 'Zen BJJ', role: 'student' },
      ],
    };
    render(<AccountView state={{ status: 'signed-in', account }} actions={acts} />);

    expect(screen.getByRole('region', { name: 'Your account' })).toHaveTextContent(
      'None yet: a coach awards it',
    );
    const [owned, joined] = within(screen.getByRole('region', { name: 'Your academy' })).getAllByRole(
      'listitem',
    );
    expect(owned).toHaveTextContent('Ana BJJ');
    expect(owned).toHaveTextContent('Owner');
    expect(within(owned).getByLabelText('Joining code for Ana BJJ')).toHaveTextContent('abc123');
    expect(joined).toHaveTextContent('Student');
    expect(within(joined).queryByLabelText(/Joining code/)).not.toBeInTheDocument();

    await user.click(within(joined).getByRole('button', { name: 'Delete your membership of Zen BJJ' }));
    await user.click(
      within(joined).getByRole('button', { name: 'Confirm delete your membership of Zen BJJ' }),
    );
    expect(acts.leaveAcademy).toHaveBeenCalledWith('a2');
  });

  it('starts an academy, saves a name and signs out', async () => {
    const user = userEvent.setup();
    const acts = actions();
    render(<AccountView state={{ status: 'signed-in', account: SAM }} actions={acts} />);

    const start = screen.getByRole('form', { name: 'Start academy' });
    await user.type(within(start).getByLabelText('Academy name'), 'Riverside BJJ');
    await user.click(within(start).getByRole('button', { name: 'Start academy' }));
    expect(acts.createAcademy).toHaveBeenCalledWith('Riverside BJJ');

    const name = screen.getByRole('form', { name: 'Save name' });
    await user.clear(within(name).getByLabelText('Name your coaches see'));
    await user.type(within(name).getByLabelText('Name your coaches see'), 'Sam Jones');
    await user.click(within(name).getByRole('button', { name: 'Save name' }));
    expect(acts.rename).toHaveBeenCalledWith('Sam Jones');

    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(acts.signOut).toHaveBeenCalledOnce();
  });

  it('offers to try again, or sign out, when the account cannot be read', async () => {
    const user = userEvent.setup();
    const acts = actions();
    render(<AccountView state={{ status: 'failed', error: "Couldn't load your account." }} actions={acts} />);
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load your account.");
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(acts.retry).toHaveBeenCalledOnce();
  });
});
