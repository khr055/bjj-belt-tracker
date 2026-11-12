import {
  competitionRecord,
  formatMedals,
  formatMethods,
} from '../domain/competitions';
import type { Competition } from '../domain/types';

interface Props {
  competitions: Competition[];
  today: string;
}

function count(amount: number, singular: string, plural: string): string {
  return `${amount} ${amount === 1 ? singular : plural}`;
}

export function CompetitionRecordCard({ competitions, today }: Props) {
  const record = competitionRecord(competitions, today);
  const wins = formatMethods(record.winsBy);
  const losses = formatMethods(record.lossesBy);
  const medals = formatMedals(record.medals);

  return (
    <section className="card" aria-labelledby="record-heading">
      <h2 id="record-heading">Competition record</h2>
      <div className="stat" role="group" aria-label="Match record">
        <p className="eyebrow">Matches</p>
        <p className="stat__figures">
          <span className="stat__number">{record.wins}</span> {record.wins === 1 ? 'win' : 'wins'}
          <span className="stat__divider" aria-hidden="true">
            ·
          </span>
          <span className="stat__number">{record.losses}</span>{' '}
          {record.losses === 1 ? 'loss' : 'losses'}
          {record.draws > 0 && (
            <>
              <span className="stat__divider" aria-hidden="true">
                ·
              </span>
              <span className="stat__number">{record.draws}</span>{' '}
              {record.draws === 1 ? 'draw' : 'draws'}
            </>
          )}
        </p>
        <p className="muted">
          {count(record.matches, 'match', 'matches')} across{' '}
          {count(record.competitions, 'competition', 'competitions')}
        </p>
      </div>
      {(wins || losses || medals) && (
        <dl className="facts">
          {wins && (
            <div>
              <dt>Wins</dt>
              <dd>{wins}</dd>
            </div>
          )}
          {losses && (
            <div>
              <dt>Losses</dt>
              <dd>{losses}</dd>
            </div>
          )}
          {medals && (
            <div>
              <dt>Medals</dt>
              <dd>{medals}</dd>
            </div>
          )}
        </dl>
      )}
    </section>
  );
}
