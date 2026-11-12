import { formatDate, formatShortDate } from '../domain/dates';
import { goalProgress } from '../domain/goals';
import { formatRank } from '../domain/rank';
import { formatHours, matTimeStats } from '../domain/sessions';
import { weeklyTotals } from '../domain/trends';
import type { AppData } from '../domain/types';

interface Props {
  data: AppData;
  today: string;
}

interface TileProps {
  label: string;
  total: { sessions: number; minutes: number; rounds: number };
  detail: string;
}

function Tile({ label, total, detail }: TileProps) {
  const { rounds } = total;
  return (
    <div className="stat" role="group" aria-label={label}>
      <p className="eyebrow">{label}</p>
      <p className="stat__figures">
        <span className="stat__number">{total.sessions}</span>{' '}
        {total.sessions === 1 ? 'session' : 'sessions'}
        <span className="stat__divider" aria-hidden="true">
          ·
        </span>
        <span className="stat__number">{formatHours(total.minutes)}</span> hours
        {rounds > 0 && (
          <>
            <span className="stat__divider" aria-hidden="true">
              ·
            </span>
            <span className="stat__number">{rounds}</span> {rounds === 1 ? 'round' : 'rounds'}
          </>
        )}
      </p>
      <p className="muted">{detail}</p>
    </div>
  );
}

function goalDetail(data: AppData, today: string): string {
  if (data.weeklyGoal === null) return '';
  const progress = goalProgress(data.sessions, data.weeklyGoal, today);
  return progress.met
    ? ` · Weekly goal of ${progress.goal} reached`
    : ` · ${progress.remaining} to go for your goal of ${progress.goal}`;
}

export function MatTimeStats({ data, today }: Props) {
  const stats = matTimeStats(data);
  const [thisWeek] = weeklyTotals(data.sessions, today, 1);
  const since = stats.sinceLastPromotion;
  const sinceLabel = since
    ? since.promotion.belt === 'white' && since.promotion.stripes === 0
      ? `Since you started training on ${formatDate(since.promotion.date)}`
      : `Since ${formatRank(since.promotion)} on ${formatDate(since.promotion.date)}`
    : '';

  return (
    <section className="card" aria-labelledby="mat-time-heading">
      <h2 id="mat-time-heading">Mat time</h2>
      <Tile
        label="This week"
        total={thisWeek}
        detail={`Since Monday ${formatShortDate(thisWeek.weekStart)}${goalDetail(data, today)}`}
      />
      {since ? (
        <Tile label="Since last promotion" total={since.total} detail={sinceLabel} />
      ) : (
        <p className="muted">
          Log a promotion in the timeline to see your mat time since your last stripe or belt.
        </p>
      )}
      <Tile
        label="All time"
        total={stats.allTime}
        detail={`${stats.allTime.giSessions} gi · ${stats.allTime.nogiSessions} no-gi`}
      />
    </section>
  );
}
