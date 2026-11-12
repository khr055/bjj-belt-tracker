import { useId, useState } from 'react';
import { formatDate } from '../domain/dates';
import {
  caughtTally,
  describeSession,
  filterSessions,
  formatHours,
  isFiltering,
  NO_FILTER,
  sessionDefaults,
  sessionLanded,
  SESSION_TYPE_LABELS,
  sessionTechniques,
  sortSessions,
  summarize,
  type SessionFilter,
  type SessionInput,
} from '../domain/sessions';
import { SESSION_TYPES, type Session, type Technique } from '../domain/types';
import { ConfirmDelete } from './ConfirmDelete';
import { SessionForm } from './SessionForm';

interface Props {
  sessions: Session[];
  techniques: Technique[];
  today: string;
  onUpdate(id: string, input: SessionInput): string | null;
  onDelete(id: string): void;
}

const TYPE_FILTERS = [
  { value: 'all', label: 'All' },
  ...SESSION_TYPES.map((type) => ({ value: type, label: SESSION_TYPE_LABELS[type] })),
] as const;

/** Sessions shown at first, and added by each tap of "Show more". */
const PAGE_SIZE = 30;

function count(amount: number, noun: string): string {
  return `${amount} ${noun}${amount === 1 ? '' : 's'}`;
}

export function SessionList({ sessions, techniques, today, onUpdate, onDelete }: Props) {
  const searchId = useId();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filter, setFilterState] = useState<SessionFilter>(NO_FILTER);
  const [visible, setVisible] = useState(PAGE_SIZE);

  // A new filter is a new list, so it starts again from the top.
  const setFilter = (next: SessionFilter) => {
    setFilterState(next);
    setVisible(PAGE_SIZE);
  };

  if (sessions.length === 0) {
    return <p className="muted">No sessions logged yet.</p>;
  }

  const filtering = isFiltering(filter);
  const shown = sortSessions(filterSessions(sessions, filter, techniques));

  return (
    <>
      <div className="filters" role="search" aria-label="Filter sessions">
        <div className="choices__row" role="group" aria-label="Session type">
          {TYPE_FILTERS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              className="chip chip--button"
              aria-pressed={filter.type === value}
              onClick={() => setFilter({ ...filter, type: value })}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="field">
          <label htmlFor={searchId}>Search sessions</label>
          <input
            id={searchId}
            type="search"
            value={filter.text}
            autoComplete="off"
            aria-describedby={`${searchId}-hint`}
            onChange={(event) => setFilter({ ...filter, text: event.target.value })}
          />
          <p className="hint" id={`${searchId}-hint`}>
            Looks in notes, kinds, techniques and what you were caught with.
          </p>
        </div>
      </div>

      <p className="muted" role="status">
        {filtering &&
          `Found ${shown.length} of ${count(sessions.length, 'session')} · ${formatHours(summarize(shown).minutes)} hours`}
      </p>

      {shown.length === 0 && (
        <div className="actions">
          <p className="muted">No sessions match.</p>
          <button type="button" className="button button--small" onClick={() => setFilter(NO_FILTER)}>
            Clear filters
          </button>
        </div>
      )}

      <ul className="list">
        {shown.slice(0, visible).map((session) => {
          const label = `${SESSION_TYPE_LABELS[session.type]} session on ${formatDate(session.date)}`;
          if (editingId === session.id) {
            return (
              <li key={session.id} className="list__item list__item--editing">
                <SessionForm
                  initial={session}
                  defaults={sessionDefaults(sessions)}
                  techniques={techniques}
                  caughtBefore={caughtTally(sessions).map((entry) => entry.name)}
                  today={today}
                  onSubmit={(input) => {
                    const problem = onUpdate(session.id, input);
                    if (!problem) setEditingId(null);
                    return problem;
                  }}
                  onCancel={() => setEditingId(null)}
                />
              </li>
            );
          }
          const workedOn = sessionTechniques(session, techniques);
          const landed = sessionLanded(session, techniques);
          return (
            <li key={session.id} className="list__item list__item--stacked">
              <div className="list__row">
                <div className="list__main">
                  <strong>{formatDate(session.date)}</strong>
                  <span className="muted">{describeSession(session)}</span>
                </div>
                <span className="list__value">{session.durationMinutes} min</span>
              </div>
              {workedOn.length > 0 && (
                <p className="muted list__detail">
                  Worked on: {workedOn.map((technique) => technique.name).join(', ')}
                </p>
              )}
              {landed.length > 0 && (
                <p className="muted list__detail">
                  Landed: {landed.map((technique) => technique.name).join(', ')}
                </p>
              )}
              {session.caughtWith && session.caughtWith.length > 0 && (
                <p className="muted list__detail">Caught with: {session.caughtWith.join(', ')}</p>
              )}
              {session.notes && <p className="list__detail list__notes">{session.notes}</p>}
              <div className="actions actions--tight">
                <button
                  type="button"
                  className="button button--small"
                  aria-label={`Edit ${label}`}
                  onClick={() => setEditingId(session.id)}
                >
                  Edit
                </button>
                <ConfirmDelete label={label} onConfirm={() => onDelete(session.id)} />
              </div>
            </li>
          );
        })}
      </ul>

      {shown.length > visible && (
        <div className="actions">
          <button
            type="button"
            className="button button--small"
            onClick={() => setVisible(visible + PAGE_SIZE)}
          >
            Show more
          </button>
          <span className="muted">
            Showing {visible} of {shown.length}
          </span>
        </div>
      )}
    </>
  );
}
