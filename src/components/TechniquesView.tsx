import { useState } from 'react';
import { formatDate } from '../domain/dates';
import { describeSession } from '../domain/sessions';
import {
  activityOf,
  daysUntrained,
  groupByPosition,
  isStale,
  landedIn,
  nextStatus,
  POSITION_LABELS,
  sessionsFor,
  sessionsToLand,
  STATUS_LABELS,
  statusCounts,
  techniqueActivity,
  type TechniqueActivity,
  type TechniqueInput,
} from '../domain/techniques';
import {
  TECHNIQUE_STATUSES,
  type Session,
  type Technique,
  type TechniqueStatus,
} from '../domain/types';
import { ConfirmDelete } from './ConfirmDelete';
import { TechniqueForm } from './TechniqueForm';

interface Props {
  techniques: Technique[];
  sessions: Session[];
  today: string;
  onAdd(input: TechniqueInput): string | null;
  onUpdate(id: string, input: TechniqueInput): string | null;
  onSetStatus(id: string, status: TechniqueStatus): string | null;
  onDelete(id: string): void;
}

type Mode = { kind: 'idle' } | { kind: 'add' } | { kind: 'edit'; id: string };
const IDLE: Mode = { kind: 'idle' };
const NO_BREAK_SPACE = String.fromCharCode(160);

/** Sessions shown in a technique's history before the rest are asked for. */
const HISTORY_SIZE = 10;

/** A date that stays on one line when the sentence around it wraps. */
function solidDate(date: string): string {
  return formatDate(date).replaceAll(' ', NO_BREAK_SPACE);
}

function count(amount: number, noun: string): string {
  return `${amount} ${noun}${amount === 1 ? '' : 's'}`;
}

/** "Drilling since 3 Oct 2026", adding how many sessions it took once it is landing. */
function describeStage(technique: Technique, sessions: Session[]): string {
  const stage = `${STATUS_LABELS[technique.status]} since ${solidDate(technique.statusSince)}`;
  const taken = sessionsToLand(technique, sessions);
  return taken ? `${stage} · after ${count(taken, 'session')}` : stage;
}

/** "Trained in 4 sessions · last on 3 Nov 2026", or that it has not been trained yet. */
function describeActivity({ sessions, lastTrained }: TechniqueActivity): string {
  if (sessions === 0 || lastTrained === null) return 'Not ticked on a session yet';
  return `Trained in ${count(sessions, 'session')} · last on ${solidDate(lastTrained)}`;
}

/** "Landed in rolling in 3 sessions · last on 3 Nov 2026", or nothing if it never has been. */
function describeLanded({ landed, lastLanded }: TechniqueActivity): string {
  if (landed === 0 || lastLanded === null) return '';
  return `Landed in rolling in ${count(landed, 'session')} · last on ${solidDate(lastLanded)}`;
}

interface HistoryProps {
  technique: Technique;
  sessions: Session[];
}

function History({ technique, sessions }: HistoryProps) {
  const { name } = technique;
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? sessions : sessions.slice(0, HISTORY_SIZE);
  return (
    <div className="history">
      <ol aria-label={`Sessions for ${name}`}>
        {shown.map((session) => (
          <li key={session.id}>
            <span>
              {formatDate(session.date)} · {describeSession(session)} ·{' '}
              {session.durationMinutes} min
              {landedIn(technique, session) && ' · Landed'}
            </span>
            {session.notes && <span className="muted list__detail">{session.notes}</span>}
          </li>
        ))}
      </ol>
      {sessions.length > shown.length && (
        <div className="actions">
          <button type="button" className="button button--small" onClick={() => setShowAll(true)}>
            Show all {sessions.length}
          </button>
        </div>
      )}
    </div>
  );
}

export function TechniquesView({
  techniques,
  sessions,
  today,
  onAdd,
  onUpdate,
  onSetStatus,
  onDelete,
}: Props) {
  const [mode, setMode] = useState<Mode>(IDLE);
  const [status, setStatus] = useState<TechniqueStatus | 'all'>('all');
  const [historyId, setHistoryId] = useState<string | null>(null);
  const activity = techniqueActivity(sessions);
  const counts = statusCounts(techniques);
  const shown = techniques.filter((technique) => status === 'all' || technique.status === status);
  const groups = groupByPosition(shown);

  const closeOnSuccess = (problem: string | null) => {
    if (!problem) setMode(IDLE);
    return problem;
  };

  const filters = [
    { value: 'all' as const, label: 'All', amount: techniques.length },
    ...TECHNIQUE_STATUSES.map((value) => ({
      value,
      label: STATUS_LABELS[value],
      amount: counts[value],
    })),
  ];

  const renderTechnique = (technique: Technique) => {
    const { id, name } = technique;
    if (mode.kind === 'edit' && mode.id === id) {
      return (
        <li key={id} className="list__item list__item--editing">
          <TechniqueForm
            initial={technique}
            onSubmit={(input) => closeOnSuccess(onUpdate(id, input))}
            onCancel={() => setMode(IDLE)}
          />
        </li>
      );
    }
    const own = activityOf(activity, technique);
    const next = nextStatus(technique.status);
    const historyOpen = historyId === id;
    return (
      <li key={id} className="list__item list__item--stacked">
        <div className="list__main">
          <strong className="list__detail">{name}</strong>
          <span className="muted list__detail">{describeStage(technique, sessions)}</span>
          <span className="muted list__detail">{describeActivity(own)}</span>
          {own.landed > 0 && <span className="muted list__detail">{describeLanded(own)}</span>}
          {isStale(technique, own, today) && (
            <span className="list__tally">
              Not trained for {daysUntrained(technique, own, today)} days
            </span>
          )}
        </div>
        {technique.notes && <p className="list__detail list__notes">{technique.notes}</p>}
        <div className="actions actions--tight">
          {next && (
            <button
              type="button"
              className="button button--small"
              aria-label={`Move ${name} to ${STATUS_LABELS[next].toLowerCase()}`}
              onClick={() => onSetStatus(id, next)}
            >
              Move to {STATUS_LABELS[next].toLowerCase()}
            </button>
          )}
          {own.sessions > 0 && (
            <button
              type="button"
              className="button button--small"
              aria-label={`Sessions for ${name}`}
              aria-expanded={historyOpen}
              onClick={() => setHistoryId(historyOpen ? null : id)}
            >
              {historyOpen ? 'Hide sessions' : 'Sessions'}
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
        {historyOpen && (
          <History technique={technique} sessions={sessionsFor(technique, sessions)} />
        )}
      </li>
    );
  };

  return (
    <section className="card" aria-labelledby="techniques-heading">
      <div className="card__header">
        <h2 id="techniques-heading">Techniques</h2>
        {mode.kind !== 'add' && (
          <button
            type="button"
            className="button button--primary button--small"
            onClick={() => setMode({ kind: 'add' })}
          >
            Add technique
          </button>
        )}
      </div>

      {mode.kind === 'add' && (
        <TechniqueForm
          onSubmit={(input) => closeOnSuccess(onAdd(input))}
          onCancel={() => setMode(IDLE)}
        />
      )}

      {techniques.length === 0 && mode.kind !== 'add' && (
        <p className="muted">
          No techniques yet. Add the ones you are working on, then tick them when you log a
          session to see how often and how recently you have trained each one.
        </p>
      )}

      {techniques.length > 0 && (
        <div className="choices__row" role="group" aria-label="Show techniques">
          {filters.map(({ value, label, amount }) => (
            <button
              key={value}
              type="button"
              className="chip chip--button"
              aria-pressed={status === value}
              onClick={() => setStatus(value)}
            >
              {label} <span className="chip__count">{amount}</span>
            </button>
          ))}
        </div>
      )}

      {techniques.length > 0 && shown.length === 0 && (
        <p className="muted">No techniques at this stage.</p>
      )}

      {groups.map(({ position, techniques: inPosition }) => (
        <div key={position} className="group">
          <h3 className="eyebrow" id={`position-${position}`}>
            {POSITION_LABELS[position]}
          </h3>
          <ul className="list" aria-labelledby={`position-${position}`}>
            {inPosition.map(renderTechnique)}
          </ul>
        </div>
      ))}

      {techniques.length > 0 && (
        <p className="hint">
          Deleting a technique also takes it off the sessions it was ticked on. The sessions stay.
        </p>
      )}
    </section>
  );
}
