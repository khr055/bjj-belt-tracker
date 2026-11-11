import { useState } from 'react';
import { formatDate } from '../domain/dates';
import {
  sessionDefaults,
  SESSION_TYPE_LABELS,
  sortSessions,
  type SessionInput,
} from '../domain/sessions';
import type { Session } from '../domain/types';
import { ConfirmDelete } from './ConfirmDelete';
import { SessionForm } from './SessionForm';

interface Props {
  sessions: Session[];
  today: string;
  onUpdate(id: string, input: SessionInput): string | null;
  onDelete(id: string): void;
}

export function SessionList({ sessions, today, onUpdate, onDelete }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);

  if (sessions.length === 0) {
    return <p className="muted">No sessions logged yet.</p>;
  }

  return (
    <ul className="list">
      {sortSessions(sessions).map((session) => {
        const label = `${SESSION_TYPE_LABELS[session.type]} session on ${formatDate(session.date)}`;
        if (editingId === session.id) {
          return (
            <li key={session.id} className="list__item list__item--editing">
              <SessionForm
                initial={session}
                defaults={sessionDefaults(sessions)}
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
        return (
          <li key={session.id} className="list__item list__item--stacked">
            <div className="list__row">
              <div className="list__main">
                <strong>{formatDate(session.date)}</strong>
                <span className="muted">{SESSION_TYPE_LABELS[session.type]}</span>
              </div>
              <span className="list__value">{session.durationMinutes} min</span>
            </div>
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
  );
}
