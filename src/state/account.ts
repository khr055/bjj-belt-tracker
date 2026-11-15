import type { SupabaseClient } from '@supabase/supabase-js';
import { MEMBER_ROLES, type MemberRole } from '../domain/academy';
import { isValidRank } from '../domain/rank';
import type { Rank, Result } from '../domain/types';

/** An academy the signed-in person belongs to, and what they are in it. */
export interface Membership {
  academyId: string;
  academyName: string;
  role: MemberRole;
  /** The code to hand to someone joining. Only coaches and owners can read it. */
  joinCode?: string;
}

/** The signed-in person, as the database knows them. */
export interface Account {
  userId: string;
  email: string;
  name: string;
  /** Awarded by a coach; none until one has been. */
  rank: Rank | null;
  memberships: Membership[];
}

export const MAX_ACADEMY_NAME_LENGTH = 80;

const OFFLINE = "Couldn't reach the server. Check your connection and try again.";

/** Says what went wrong in words for the person, keeping the server's own only where they help. */
function explain(error: { message?: string; code?: string } | null, fallback: string): string {
  if (!error) return fallback;
  if (/failed to fetch|network|load failed/i.test(error.message ?? '')) return OFFLINE;
  // Raised by the database's own functions, which word their refusals for the person.
  if (error.code === 'P0002' || error.code === '42501') return error.message ?? fallback;
  return fallback;
}

interface MembershipRow {
  role: unknown;
  academy_id: unknown;
  academies: { name?: unknown } | { name?: unknown }[] | null;
}

/** Reads who the signed-in person is and which academies they are in. */
export async function loadAccount(
  client: SupabaseClient,
  user: { id: string; email?: string | null },
): Promise<Result<Account>> {
  const [profile, memberships, invites] = await Promise.all([
    client.from('profiles').select('display_name, belt, stripes').eq('id', user.id).maybeSingle(),
    client.from('memberships').select('role, academy_id, academies(name)').eq('user_id', user.id),
    // Row-level security returns the codes only for academies the person coaches or owns.
    client.from('academy_invites').select('academy_id, code'),
  ]);
  const failed = profile.error ?? memberships.error ?? invites.error;
  if (failed) return { ok: false, error: explain(failed, "Couldn't load your account.") };

  const codes = new Map(
    (invites.data ?? []).map((row: { academy_id: unknown; code: unknown }) => [
      String(row.academy_id),
      String(row.code),
    ]),
  );
  const rank = { belt: profile.data?.belt, stripes: profile.data?.stripes };
  return {
    ok: true,
    value: {
      userId: user.id,
      email: user.email ?? '',
      name: typeof profile.data?.display_name === 'string' ? profile.data.display_name : '',
      rank: isValidRank(rank) ? (rank as Rank) : null,
      memberships: ((memberships.data ?? []) as MembershipRow[])
        .filter((row) => MEMBER_ROLES.includes(row.role as MemberRole))
        .map((row) => {
          const academy = Array.isArray(row.academies) ? row.academies[0] : row.academies;
          const academyId = String(row.academy_id);
          const joinCode = codes.get(academyId);
          return {
            academyId,
            academyName: typeof academy?.name === 'string' ? academy.name : 'Academy',
            role: row.role as MemberRole,
            ...(joinCode ? { joinCode } : {}),
          };
        })
        .sort((a, b) => a.academyName.localeCompare(b.academyName)),
    },
  };
}

/** Sends the person to Google to sign in; they come back to the page they left. */
export async function signInWithGoogle(client: SupabaseClient, returnTo: string): Promise<string | null> {
  const { error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: returnTo },
  });
  return error ? explain(error, "Couldn't start signing in with Google.") : null;
}

/** Emails a link that signs the person in when they open it. */
export async function sendSignInLink(
  client: SupabaseClient,
  email: string,
  returnTo: string,
): Promise<string | null> {
  const address = email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return 'Enter your email address.';
  const { error } = await client.auth.signInWithOtp({
    email: address,
    options: { emailRedirectTo: returnTo },
  });
  if (!error) return null;
  if (/rate limit|only request this after/i.test(error.message)) {
    return 'A link was sent a moment ago. Check your inbox, or wait a minute and try again.';
  }
  return explain(error, "Couldn't send the sign-in link.");
}

export async function signOut(client: SupabaseClient): Promise<string | null> {
  const { error } = await client.auth.signOut();
  return error ? explain(error, "Couldn't sign out.") : null;
}

/** Starts an academy, with the person who made it as its owner. */
export async function createAcademy(client: SupabaseClient, name: string): Promise<string | null> {
  const tidy = name.trim();
  if (!tidy) return 'Enter a name for the academy.';
  if (tidy.length > MAX_ACADEMY_NAME_LENGTH) {
    return `Keep the name to ${MAX_ACADEMY_NAME_LENGTH} characters or fewer.`;
  }
  const { error } = await client.rpc('create_academy', { academy_name: tidy });
  return error ? explain(error, "Couldn't start the academy.") : null;
}

/** Joins the academy a code belongs to, as a student. */
export async function joinAcademy(client: SupabaseClient, code: string): Promise<string | null> {
  const tidy = code.trim();
  if (!tidy) return 'Enter the code your coach gave you.';
  const { error } = await client.rpc('join_academy', { invite_code: tidy });
  return error ? explain(error, "Couldn't join with that code.") : null;
}

/** Leaves an academy. The person's own training record stays theirs. */
export async function leaveAcademy(
  client: SupabaseClient,
  userId: string,
  academyId: string,
): Promise<string | null> {
  const { error } = await client
    .from('memberships')
    .delete()
    .eq('academy_id', academyId)
    .eq('user_id', userId);
  if (!error) return null;
  // The database refuses to leave an academy with no owner.
  if (error.code === '23514') return error.message;
  return explain(error, "Couldn't leave the academy.");
}

/** Changes the name shown to the person's coaches. */
export async function renameSelf(client: SupabaseClient, userId: string, name: string): Promise<string | null> {
  const tidy = name.trim();
  if (tidy.length > 80) return 'Keep your name to 80 characters or fewer.';
  const { error } = await client.from('profiles').update({ display_name: tidy }).eq('id', userId);
  return error ? explain(error, "Couldn't save your name.") : null;
}
