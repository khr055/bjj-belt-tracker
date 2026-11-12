import { useState } from 'react';
import {
  describeMatch,
  formatCountdown,
  formatTally,
  isUpcoming,
  MAX_MATCHES,
  MEDAL_LABELS,
  pastCompetitions,
  tally,
  upcomingCompetitions,
  type CompetitionInput,
  type MatchInput,
} from '../domain/competitions';
import { formatDate } from '../domain/dates';
import { SESSION_TYPE_LABELS } from '../domain/sessions';
import type { Competition } from '../domain/types';
import { CompetitionForm } from './CompetitionForm';
import { CompetitionRecordCard } from './CompetitionRecordCard';
import { ConfirmDelete } from './ConfirmDelete';
import { MatchForm } from './MatchForm';

interface Props {
  competitions: Competition[];
  today: string;
  onAdd(input: CompetitionInput): string | null;
  onUpdate(id: string, input: CompetitionInput): string | null;
  onDelete(id: string): void;
  onAddMatch(competitionId: string, input: MatchInput): string | null;
  onUpdateMatch(competitionId: string, matchId: string, input: MatchInput): string | null;
  onDeleteMatch(competitionId: string, matchId: string): void;
}

type Mode =
  | { kind: 'idle' }
  | { kind: 'add' }
  | { kind: 'edit'; id: string }
  | { kind: 'add-match'; competitionId: string }
  | { kind: 'edit-match'; competitionId: string; matchId: string };

const IDLE: Mode = { kind: 'idle' };

/** Date, type, division and medal on one line. */
export function competitionDetails(competition: Competition): string {
  return [
    formatDate(competition.date),
    SESSION_TYPE_LABELS[competition.type],
    competition.division,
    competition.medal && `${MEDAL_LABELS[competition.medal]} medal`,
  ]
    .filter(Boolean)
    .join(' · ');
}

export function CompetitionsView({
  competitions,
  today,
  onAdd,
  onUpdate,
  onDelete,
  onAddMatch,
  onUpdateMatch,
  onDeleteMatch,
}: Props) {
  const [mode, setMode] = useState<Mode>(IDLE);
  const upcoming = upcomingCompetitions(competitions, today);
  const past = pastCompetitions(competitions, today);

  const closeOnSuccess = (problem: string | null) => {
    if (!problem) setMode(IDLE);
    return problem;
  };

  const renderCompetition = (competition: Competition) => {
    const { id, name, matches } = competition;
    if (mode.kind === 'edit' && mode.id === id) {
      return (
        <li key={id} className="list__item list__item--editing">
          <CompetitionForm
            initial={competition}
            today={today}
            onSubmit={(input) => closeOnSuccess(onUpdate(id, input))}
            onCancel={() => setMode(IDLE)}
          />
        </li>
      );
    }
    const stillToCome = isUpcoming(competition, today);
    const addingMatch = mode.kind === 'add-match' && mode.competitionId === id;
    return (
      <li key={id} className="list__item list__item--stacked">
        <div className="list__main">
          <strong className="list__detail">{name}</strong>
          <span className="muted list__detail">{competitionDetails(competition)}</span>
          <span className="list__tally">
            {stillToCome
              ? formatCountdown(competition.date, today)
              : matches.length > 0
                ? formatTally(tally(matches))
                : 'No matches yet'}
          </span>
        </div>
        {competition.notes && <p className="list__detail list__notes">{competition.notes}</p>}

        {matches.length > 0 && (
          <ol className="matches" aria-label={`Matches at ${name}`}>
            {matches.map((match, index) => {
              const matchLabel = `match ${index + 1} at ${name}`;
              if (
                mode.kind === 'edit-match' &&
                mode.competitionId === id &&
                mode.matchId === match.id
              ) {
                return (
                  <li key={match.id} className="matches__item matches__item--editing">
                    <MatchForm
                      initial={match}
                      label={matchLabel}
                      onSubmit={(input) => closeOnSuccess(onUpdateMatch(id, match.id, input))}
                      onCancel={() => setMode(IDLE)}
                      onDelete={() => {
                        onDeleteMatch(id, match.id);
                        setMode(IDLE);
                      }}
                    />
                  </li>
                );
              }
              return (
                <li key={match.id} className="matches__item">
                  <span className="matches__number" aria-hidden="true">
                    {index + 1}
                  </span>
                  <div className="list__main">
                    <span className="list__detail">{describeMatch(match)}</span>
                    {match.opponent && (
                      <span className="muted list__detail">vs {match.opponent}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    className="button button--small"
                    aria-label={`Edit ${matchLabel}`}
                    onClick={() =>
                      setMode({ kind: 'edit-match', competitionId: id, matchId: match.id })
                    }
                  >
                    Edit
                  </button>
                </li>
              );
            })}
          </ol>
        )}

        {addingMatch ? (
          <MatchForm
            label={`match ${matches.length + 1} at ${name}`}
            onSubmit={(input) => closeOnSuccess(onAddMatch(id, input))}
            onCancel={() => setMode(IDLE)}
          />
        ) : (
          <div className="actions actions--tight">
            {!stillToCome && matches.length < MAX_MATCHES && (
              <button
                type="button"
                className="button button--small"
                aria-label={`Add match to ${name}`}
                onClick={() => setMode({ kind: 'add-match', competitionId: id })}
              >
                Add match
              </button>
            )}
            <button
              type="button"
              className="button button--small"
              aria-label={`Edit ${name}`}
              onClick={() => setMode({ kind: 'edit', id })}
            >
              Edit
            </button>
            <ConfirmDelete label={name} onConfirm={() => onDelete(id)} />
          </div>
        )}
      </li>
    );
  };

  return (
    <>
      {past.length > 0 && <CompetitionRecordCard competitions={competitions} today={today} />}

      <section className="card" aria-labelledby="competitions-heading">
        <div className="card__header">
          <h2 id="competitions-heading">Competitions</h2>
          {mode.kind !== 'add' && (
            <button
              type="button"
              className="button button--primary button--small"
              onClick={() => setMode({ kind: 'add' })}
            >
              Log competition
            </button>
          )}
        </div>

        {mode.kind === 'add' && (
          <CompetitionForm
            today={today}
            onSubmit={(input) => closeOnSuccess(onAdd(input))}
            onCancel={() => setMode(IDLE)}
          />
        )}

        {competitions.length === 0 && mode.kind !== 'add' && (
          <p className="muted">
            No competitions logged yet. Add one you have entered or one you have fought, then record
            each match and how it ended.
          </p>
        )}

        {upcoming.length > 0 && (
          <>
            <h3 className="eyebrow" id="upcoming-heading">
              Upcoming
            </h3>
            <ul className="list" aria-labelledby="upcoming-heading">
              {upcoming.map(renderCompetition)}
            </ul>
          </>
        )}

        {past.length > 0 && (
          <>
            {upcoming.length > 0 && (
              <h3 className="eyebrow" id="past-heading">
                Past
              </h3>
            )}
            <ul className="list" aria-label="Past competitions">
              {past.map(renderCompetition)}
            </ul>
          </>
        )}
      </section>
    </>
  );
}
