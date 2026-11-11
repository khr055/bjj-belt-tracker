import { useState } from 'react';
import { formatDate, formatDuration } from '../domain/dates';
import type { PromotionInput } from '../domain/promotions';
import { BELT_LABELS, formatRank, nextRank } from '../domain/rank';
import { buildTimeline, type BeltSpan, type TimelineEntry } from '../domain/timeline';
import type { AppData, Rank } from '../domain/types';
import { BeltGraphic } from './BeltGraphic';
import { ConfirmDelete } from './ConfirmDelete';
import { PromotionForm } from './PromotionForm';

interface Props {
  data: AppData;
  today: string;
  onAdd(input: PromotionInput): string | null;
  onUpdate(id: string, input: PromotionInput): string | null;
  onDelete(id: string): void;
}

type Mode = { kind: 'idle' } | { kind: 'add' } | { kind: 'edit'; id: string };

function entryTitle(entry: TimelineEntry): string {
  return entry.kind === 'start' ? 'Started training' : formatRank(entry.promotion);
}

function entryDuration(entry: TimelineEntry): string {
  if (entry.endDate === null) return 'Next promotion not logged';
  const length = formatDuration(entry.promotion.date, entry.endDate);
  return entry.ongoing ? `${length} so far` : length;
}

function spanDuration(span: BeltSpan): string {
  if (span.endDate === null) return 'Next belt not logged';
  const length = formatDuration(span.startDate, span.endDate);
  return span.ongoing ? `${length} so far` : length;
}

function spanDates(span: BeltSpan): string {
  if (span.ongoing) return `${formatDate(span.startDate)} to today`;
  if (span.endDate === null) return `From ${formatDate(span.startDate)}`;
  return `${formatDate(span.startDate)} to ${formatDate(span.endDate)}`;
}

export function TimelineView({ data, today, onAdd, onUpdate, onDelete }: Props) {
  const [mode, setMode] = useState<Mode>({ kind: 'idle' });
  const timeline = buildTimeline(data.promotions, data.rank, today);
  const newestFirst = [...timeline.entries].reverse();

  // Suggest the undated current rank first; otherwise the next step up.
  const startingRank: Rank = { belt: 'white', stripes: 0 };
  const suggestedRank =
    data.rank === null
      ? startingRank
      : timeline.currentRankUndated
        ? data.rank
        : nextRank(data.rank);

  const closeOnSuccess = (problem: string | null) => {
    if (!problem) setMode({ kind: 'idle' });
    return problem;
  };

  return (
    <>
      <section className="card" aria-labelledby="timeline-heading">
        <div className="card__header">
          <h2 id="timeline-heading">Belt timeline</h2>
          {mode.kind !== 'add' && (
            <button
              type="button"
              className="button button--primary button--small"
              onClick={() => setMode({ kind: 'add' })}
            >
              Log promotion
            </button>
          )}
        </div>

        {mode.kind === 'add' && (
          <PromotionForm
            suggestedRank={suggestedRank}
            today={today}
            onSubmit={(input) => closeOnSuccess(onAdd(input))}
            onCancel={() => setMode({ kind: 'idle' })}
          />
        )}

        {timeline.entries.length === 0 && mode.kind !== 'add' && (
          <p className="muted">
            No promotions logged yet. Add each stripe and belt with its date, including ones from
            years ago, to build your timeline.
          </p>
        )}

        {timeline.entries.length > 0 && timeline.currentRankUndated && data.rank && (
          <p className="notice">
            Your current rank, {formatRank(data.rank)}, has no promotion date yet. Log it to complete
            your timeline.
          </p>
        )}
      </section>

      {timeline.belts.length > 0 && (
        <section className="card" aria-labelledby="belts-heading">
          <h2 id="belts-heading">Time at each belt</h2>
          <ul className="list">
            {timeline.belts.map((span) => (
              <li key={span.belt} className="list__item list__item--belt">
                <BeltGraphic rank={{ belt: span.belt, stripes: 0 }} size="small" />
                <div className="list__main">
                  <strong>{BELT_LABELS[span.belt]} belt</strong>
                  <span className="muted">{spanDates(span)}</span>
                </div>
                <span className="list__value">{spanDuration(span)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {newestFirst.length > 0 && (
        <section className="card" aria-labelledby="promotions-heading">
          <h2 id="promotions-heading">Promotions</h2>
          <ol className="list" reversed>
            {newestFirst.map((entry) => {
              const { promotion } = entry;
              if (mode.kind === 'edit' && mode.id === promotion.id) {
                return (
                  <li key={promotion.id} className="list__item list__item--editing">
                    <PromotionForm
                      initial={promotion}
                      suggestedRank={promotion}
                      today={today}
                      onSubmit={(input) => closeOnSuccess(onUpdate(promotion.id, input))}
                      onCancel={() => setMode({ kind: 'idle' })}
                    />
                  </li>
                );
              }
              const credit = [
                promotion.promotedBy && `Promoted by ${promotion.promotedBy}`,
                promotion.academy,
              ]
                .filter(Boolean)
                .join(' · ');
              return (
                <li key={promotion.id} className="list__item list__item--stacked">
                  <div className="list__row">
                    <BeltGraphic rank={promotion} size="small" />
                    <div className="list__main">
                      <strong>{entryTitle(entry)}</strong>
                      <span className="muted">{formatDate(promotion.date)}</span>
                    </div>
                    <span className="list__value">{entryDuration(entry)}</span>
                  </div>
                  {credit && <p className="muted list__detail">{credit}</p>}
                  <div className="actions actions--tight">
                    <button
                      type="button"
                      className="button button--small"
                      aria-label={`Edit ${entryTitle(entry)}`}
                      onClick={() => setMode({ kind: 'edit', id: promotion.id })}
                    >
                      Edit
                    </button>
                    <ConfirmDelete
                      label={entryTitle(entry)}
                      onConfirm={() => onDelete(promotion.id)}
                    />
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </>
  );
}
