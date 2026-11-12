import { useId, useState, type FormEvent } from 'react';
import {
  MAX_NAME_LENGTH,
  MAX_SUBMISSION_LENGTH,
  METHOD_LABELS,
  RESULT_LABELS,
  type MatchInput,
} from '../domain/competitions';
import {
  MATCH_METHODS,
  MATCH_RESULTS,
  type Match,
  type MatchMethod,
  type MatchResult,
} from '../domain/types';
import { ConfirmDelete } from './ConfirmDelete';

interface Props {
  /** The match being edited; omit to add a new one. */
  initial?: Match;
  /** Names the match for screen readers, e.g. "match 2 at Spring Open". */
  label: string;
  onSubmit(input: MatchInput): string | null;
  onCancel(): void;
  /** Offered only when editing. */
  onDelete?(): void;
}

export function MatchForm({ initial, label, onSubmit, onCancel, onDelete }: Props) {
  const id = useId();
  // Nothing is pre-selected for a new match, so a result is never recorded by accident.
  const [result, setResult] = useState<MatchResult | null>(initial?.result ?? null);
  const [method, setMethod] = useState<MatchMethod | null>(initial?.method ?? null);
  const [submission, setSubmission] = useState(initial?.submission ?? '');
  const [opponent, setOpponent] = useState(initial?.opponent ?? '');
  const [error, setError] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (result === null) {
      setError('Choose win, loss or draw.');
      return;
    }
    setError(onSubmit({ result, method: method ?? undefined, submission, opponent }));
  };

  return (
    <form className="form" onSubmit={submit} aria-label={initial ? 'Edit match' : 'Add match'}>
      <fieldset className="choices">
        <legend>Result</legend>
        <div className="choices__row">
          {MATCH_RESULTS.map((option) => (
            <label key={option} className="chip">
              <input
                type="radio"
                name={`${id}-result`}
                checked={result === option}
                onChange={() => setResult(option)}
              />
              {RESULT_LABELS[option]}
            </label>
          ))}
        </div>
      </fieldset>
      {result !== 'draw' && (
        <fieldset className="choices">
          <legend>Decided by</legend>
          <div className="choices__row">
            {MATCH_METHODS.map((option) => (
              <label key={option} className="chip">
                <input
                  type="radio"
                  name={`${id}-method`}
                  checked={method === option}
                  onChange={() => setMethod(option)}
                />
                {METHOD_LABELS[option]}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {result !== 'draw' && method === 'submission' && (
        <div className="field">
          <label htmlFor={`${id}-submission`}>
            Submission <span className="muted">(optional)</span>
          </label>
          <input
            id={`${id}-submission`}
            type="text"
            value={submission}
            maxLength={MAX_SUBMISSION_LENGTH}
            autoComplete="off"
            onChange={(event) => setSubmission(event.target.value)}
          />
        </div>
      )}
      <div className="field">
        <label htmlFor={`${id}-opponent`}>
          Opponent <span className="muted">(optional)</span>
        </label>
        <input
          id={`${id}-opponent`}
          type="text"
          value={opponent}
          maxLength={MAX_NAME_LENGTH}
          autoComplete="off"
          onChange={(event) => setOpponent(event.target.value)}
        />
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        <button type="submit" className="button button--primary">
          {initial ? 'Save changes' : 'Save match'}
        </button>
        <button type="button" className="button" onClick={onCancel}>
          Cancel
        </button>
        {onDelete && <ConfirmDelete label={label} onConfirm={onDelete} />}
      </div>
    </form>
  );
}
