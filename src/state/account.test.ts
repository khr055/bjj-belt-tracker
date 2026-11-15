import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import {
  createAcademy,
  joinAcademy,
  leaveAcademy,
  loadAccount,
  renameSelf,
  sendSignInLink,
  signInWithGoogle,
} from './account';

type Reply = { data?: unknown; error?: { message?: string; code?: string } | null };

/**
 * Stands in for the database connection: answers each table and function with what the test
 * gives it, and keeps a note of what was asked.
 */
function fakeClient(replies: Record<string, Reply>) {
  const calls: unknown[][] = [];
  const answer = (name: string): Reply => ({ data: null, error: null, ...replies[name] });
  const query = (name: string) => {
    const reply = Promise.resolve(answer(name));
    const chain: Record<string, unknown> = {
      then: reply.then.bind(reply),
      maybeSingle: () => reply,
    };
    for (const step of ['select', 'eq', 'delete', 'update']) {
      chain[step] = (...args: unknown[]) => {
        calls.push([name, step, ...args]);
        return chain;
      };
    }
    return chain;
  };
  const client = {
    from: (table: string) => query(table),
    rpc: (name: string, args: unknown) => {
      calls.push(['rpc', name, args]);
      return Promise.resolve(answer(`rpc:${name}`));
    },
    auth: {
      signInWithOAuth: (args: unknown) => {
        calls.push(['oauth', args]);
        return Promise.resolve(answer('oauth'));
      },
      signInWithOtp: (args: unknown) => {
        calls.push(['otp', args]);
        return Promise.resolve(answer('otp'));
      },
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

const USER = { id: 'u1', email: 'sam@example.test' };

describe('loadAccount', () => {
  it('reads the person, their rank and their academies, with the code where they may see it', async () => {
    const { client } = fakeClient({
      profiles: { data: { display_name: 'Sam', belt: 'blue', stripes: 2 } },
      memberships: {
        data: [
          { role: 'student', academy_id: 'a2', academies: { name: 'Zen BJJ' } },
          { role: 'owner', academy_id: 'a1', academies: [{ name: 'Ana BJJ' }] },
          // A role the app does not know is left out, not guessed at.
          { role: 'janitor', academy_id: 'a3', academies: { name: 'Other' } },
        ],
      },
      academy_invites: { data: [{ academy_id: 'a1', code: 'abc123' }] },
    });
    const result = await loadAccount(client, USER);
    expect(result).toEqual({
      ok: true,
      value: {
        userId: 'u1',
        email: 'sam@example.test',
        name: 'Sam',
        rank: { belt: 'blue', stripes: 2 },
        memberships: [
          { academyId: 'a1', academyName: 'Ana BJJ', role: 'owner', joinCode: 'abc123' },
          { academyId: 'a2', academyName: 'Zen BJJ', role: 'student' },
        ],
      },
    });
  });

  it('has no rank until a coach awards one, and none for a rank that cannot be right', async () => {
    const none = fakeClient({ profiles: { data: { display_name: '', belt: null, stripes: null } } });
    const first = await loadAccount(none.client, { id: 'u1' });
    expect(first.ok && first.value).toMatchObject({ rank: null, name: '', email: '', memberships: [] });

    const odd = fakeClient({ profiles: { data: { display_name: 'X', belt: 'white', stripes: 9 } } });
    const second = await loadAccount(odd.client, USER);
    expect(second.ok && second.value.rank).toBeNull();
  });

  it('says so when the account cannot be read', async () => {
    const { client } = fakeClient({ memberships: { error: { message: 'boom', code: 'XX000' } } });
    expect(await loadAccount(client, USER)).toEqual({ ok: false, error: "Couldn't load your account." });

    const offline = fakeClient({ profiles: { error: { message: 'TypeError: Failed to fetch' } } });
    const result = await loadAccount(offline.client, USER);
    expect(!result.ok && result.error).toContain('Check your connection');
  });
});

describe('signing in', () => {
  it('sends the person to Google and back to where they were', async () => {
    const { client, calls } = fakeClient({});
    expect(await signInWithGoogle(client, 'https://app.example/')).toBeNull();
    expect(calls).toEqual([
      ['oauth', { provider: 'google', options: { redirectTo: 'https://app.example/' } }],
    ]);
  });

  it('emails a link to a real-looking address only', async () => {
    const { client, calls } = fakeClient({});
    expect(await sendSignInLink(client, 'not an email', 'https://app.example/')).toBe(
      'Enter your email address.',
    );
    expect(calls).toEqual([]);
    expect(await sendSignInLink(client, '  sam@example.test ', 'https://app.example/')).toBeNull();
    expect(calls).toEqual([
      ['otp', { email: 'sam@example.test', options: { emailRedirectTo: 'https://app.example/' } }],
    ]);
  });

  it('explains being asked for a link again too soon', async () => {
    const { client } = fakeClient({
      otp: { error: { message: 'For security purposes, you can only request this after 42 seconds.' } },
    });
    expect(await sendSignInLink(client, 'sam@example.test', 'x')).toContain('sent a moment ago');
  });
});

describe('academies', () => {
  it('starts one with a tidy name, and refuses a blank or over-long one before asking', async () => {
    const { client, calls } = fakeClient({});
    expect(await createAcademy(client, '   ')).toBe('Enter a name for the academy.');
    expect(await createAcademy(client, 'x'.repeat(81))).toContain('80 characters');
    expect(calls).toEqual([]);
    expect(await createAcademy(client, '  Riverside BJJ ')).toBeNull();
    expect(calls).toEqual([['rpc', 'create_academy', { academy_name: 'Riverside BJJ' }]]);
  });

  it('joins with a code, and passes on what the database says about a wrong one', async () => {
    const wrong = fakeClient({
      'rpc:join_academy': { error: { code: 'P0002', message: 'That code does not match an academy.' } },
    });
    expect(await joinAcademy(wrong.client, 'nope')).toBe('That code does not match an academy.');
    expect(await joinAcademy(wrong.client, '  ')).toBe('Enter the code your coach gave you.');

    const right = fakeClient({});
    expect(await joinAcademy(right.client, ' ABC123 ')).toBeNull();
    expect(right.calls).toEqual([['rpc', 'join_academy', { invite_code: 'ABC123' }]]);
  });

  it('keeps an unexpected server error to itself', async () => {
    const { client } = fakeClient({
      'rpc:join_academy': { error: { code: '57014', message: 'canceling statement due to timeout' } },
    });
    expect(await joinAcademy(client, 'abc')).toBe("Couldn't join with that code.");
  });

  it('leaves an academy, and says why the last owner cannot', async () => {
    const { client, calls } = fakeClient({});
    expect(await leaveAcademy(client, 'u1', 'a1')).toBeNull();
    expect(calls).toEqual([
      ['memberships', 'delete'],
      ['memberships', 'eq', 'academy_id', 'a1'],
      ['memberships', 'eq', 'user_id', 'u1'],
    ]);
    const owner = fakeClient({
      memberships: { error: { code: '23514', message: 'An academy needs at least one owner.' } },
    });
    expect(await leaveAcademy(owner.client, 'u1', 'a1')).toBe('An academy needs at least one owner.');
  });

  it('saves the name a coach sees', async () => {
    const { client, calls } = fakeClient({});
    expect(await renameSelf(client, 'u1', '  Sam Jones ')).toBeNull();
    expect(calls).toEqual([
      ['profiles', 'update', { display_name: 'Sam Jones' }],
      ['profiles', 'eq', 'id', 'u1'],
    ]);
    expect(await renameSelf(client, 'u1', 'x'.repeat(81))).toContain('80 characters');
  });
});
