import { useCallback, useEffect, useState } from 'react';
import {
  createAcademy,
  joinAcademy,
  leaveAcademy,
  loadAccount,
  renameSelf,
  sendSignInLink,
  signInWithGoogle,
  signOut,
  type Account,
} from './account';
import { supabase } from './supabase';

export type AccountState =
  /** No database is set up for this build: the app works on this device alone. */
  | { status: 'off' }
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; account: Account }
  /** Signed in, but the account could not be read. */
  | { status: 'failed'; error: string };

/** Each returns an error message, or null when it worked. */
export interface AccountActions {
  signInWithGoogle(): Promise<string | null>;
  sendSignInLink(email: string): Promise<string | null>;
  signOut(): Promise<string | null>;
  createAcademy(name: string): Promise<string | null>;
  joinAcademy(code: string): Promise<string | null>;
  leaveAcademy(academyId: string): Promise<string | null>;
  rename(name: string): Promise<string | null>;
  retry(): void;
}

/** Where sign-in brings the person back to: the app as they opened it, without a stale token. */
function returnTo(): string {
  return window.location.origin + window.location.pathname;
}

/** Who is signed in, kept current as they sign in and out, in this tab or another. */
export function useAccount(): { state: AccountState; actions: AccountActions } {
  const [state, setState] = useState<AccountState>(supabase ? { status: 'loading' } : { status: 'off' });
  const [user, setUser] = useState<{ id: string; email?: string | null } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!supabase) return;
    // Fires once with the session found at start-up, then on every sign-in and sign-out.
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const next = session?.user ?? null;
      // A refreshed token is the same person; reloading their account for it would flicker.
      setUser((current) => (current?.id === next?.id ? current : next));
      if (!next) setState({ status: 'signed-out' });
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || !user) return;
    let current = true;
    void loadAccount(supabase, user).then((result) => {
      if (!current) return;
      setState(result.ok ? { status: 'signed-in', account: result.value } : { status: 'failed', error: result.error });
    });
    return () => {
      current = false;
    };
  }, [user, attempt]);

  const reload = useCallback(() => setAttempt((count) => count + 1), []);

  /** Runs a change and, when it worked, reads the account again so the screen shows it. */
  const then = async (change: Promise<string | null>): Promise<string | null> => {
    const error = await change;
    if (!error) reload();
    return error;
  };

  const client = supabase;
  const off = async () => 'Signing in is not set up in this copy of the app.';
  const actions: AccountActions = client
    ? {
        signInWithGoogle: () => signInWithGoogle(client, returnTo()),
        sendSignInLink: (email) => sendSignInLink(client, email, returnTo()),
        signOut: () => signOut(client),
        createAcademy: (name) => then(createAcademy(client, name)),
        joinAcademy: (code) => then(joinAcademy(client, code)),
        leaveAcademy: (academyId) => then(user ? leaveAcademy(client, user.id, academyId) : off()),
        rename: (name) => then(user ? renameSelf(client, user.id, name) : off()),
        retry: reload,
      }
    : {
        signInWithGoogle: off,
        sendSignInLink: off,
        signOut: off,
        createAcademy: off,
        joinAcademy: off,
        leaveAcademy: off,
        rename: off,
        retry: () => undefined,
      };

  return { state, actions };
}
