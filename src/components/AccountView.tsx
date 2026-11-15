import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { ROLE_LABELS } from '../domain/academy';
import { formatRank } from '../domain/rank';
import { MAX_ACADEMY_NAME_LENGTH, type Account, type Membership } from '../state/account';
import type { AccountActions, AccountState } from '../state/useAccount';
import { ConfirmDelete } from './ConfirmDelete';

interface Props {
  state: AccountState;
  actions: AccountActions;
}

interface AskProps {
  label: string;
  hint?: string;
  button: string;
  /** What to say once it has worked, if anything. */
  done?: string;
  type?: 'text' | 'email';
  initial?: string;
  maxLength?: number;
  /** Returns an error message, or null when it worked. */
  onSubmit(value: string): Promise<string | null>;
}

/** One box and one button, for something sent to the server: shows it working, then how it went. */
function Ask({ label, hint, button, done, type = 'text', initial = '', maxLength, onSubmit }: AskProps) {
  const id = useId();
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const problem = await onSubmit(value);
    setBusy(false);
    setError(problem);
    if (!problem) setMessage(done ?? null);
  };

  return (
    <form className="form" onSubmit={submit} aria-label={button}>
      <div className="field">
        <label htmlFor={id}>{label}</label>
        <input
          id={id}
          type={type}
          value={value}
          maxLength={maxLength}
          autoComplete={type === 'email' ? 'email' : 'off'}
          autoCapitalize={type === 'email' ? 'none' : undefined}
          required
          aria-describedby={hint ? `${id}-hint` : undefined}
          onChange={(event) => setValue(event.target.value)}
        />
        {hint && (
          <p className="hint" id={`${id}-hint`}>
            {hint}
          </p>
        )}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        <button type="submit" className="button button--primary" disabled={busy}>
          {busy ? 'Working…' : button}
        </button>
        <span className="saved" role="status">
          {message}
        </span>
      </div>
    </form>
  );
}

function Card({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="card" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      {children}
    </section>
  );
}

function SignIn({ actions }: { actions: AccountActions }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const google = async () => {
    setBusy(true);
    // When this works the page leaves for Google, so there is nothing more to show here.
    const problem = await actions.signInWithGoogle();
    setError(problem);
    if (problem) setBusy(false);
  };

  return (
    <>
      <Card id="sign-in-heading" title="Sign in">
        <p className="muted">
          Sign in to join your academy. Your coach can then see your rank and attendance, and
          record your promotions. Everything else you log stays yours alone.
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="actions">
          <button type="button" className="button button--primary" disabled={busy} onClick={google}>
            {busy ? 'Opening Google…' : 'Continue with Google'}
          </button>
        </div>
      </Card>
      <Card id="email-link-heading" title="No Google account?">
        <Ask
          label="Email address"
          hint="We email you a link. Open it on this device to sign in; there is no password."
          button="Email me a sign-in link"
          done="Sent. Check your inbox."
          type="email"
          onSubmit={actions.sendSignInLink}
        />
      </Card>
      <p className="hint">
        For now your training record stays on this device whether or not you sign in. Signing in
        only connects you to your academy.
      </p>
    </>
  );
}

function MembershipRow({ membership, onLeave }: { membership: Membership; onLeave(): Promise<string | null> }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <li className="list__item list__item--stacked">
      <div className="list__row">
        <div className="list__main">
          <strong className="list__detail">{membership.academyName}</strong>
          <span className="muted">{ROLE_LABELS[membership.role]}</span>
        </div>
      </div>
      {membership.joinCode && (
        <>
          <p className="join-code" aria-label={`Joining code for ${membership.academyName}`}>
            {membership.joinCode}
          </p>
          <p className="hint">Give this code to people joining. They sign in and enter it.</p>
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="actions actions--tight">
        <ConfirmDelete
          label={`your membership of ${membership.academyName}`}
          onConfirm={async () => setError(await onLeave())}
        />
      </div>
    </li>
  );
}

function SignedIn({ account, actions }: { account: Account; actions: AccountActions }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Card id="account-heading" title="Your account">
        <dl className="facts">
          <div>
            <dt>Signed in as</dt>
            <dd>{account.email || 'Unknown'}</dd>
          </div>
          <div>
            <dt>Rank on record</dt>
            <dd>{account.rank ? formatRank(account.rank) : 'None yet: a coach awards it'}</dd>
          </div>
        </dl>
        <Ask
          label="Name your coaches see"
          button="Save name"
          done="Saved."
          initial={account.name}
          maxLength={80}
          onSubmit={actions.rename}
        />
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="actions">
          <button type="button" className="button" onClick={async () => setError(await actions.signOut())}>
            Sign out
          </button>
        </div>
      </Card>

      <Card id="academies-heading" title="Your academy">
        {account.memberships.length === 0 ? (
          <p className="muted">
            You are not in an academy yet. Join with the code your coach gave you, or start one if
            you run it.
          </p>
        ) : (
          <ul className="list" aria-labelledby="academies-heading">
            {account.memberships.map((membership) => (
              <MembershipRow
                key={membership.academyId}
                membership={membership}
                onLeave={() => actions.leaveAcademy(membership.academyId)}
              />
            ))}
          </ul>
        )}
      </Card>

      <Card id="join-heading" title="Join an academy">
        <Ask
          label="Joining code"
          hint="Your coach has this code."
          button="Join"
          done="Joined."
          onSubmit={actions.joinAcademy}
        />
      </Card>

      <Card id="start-heading" title="Start an academy">
        <Ask
          label="Academy name"
          hint="For the person who runs it. You become its owner and get a code to hand out."
          button="Start academy"
          done="Started."
          maxLength={MAX_ACADEMY_NAME_LENGTH}
          onSubmit={actions.createAcademy}
        />
      </Card>
    </>
  );
}

/** Signing in, and the academies the signed-in person belongs to. */
export function AccountView({ state, actions }: Props) {
  if (state.status === 'off') return null;
  if (state.status === 'loading') {
    return (
      <section className="card">
        <p className="muted" role="status">
          Checking whether you are signed in…
        </p>
      </section>
    );
  }
  if (state.status === 'failed') {
    return (
      <section className="card">
        <p className="error" role="alert">
          {state.error}
        </p>
        <div className="actions">
          <button type="button" className="button button--primary" onClick={actions.retry}>
            Try again
          </button>
          <button type="button" className="button" onClick={() => void actions.signOut()}>
            Sign out
          </button>
        </div>
      </section>
    );
  }
  return state.status === 'signed-in' ? (
    <SignedIn account={state.account} actions={actions} />
  ) : (
    <SignIn actions={actions} />
  );
}
