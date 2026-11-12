import { formatShortDate } from '../domain/dates';
import { formatHours } from '../domain/sessions';
import {
  axisMax,
  TREND_WEEKS,
  weeklyAverage,
  weeklyStreak,
  weeklyTotals,
  type WeekTotal,
} from '../domain/trends';
import type { Session } from '../domain/types';

interface Props {
  sessions: Session[];
  today: string;
}

function count(amount: number, noun: string): string {
  return `${amount} ${noun}${amount === 1 ? '' : 's'}`;
}

function weekName(week: WeekTotal): string {
  const from = formatShortDate(week.weekStart);
  return week.current ? `This week (from ${from})` : `Week of ${from}`;
}

function weekValue(week: WeekTotal): string {
  return `${count(week.sessions, 'session')}, ${formatHours(week.minutes)} hours`;
}

export function TrendsCard({ sessions, today }: Props) {
  if (sessions.length === 0) {
    return (
      <section className="card" aria-labelledby="trends-heading">
        <h2 id="trends-heading">Training trends</h2>
        <p className="muted">Log a few sessions to see your weekly trend and streak.</p>
      </section>
    );
  }

  const weeks = weeklyTotals(sessions, today);
  const streak = weeklyStreak(sessions, today);
  const average = weeklyAverage(sessions, today);
  const max = axisMax(weeks.map((week) => week.sessions));
  const ticks = [max, max / 2, 0];

  return (
    <section className="card" aria-labelledby="trends-heading">
      <h2 id="trends-heading">Training trends</h2>

      <div className="stat-row">
        <div className="stat" role="group" aria-label="Current streak">
          <p className="eyebrow">Current streak</p>
          <p className="stat__figures">
            <span className="stat__number">{streak.weeks}</span>{' '}
            {streak.weeks === 1 ? 'week' : 'weeks'}
          </p>
          <p className="muted">
            {streak.weeks === 0
              ? 'Train this week to start one'
              : streak.thisWeekLogged
                ? 'Including this week'
                : 'Train this week to keep it'}
          </p>
        </div>
        <div className="stat" role="group" aria-label="Weekly average">
          <p className="eyebrow">Weekly average</p>
          <p className="stat__figures">
            <span className="stat__number">{average ? average.sessions.toFixed(1) : '–'}</span>{' '}
            sessions
          </p>
          <p className="muted">
            {average
              ? `Over the last ${count(average.weeks, 'full week')}`
              : 'After your first full week'}
          </p>
        </div>
      </div>

      <div
        className="chart"
        role="group"
        aria-label={`Sessions per week, last ${TREND_WEEKS} weeks`}
      >
        <p className="chart__title">Sessions per week</p>
        <div className="chart__body">
          <div className="chart__ticks" aria-hidden="true">
            {ticks.map((tick) => (
              <span key={tick}>{tick}</span>
            ))}
          </div>
          <div className="chart__plot">
            {ticks.map((tick) => (
              <span
                key={tick}
                className="chart__gridline"
                style={{ bottom: `${(tick / max) * 100}%` }}
                aria-hidden="true"
              />
            ))}
            {weeks.map((week, index) => (
              <div
                key={week.weekStart}
                className="chart__slot"
                tabIndex={0}
                role="img"
                aria-label={`${weekName(week)}: ${weekValue(week)}`}
              >
                {/* Only the week in progress is labelled; the axis and tooltips cover the rest. */}
                {week.current && week.sessions > 0 && (
                  <span className="chart__value" aria-hidden="true">
                    {week.sessions}
                  </span>
                )}
                <span
                  className="chart__bar"
                  style={{ height: `${(week.sessions / max) * 100}%` }}
                />
                <span
                  className={`chart__tooltip${index < 2 ? ' chart__tooltip--start' : ''}${
                    index >= weeks.length - 2 ? ' chart__tooltip--end' : ''
                  }`}
                  aria-hidden="true"
                >
                  <strong>{weekValue(week)}</strong>
                  <span>{weekName(week)}</span>
                </span>
              </div>
            ))}
          </div>
          <div className="chart__labels" aria-hidden="true">
            {weeks.map((week, index) => (
              <span key={week.weekStart}>{index % 2 === 1 ? formatShortDate(week.weekStart) : ''}</span>
            ))}
          </div>
        </div>
        <p className="hint">Weeks start on Monday. The last bar is this week so far.</p>
      </div>

      <details className="chart-table">
        <summary>Show as a table</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">Week starting</th>
              <th scope="col">Sessions</th>
              <th scope="col">Hours</th>
            </tr>
          </thead>
          <tbody>
            {weeks.map((week) => (
              <tr key={week.weekStart}>
                <th scope="row">
                  {formatShortDate(week.weekStart)}
                  {week.current ? ' (this week)' : ''}
                </th>
                <td>{week.sessions}</td>
                <td>{formatHours(week.minutes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
