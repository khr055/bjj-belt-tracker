import { formatShortDate } from '../domain/dates';
import { goalProgress, goalRecord, MAX_WEEKLY_GOAL } from '../domain/goals';
import { formatHours } from '../domain/sessions';
import { currentTimeOff } from '../domain/timeOff';
import {
  axisMax,
  TREND_WEEKS,
  weeklyAverage,
  weeklyStreak,
  weeklyTotals,
  type WeeklyStreak,
  type WeekTotal,
} from '../domain/trends';
import type { Session, TimeOff } from '../domain/types';

interface Props {
  sessions: Session[];
  /** Weeks with time off are left out of the average and goal record, and don't end a streak. */
  timeOff: TimeOff[];
  /** Sessions a week the practitioner aims for, if they have set a goal. */
  weeklyGoal: number | null;
  today: string;
  onSetGoal(goal: number | null): string | null;
}

const GOAL_CHOICES = Array.from({ length: MAX_WEEKLY_GOAL }, (_, index) => index + 1);

function count(amount: number, noun: string): string {
  return `${amount} ${noun}${amount === 1 ? '' : 's'}`;
}

function weekName(week: WeekTotal): string {
  const from = formatShortDate(week.weekStart);
  const name = week.current ? `This week (from ${from})` : `Week of ${from}`;
  return week.off ? `${name}, time off` : name;
}

function weekValue(week: WeekTotal): string {
  return `${count(week.sessions, 'session')}, ${formatHours(week.minutes)} hours`;
}

function GoalPicker({ weeklyGoal, onSetGoal }: Pick<Props, 'weeklyGoal' | 'onSetGoal'>) {
  return (
    <fieldset className="choices">
      <legend>Weekly goal</legend>
      <div className="choices__row">
        <label className="chip">
          <input
            type="radio"
            name="weekly-goal"
            checked={weeklyGoal === null}
            onChange={() => onSetGoal(null)}
          />
          No goal
        </label>
        {GOAL_CHOICES.map((goal) => (
          <label key={goal} className="chip chip--number">
            <input
              type="radio"
              name="weekly-goal"
              aria-label={`${count(goal, 'session')} a week`}
              checked={weeklyGoal === goal}
              onChange={() => onSetGoal(goal)}
            />
            {goal}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

interface GoalTileProps {
  sessions: Session[];
  timeOff: TimeOff[];
  goal: number;
  today: string;
}

function GoalProgressTile({ sessions, timeOff, goal, today }: GoalTileProps) {
  const progress = goalProgress(sessions, goal, today);
  const record = goalRecord(sessions, goal, today, TREND_WEEKS, timeOff);
  return (
    <div className="stat" role="group" aria-label="This week's goal">
      <p className="eyebrow">This week's goal</p>
      <p className="stat__figures">
        <span className="stat__number">{progress.done}</span> of {count(goal, 'session')}
      </p>
      <progress
        className="meter"
        max={goal}
        value={Math.min(progress.done, goal)}
        aria-label="Progress towards this week's goal"
      />
      <p className="muted">
        {progress.met ? 'Goal reached' : `${progress.remaining} to go`}
        {record && ` · Reached in ${record.met} of the last ${count(record.weeks, 'full week')}`}
      </p>
    </div>
  );
}

/**
 * What the streak needs next, or what is holding it. A week with time off later in it, or
 * earlier, is held without saying the practitioner is off today.
 */
function streakDetail(streak: WeeklyStreak, offToday: boolean): string {
  const carried =
    streak.weeksOff > 0 ? ` · Not counting ${count(streak.weeksOff, 'week')} off` : '';
  if (streak.weeks === 0) {
    if (!streak.thisWeekOff) return 'Train this week to start one';
    return offToday ? 'On time off this week' : 'This week includes time off';
  }
  if (streak.thisWeekLogged) return `Including this week${carried}`;
  if (!streak.thisWeekOff) return `Train this week to keep it${carried}`;
  return `${offToday ? 'Held while you are off' : 'Held: this week includes time off'}${carried}`;
}

export function TrendsCard({ sessions, timeOff, weeklyGoal, today, onSetGoal }: Props) {
  if (sessions.length === 0) {
    return (
      <section className="card" aria-labelledby="trends-heading">
        <h2 id="trends-heading">Training trends</h2>
        <p className="muted">Log a few sessions to see your weekly trend and streak.</p>
        <GoalPicker weeklyGoal={weeklyGoal} onSetGoal={onSetGoal} />
      </section>
    );
  }

  const weeks = weeklyTotals(sessions, today, TREND_WEEKS, timeOff);
  const streak = weeklyStreak(sessions, today, timeOff);
  const average = weeklyAverage(sessions, today, TREND_WEEKS, timeOff);
  const weeksOff = weeks.filter((week) => week.off).length;
  const offToday = currentTimeOff(timeOff, today) !== null;
  // With no average, tell having no full week yet from having only weeks with time off.
  const onlyWeeksOff = average === null && weeklyAverage(sessions, today) !== null;
  const max = axisMax([...weeks.map((week) => week.sessions), weeklyGoal ?? 0]);
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
          <p className="muted">{streakDetail(streak, offToday)}</p>
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
              : onlyWeeksOff
                ? 'After your next full week without time off'
                : 'After your first full week'}
          </p>
        </div>
      </div>

      {weeklyGoal !== null && (
        <GoalProgressTile sessions={sessions} timeOff={timeOff} goal={weeklyGoal} today={today} />
      )}

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
                className={`chart__slot${week.off ? ' chart__slot--off' : ''}`}
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
            {weeklyGoal !== null && (
              <span
                className="chart__goal"
                style={{ bottom: `${(weeklyGoal / max) * 100}%` }}
                aria-hidden="true"
              />
            )}
          </div>
          <div className="chart__labels" aria-hidden="true">
            {weeks.map((week, index) => (
              <span key={week.weekStart}>{index % 2 === 1 ? formatShortDate(week.weekStart) : ''}</span>
            ))}
          </div>
        </div>
        <p className="hint">
          Weeks start on Monday. The last bar is this week so far.
          {weeklyGoal !== null && ` The dashed line is your goal of ${weeklyGoal} a week.`}
          {weeksOff > 0 &&
            ` Shaded weeks include time off and are left out of your average${
              weeklyGoal !== null ? ' and goal record' : ''
            }.`}
        </p>
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
                  {week.off ? ' (time off)' : ''}
                </th>
                <td>{week.sessions}</td>
                <td>{formatHours(week.minutes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>

      <GoalPicker weeklyGoal={weeklyGoal} onSetGoal={onSetGoal} />
    </section>
  );
}
