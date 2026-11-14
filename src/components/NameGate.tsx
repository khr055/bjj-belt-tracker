import { useId, useState, type FormEvent } from 'react';
import { isExpectedName } from '../domain/gate';

interface Props {
  onLetIn: () => void;
}

/** The first screen: nothing of the app is shown until the question is answered correctly. */
export function NameGate({ onLetIn }: Props) {
  const id = useId();
  const [name, setName] = useState('');
  const [refused, setRefused] = useState(false);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (isExpectedName(name)) onLetIn();
    else setRefused(true);
  };

  return (
    <div className="app">
      <main className="app__main">
        <form className="card form" aria-label="Who are you?" onSubmit={submit}>
          <div className="field">
            <label htmlFor={`${id}-name`}>What is your name?</label>
            <input
              id={`${id}-name`}
              type="text"
              autoComplete="off"
              autoFocus
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setRefused(false);
              }}
            />
          </div>
          {refused && (
            <p className="error" role="alert">
              Sorry, this site is private.
            </p>
          )}
          <button type="submit" className="button button--primary">
            Enter
          </button>
        </form>
      </main>
    </div>
  );
}
