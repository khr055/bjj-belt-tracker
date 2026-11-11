import { useId, useState, type FormEvent } from 'react';
import type { PromotionInput } from '../domain/promotions';
import type { Promotion, Rank } from '../domain/types';
import { RankPicker } from './RankPicker';

interface Props {
  /** The promotion being edited; omit to log a new one. */
  initial?: Promotion;
  /** Rank pre-selected for a new promotion. */
  suggestedRank: Rank;
  today: string;
  onSubmit(input: PromotionInput): string | null;
  onCancel(): void;
}

export function PromotionForm({ initial, suggestedRank, today, onSubmit, onCancel }: Props) {
  const id = useId();
  const [rank, setRank] = useState<Rank>(
    initial ? { belt: initial.belt, stripes: initial.stripes } : suggestedRank,
  );
  const [date, setDate] = useState(initial?.date ?? today);
  const [promotedBy, setPromotedBy] = useState(initial?.promotedBy ?? '');
  const [academy, setAcademy] = useState(initial?.academy ?? '');
  const [error, setError] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(onSubmit({ ...rank, date, promotedBy, academy }));
  };

  return (
    <form className="form" onSubmit={submit} aria-label={initial ? 'Edit promotion' : 'Log promotion'}>
      <RankPicker value={rank} onChange={setRank} />
      <p className="hint">White belt with no stripes marks the day you started training.</p>
      <div className="field">
        <label htmlFor={`${id}-date`}>Promotion date</label>
        <input
          id={`${id}-date`}
          type="date"
          value={date}
          max={today}
          required
          onChange={(event) => setDate(event.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor={`${id}-by`}>
          Promoted by <span className="muted">(optional)</span>
        </label>
        <input
          id={`${id}-by`}
          type="text"
          value={promotedBy}
          maxLength={80}
          autoComplete="off"
          onChange={(event) => setPromotedBy(event.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor={`${id}-academy`}>
          Academy <span className="muted">(optional)</span>
        </label>
        <input
          id={`${id}-academy`}
          type="text"
          value={academy}
          maxLength={80}
          autoComplete="off"
          onChange={(event) => setAcademy(event.target.value)}
        />
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        <button type="submit" className="button button--primary">
          {initial ? 'Save changes' : 'Save promotion'}
        </button>
        <button type="button" className="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
