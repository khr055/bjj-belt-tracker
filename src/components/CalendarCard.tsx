import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import {
  describeDay,
  formatLongDate,
  formatMonthSummary,
  isDayEmpty,
  isSameMonth,
  monthDays,
  monthOf,
  moveDay,
  nextMonth,
  previousMonth,
  WEEKDAYS,
  type CalendarDay,
  type YearMonth,
} from '../domain/calendar';
import { formatRank } from '../domain/rank';
import { describeSession } from '../domain/sessions';
import { REASON_LABELS } from '../domain/timeOff';
import type { AppData } from '../domain/types';

interface Props {
  data: Pick<AppData, 'sessions' | 'timeOff' | 'promotions' | 'competitions'>;
  today: string;
}

function DayDetails({ day }: { day: CalendarDay }) {
  const date = formatLongDate(day.date);
  return (
    <div className="history calendar__details" role="group" aria-label={date}>
      <h3 className="calendar__details-title">
        {date}
        {day.isToday && <span className="muted"> · Today</span>}
      </h3>
      {isDayEmpty(day) ? (
        <p className="muted">Nothing logged</p>
      ) : (
        <ul aria-label={`On ${date}`}>
          {day.promotions.map((promotion) => (
            <li key={promotion.id}>
              <span>
                <span className="calendar__mark" aria-hidden="true">
                  ★
                </span>{' '}
                Promotion: {formatRank(promotion)}
              </span>
            </li>
          ))}
          {day.competitions.map((competition) => (
            <li key={competition.id} className="list__detail">
              <span>
                <span className="calendar__mark" aria-hidden="true">
                  ◆
                </span>{' '}
                Competition: {competition.name}
              </span>
            </li>
          ))}
          {day.sessions.map((session) => (
            <li key={session.id}>
              {describeSession(session)} · {session.durationMinutes} min
            </li>
          ))}
          {day.timeOff.map((period) => (
            <li key={period.id}>Time off ({REASON_LABELS[period.reason].toLowerCase()})</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function CalendarCard({ data, today }: Props) {
  const thisMonth = monthOf(today);
  const [shown, setShown] = useState<YearMonth>(thisMonth);
  const [selected, setSelected] = useState<string | null>(null);
  // The one day that Tab lands on; the arrow keys move between the rest.
  const [cursor, setCursor] = useState<string | null>(null);
  // A day to move keyboard focus to once its month has been drawn.
  const focusNext = useRef<string | null>(null);
  const table = useRef<HTMLTableElement>(null);

  const month = monthDays(shown.year, shown.month, data, today);
  const days = month.weeks.flat().filter((day): day is CalendarDay => day !== null);
  const selectedDay = days.find((day) => day.date === selected) ?? null;
  const tabStop =
    [cursor, selected, today].find((date) => days.some((day) => day.date === date)) ??
    days[0].date;

  useEffect(() => {
    if (focusNext.current === null) return;
    table.current
      ?.querySelector<HTMLButtonElement>(`button[data-date="${focusNext.current}"]`)
      ?.focus();
    focusNext.current = null;
  });

  const show = (next: YearMonth) => {
    if (!isSameMonth(next, shown)) setSelected(null);
    setShown(next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTableElement>) => {
    const from = (event.target as HTMLElement).closest('button')?.dataset.date;
    const to = from ? moveDay(from, event.key) : null;
    if (to === null) return;
    event.preventDefault();
    focusNext.current = to;
    setCursor(to);
    show(monthOf(to));
  };

  return (
    <section className="card" aria-labelledby="calendar-heading">
      <div className="card__header calendar__header">
        <h2 id="calendar-heading">Calendar</h2>
        {!isSameMonth(shown, thisMonth) && (
          <button type="button" className="button button--small" onClick={() => show(thisMonth)}>
            This month
          </button>
        )}
      </div>

      <div className="calendar__nav">
        <button
          type="button"
          className="button calendar__step"
          aria-label="Previous month"
          onClick={() => show(previousMonth(shown))}
        >
          <span aria-hidden="true">‹</span>
        </button>
        <h3 className="calendar__month" aria-live="polite">
          {month.title}
        </h3>
        <button
          type="button"
          className="button calendar__step"
          aria-label="Next month"
          onClick={() => show(nextMonth(shown))}
        >
          <span aria-hidden="true">›</span>
        </button>
      </div>

      <p className="muted calendar__summary">{formatMonthSummary(month.total)}</p>

      {/* A grid, not a plain table: one day takes Tab and the arrow keys reach the others. */}
      <table
        ref={table}
        className="calendar"
        role="grid"
        aria-label={`Training calendar, ${month.title}`}
        onKeyDown={onKeyDown}
      >
        <thead>
          <tr>
            {WEEKDAYS.map((weekday) => (
              <th key={weekday.short} scope="col">
                <abbr title={weekday.long}>{weekday.short}</abbr>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {month.weeks.map((week, index) => (
            <tr key={index}>
              {week.map((day, column) =>
                day === null ? (
                  <td key={column} />
                ) : (
                  <td key={column}>
                    <button
                      type="button"
                      className={[
                        'calendar__day',
                        day.timeOff.length > 0 && 'calendar__day--off',
                        day.isToday && 'calendar__day--today',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      data-date={day.date}
                      tabIndex={day.date === tabStop ? 0 : -1}
                      aria-label={describeDay(day)}
                      aria-pressed={day.date === selected}
                      onClick={() => {
                        setCursor(day.date);
                        setSelected(day.date === selected ? null : day.date);
                      }}
                    >
                      <span className="calendar__number">{day.day}</span>
                      <span className="calendar__marks">
                        {day.sessions.length > 0 && (
                          <span className="calendar__count">{day.sessions.length}</span>
                        )}
                        {day.promotions.length > 0 && <span className="calendar__mark">★</span>}
                        {day.competitions.length > 0 && <span className="calendar__mark">◆</span>}
                      </span>
                    </button>
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="calendar__key" aria-label="Key">
        <li>
          <span className="calendar__count" aria-hidden="true">
            2
          </span>{' '}
          Sessions that day
        </li>
        <li>
          <span className="calendar__mark" aria-hidden="true">
            ★
          </span>{' '}
          Promotion
        </li>
        <li>
          <span className="calendar__mark" aria-hidden="true">
            ◆
          </span>{' '}
          Competition
        </li>
        <li>
          <span className="calendar__swatch calendar__day--off" aria-hidden="true" /> Time off
        </li>
      </ul>

      <div aria-live="polite">
        {selectedDay ? (
          <DayDetails day={selectedDay} />
        ) : (
          <p className="hint">Choose a day to see what is on it.</p>
        )}
      </div>
    </section>
  );
}
