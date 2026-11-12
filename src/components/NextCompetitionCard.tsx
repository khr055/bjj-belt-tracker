import { formatCountdown } from '../domain/competitions';
import type { Competition } from '../domain/types';
import { competitionDetails } from './CompetitionsView';

interface Props {
  competition: Competition;
  today: string;
}

export function NextCompetitionCard({ competition, today }: Props) {
  return (
    <section className="card" aria-labelledby="next-competition-heading">
      <h2 id="next-competition-heading">Next competition</h2>
      <div className="stat">
        <p className="stat__number">{formatCountdown(competition.date, today)}</p>
        <p className="list__detail">
          <strong>{competition.name}</strong>
        </p>
        <p className="muted list__detail">{competitionDetails(competition)}</p>
      </div>
    </section>
  );
}
