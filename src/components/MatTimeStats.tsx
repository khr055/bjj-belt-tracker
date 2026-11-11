import { formatDate } from '../domain/dates';
import { formatRank } from '../domain/rank';
import { formatHours, matTimeStats, type MatTime } from '../domain/sessions';
import type { AppData } from '../domain/types';

interface Props {
  data: AppData;
}

function Tile({ label, total, detail }: { label: string; total: MatTime; detail: string }) {
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
      </p>
      <p className="muted">{detail}</p>
    </div>
  );
}

export function MatTimeStats({ data }: Props) {
  const stats = matTimeStats(data);
  const since = stats.sinceLastPromotion;
  const sinceLabel = since
    ? since.promotion.belt === 'white' && since.promotion.stripes === 0
      ? `Since you started training on ${formatDate(since.promotion.date)}`
      : `Since ${formatRank(since.promotion)} on ${formatDate(since.promotion.date)}`
    : '';

  return (
    <section className="card" aria-labelledby="mat-time-heading">
      <h2 id="mat-time-heading">Mat time</h2>
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
