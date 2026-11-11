import { useState, type FormEvent } from 'react';
import { formatDate, formatDuration } from '../domain/dates';
import { BELT_LABELS, formatRank } from '../domain/rank';
import type { Rank } from '../domain/types';
import { BeltGraphic } from './BeltGraphic';
import { RankPicker } from './RankPicker';

interface Props {
  rank: Rank | null;
  /** Earliest logged date at the current belt, when the history has one. */
  currentBeltSince: string | null;
  today: string;
  onSave(rank: Rank): string | null;
}

const STARTING_RANK: Rank = { belt: 'white', stripes: 0 };

export function RankCard({ rank, currentBeltSince, today, onSave }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Rank>(rank ?? STARTING_RANK);
  const [error, setError] = useState<string | null>(null);

  const startEditing = () => {
    setDraft(rank ?? STARTING_RANK);
    setError(null);
    setEditing(true);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const problem = onSave(draft);
    setError(problem);
    if (!problem) setEditing(false);
  };

  if (editing || rank === null) {
    return (
      <section className="card" aria-labelledby="rank-heading">
        <h2 id="rank-heading">{rank ? 'Edit your rank' : 'Set your current rank'}</h2>
        {!rank && <p className="muted">Tell the app where you stand today. You can change it later.</p>}
        <form className="form" onSubmit={submit}>
          <BeltGraphic rank={draft} />
          <RankPicker value={draft} onChange={setDraft} />
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="actions">
            <button type="submit" className="button button--primary">
              Save rank
            </button>
            {rank && (
              <button type="button" className="button" onClick={() => setEditing(false)}>
                Cancel
              </button>
            )}
          </div>
        </form>
      </section>
    );
  }

  return (
    <section className="card" aria-labelledby="rank-heading">
      <div className="card__header">
        <p className="eyebrow">Current rank</p>
        <button type="button" className="button button--small" onClick={startEditing}>
          Edit rank
        </button>
      </div>
      <BeltGraphic rank={rank} />
      <h2 id="rank-heading" className="rank-title">
        {formatRank(rank)}
      </h2>
      <p className="muted">
        {currentBeltSince
          ? `${formatDuration(currentBeltSince, today)} at ${BELT_LABELS[rank.belt].toLowerCase()} belt, since ${formatDate(currentBeltSince)}`
          : 'Log your promotions in the timeline to see your time at this belt.'}
      </p>
    </section>
  );
}
