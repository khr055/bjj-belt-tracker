import { useId, useState } from 'react';
import {
  academyOverview,
  ALL_STUDENTS,
  beltCounts,
  listMembers,
  memberWeeks,
  QUIET_DAYS,
  recordPromotion,
  removeMember,
  removePromotion,
  renewJoinCode,
  ROLE_LABELS,
  setRole,
  SORT_LABELS,
  STUDENT_SORTS,
  summarizeMember,
  MEMBER_ROLES,
  type Academy,
  type MemberRole,
  type MemberSummary,
  type StudentFilter,
  YOU_NAME,
} from '../domain/academy';
import { formatDate, formatDuration, formatShortDate } from '../domain/dates';
import { sortPromotions } from '../domain/promotions';
import { BELT_LABELS, formatRank, nextRank } from '../domain/rank';
import { formatHours, type MatTime } from '../domain/sessions';
import { axisMax } from '../domain/trends';
import { newId, type Rank } from '../domain/types';
import { BeltGraphic } from './BeltGraphic';
import { ConfirmDelete } from './ConfirmDelete';
import { PromotionForm } from './PromotionForm';
import { TimeInGradeCard } from './TimeInGradeCard';

interface Props {
  academy: Academy;
  today: string;
  onChange(academy: Academy): void;
}

type Screen =
  | { name: 'home' }
  | { name: 'students' }
  | { name: 'student'; id: string; from: 'home' | 'students' }
  | { name: 'manage' };

const SECTIONS = [
  { name: 'home', label: 'Overview' },
  { name: 'students', label: 'Students' },
  { name: 'manage', label: 'Manage' },
] as const;

const STARTING_RANK: Rank = { belt: 'white', stripes: 0 };

function count(amount: number, noun: string): string {
  return `${amount} ${noun}${amount === 1 ? '' : 's'}`;
}

function rankName(rank: Rank | null): string {
  return rank ? formatRank(rank) : 'No rank yet';
}

/** "Trained today", "Last trained 3 Nov", or that they have not trained yet. */
function lastTrained(summary: MemberSummary, today: string): string {
  if (summary.lastTrained === null) return 'Has not trained yet';
  if (summary.lastTrained === today) return 'Trained today';
  return `Last trained ${formatShortDate(summary.lastTrained)}`;
}

function matTime(total: MatTime): string {
  const hours = formatHours(total.minutes);
  return `${count(total.sessions, 'session')} · ${hours} ${hours === '1' ? 'hour' : 'hours'}`;
}

interface RowProps {
  summary: MemberSummary;
  /** What this list is about, shown under the name. */
  detail: string;
  onOpen(): void;
}

/** One person in a list: their belt, name and one fact, and a way in to the rest. */
function MemberRow({ summary, detail, onOpen }: RowProps) {
  const { member, rank } = summary;
  return (
    <li className="list__item list__item--belt">
      {rank ? <BeltGraphic rank={rank} size="small" /> : <span className="belt belt--small belt--none" />}
      <div className="list__main">
        <strong className="list__detail">{member.name}</strong>
        <span className="muted list__detail">{detail}</span>
      </div>
      <button
        type="button"
        className="button button--small"
        aria-label={`Open ${member.name}`}
        onClick={onOpen}
      >
        Open
      </button>
    </li>
  );
}

interface ListProps {
  title: string;
  hint: string;
  empty: string;
  people: MemberSummary[];
  detail(summary: MemberSummary): string;
  onOpen(id: string): void;
}

function PeopleCard({ title, hint, empty, people, detail, onOpen }: ListProps) {
  const id = useId();
  return (
    <section className="card" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      {people.length === 0 ? (
        <p className="muted">{empty}</p>
      ) : (
        <ul className="list" aria-labelledby={id}>
          {people.map((summary) => (
            <MemberRow
              key={summary.member.id}
              summary={summary}
              detail={detail(summary)}
              onOpen={() => onOpen(summary.member.id)}
            />
          ))}
        </ul>
      )}
      <p className="hint">{hint}</p>
    </section>
  );
}

function Home({ academy, today, onOpen }: { academy: Academy; today: string; onOpen(id: string): void }) {
  const overview = academyOverview(academy, today);
  return (
    <>
      <section className="card" aria-labelledby="academy-week-heading">
        <h2 id="academy-week-heading">This week</h2>
        <div className="stat-row">
          <div className="stat" role="group" aria-label="Sessions this week">
            <p className="eyebrow">Sessions</p>
            <p className="stat__figures">
              <span className="stat__number">{overview.sessionsThisWeek}</span> logged
            </p>
            <p className="muted">Since Monday, across the academy</p>
          </div>
          <div className="stat" role="group" aria-label="People training this week">
            <p className="eyebrow">On the mat</p>
            <p className="stat__figures">
              <span className="stat__number">{overview.trainedThisWeek}</span> of {overview.members}
            </p>
            <p className="muted">Members who have trained</p>
          </div>
        </div>
      </section>

      <PeopleCard
        title="Minimum time met"
        hint="They have served the IBJJF minimum at their belt. Promotion is still your decision."
        empty="Nobody has reached the minimum time at their belt."
        people={overview.minimumMet}
        detail={(summary) =>
          `${rankName(summary.rank)} · ${
            summary.beltSince ? formatDuration(summary.beltSince, today) : 'time unknown'
          } at ${summary.rank ? BELT_LABELS[summary.rank.belt].toLowerCase() : ''} belt`
        }
        onOpen={onOpen}
      />
      <PeopleCard
        title="Most mat time since a promotion"
        hint="Sessions each person has logged since their last stripe or belt."
        empty="Nobody has logged a session since their last promotion."
        people={overview.mostSincePromotion}
        detail={(summary) => `${rankName(summary.rank)} · ${matTime(summary.sinceLastPromotion)}`}
        onOpen={onOpen}
      />
      <PeopleCard
        title="Gone quiet"
        hint={`No session for ${QUIET_DAYS} days or more. Days someone has marked as time off are not counted, and anyone away today is left out.`}
        empty="Everyone has trained in the last three weeks, or is away."
        people={overview.quiet}
        detail={(summary) => `${count(summary.daysQuiet, 'day')} · ${lastTrained(summary, today)}`}
        onOpen={onOpen}
      />
      <PeopleCard
        title="Joined recently"
        hint="Members who joined in the last 30 days. A new member has no rank until a coach gives them one."
        empty="Nobody has joined in the last 30 days."
        people={overview.joinedRecently}
        detail={(summary) => `${rankName(summary.rank)} · Joined ${formatShortDate(summary.member.joinedOn)}`}
        onOpen={onOpen}
      />
    </>
  );
}

function Students({ academy, today, onOpen }: { academy: Academy; today: string; onOpen(id: string): void }) {
  const searchId = useId();
  const sortId = useId();
  const [filter, setFilter] = useState<StudentFilter>(ALL_STUDENTS);
  const shown = listMembers(academy, filter, today);
  const belts = [
    { value: 'all' as const, label: 'All', members: academy.members.length },
    ...beltCounts(academy).map(({ belt, members }) => ({
      value: belt,
      label: belt === 'unranked' ? 'No rank' : BELT_LABELS[belt],
      members,
    })),
  ];

  return (
    <section className="card" aria-labelledby="students-heading">
      <h2 id="students-heading">Students</h2>
      <div className="filters" role="search" aria-label="Find students">
        <div className="field">
          <label htmlFor={searchId}>Search by name</label>
          <input
            id={searchId}
            type="search"
            value={filter.text}
            autoComplete="off"
            onChange={(event) => setFilter({ ...filter, text: event.target.value })}
          />
        </div>
        <div className="choices__row" role="group" aria-label="Belt">
          {belts.map(({ value, label, members }) => (
            <button
              key={value}
              type="button"
              className="chip chip--button"
              aria-pressed={filter.belt === value}
              onClick={() => setFilter({ ...filter, belt: value })}
            >
              {label} <span className="chip__count">{members}</span>
            </button>
          ))}
        </div>
        <div className="field">
          <label htmlFor={sortId}>Sort by</label>
          <select
            id={sortId}
            value={filter.sort}
            onChange={(event) => setFilter({ ...filter, sort: event.target.value as StudentFilter['sort'] })}
          >
            {STUDENT_SORTS.map((sort) => (
              <option key={sort} value={sort}>
                {SORT_LABELS[sort]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className="muted" role="status">
        {shown.length === academy.members.length
          ? count(shown.length, 'member')
          : `${shown.length} of ${count(academy.members.length, 'member')}`}
      </p>
      {shown.length === 0 && <p className="muted">Nobody matches.</p>}
      <ul className="list" aria-label="Students">
        {shown.map((summary) => (
          <MemberRow
            key={summary.member.id}
            summary={summary}
            detail={[
              rankName(summary.rank),
              summary.rankSince ? `${formatDuration(summary.rankSince, today)} at this rank` : '',
              `${count(summary.recent.sessions, 'session')} in 30 days`,
              summary.awayToday ? 'Away' : lastTrained(summary, today),
            ]
              .filter(Boolean)
              .join(' · ')}
            onOpen={() => onOpen(summary.member.id)}
          />
        ))}
      </ul>
    </section>
  );
}

/** Sessions per week as bars, with the weeks someone was away shaded. */
function WeekChart({ academy, id, today }: { academy: Academy; id: string; today: string }) {
  const member = academy.members.find((other) => other.id === id);
  if (!member) return null;
  const weeks = memberWeeks(member, today);
  const max = axisMax(weeks.map((week) => week.sessions));
  const ticks = [max, max / 2, 0];
  return (
    <div className="chart" role="group" aria-label={`Sessions per week, last ${weeks.length} weeks`}>
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
          {weeks.map((week) => (
            <div
              key={week.weekStart}
              className={`chart__slot${week.off ? ' chart__slot--off' : ''}`}
              role="img"
              aria-label={`${week.current ? 'This week' : `Week of ${formatShortDate(week.weekStart)}`}${
                week.off ? ', away' : ''
              }: ${count(week.sessions, 'session')}`}
            >
              <span className="chart__bar" style={{ height: `${(week.sessions / max) * 100}%` }} />
            </div>
          ))}
        </div>
        <div className="chart__labels" aria-hidden="true">
          {weeks.map((week, index) => (
            <span key={week.weekStart}>{index % 2 === 1 ? formatShortDate(week.weekStart) : ''}</span>
          ))}
        </div>
      </div>
      <p className="hint">
        Weeks start on Monday. The last bar is this week so far.
        {weeks.some((week) => week.off) && ' Shaded weeks include time away.'}
      </p>
    </div>
  );
}

interface StudentProps extends Props {
  id: string;
  backLabel: string;
  onBack(): void;
}

function Student({ academy, id, today, backLabel, onBack, onChange }: StudentProps) {
  const [promoting, setPromoting] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const member = academy.members.find((other) => other.id === id);
  if (!member) {
    return (
      <section className="card">
        <p className="muted">That person is no longer in the academy.</p>
        <div className="actions">
          <button type="button" className="button" onClick={onBack}>
            {backLabel}
          </button>
        </div>
      </section>
    );
  }
  const summary = summarizeMember(member, today);
  const { rank } = summary;
  const newestFirst = sortPromotions(member.promotions).reverse();

  return (
    <>
      <div className="actions">
        <button type="button" className="button button--small" onClick={onBack}>
          ‹ {backLabel}
        </button>
      </div>

      <section className="card" aria-labelledby="student-heading">
        <div className="card__header">
          <p className="eyebrow">
            {ROLE_LABELS[member.role]} · Joined {formatDate(member.joinedOn)}
          </p>
        </div>
        {rank && <BeltGraphic rank={rank} />}
        <h2 id="student-heading" className="rank-title">
          {member.name}
        </h2>
        <p>
          <strong>{rankName(rank)}</strong>
          {summary.rankSince && (
            <span className="muted">
              {' '}
              · since {formatDate(summary.rankSince)} ({formatDuration(summary.rankSince, today)})
            </span>
          )}
        </p>
        {summary.awayToday && <p className="notice">Marked as away at the moment.</p>}
        {!rank && (
          <p className="notice">
            {member.name} has no rank yet. Record the rank they hold to start their history.
          </p>
        )}

        {promoting ? (
          <PromotionForm
            suggestedRank={rank ? nextRank(rank) : STARTING_RANK}
            today={today}
            onSubmit={(input) => {
              const result = recordPromotion(academy, id, input, today);
              if (!result.ok) return result.error;
              onChange(result.value);
              setPromoting(false);
              setSaved(`Recorded ${formatRank(input)} for ${member.name}.`);
              return null;
            }}
            onCancel={() => setPromoting(false)}
          />
        ) : (
          <div className="actions">
            <button
              type="button"
              className="button button--primary"
              onClick={() => {
                setSaved(null);
                setPromoting(true);
              }}
            >
              Record a promotion
            </button>
            <span className="saved" role="status">
              {saved}
            </span>
          </div>
        )}
      </section>

      {rank && (
        <TimeInGradeCard rank={rank} promotions={member.promotions} today={today} forCoach />
      )}

      <section className="card" aria-labelledby="attendance-heading">
        <h2 id="attendance-heading">Attendance</h2>
        <dl className="facts">
          <div>
            <dt>Last 30 days</dt>
            <dd>{matTime(summary.recent)}</dd>
          </div>
          <div>
            <dt>Since last promotion</dt>
            <dd>{matTime(summary.sinceLastPromotion)}</dd>
          </div>
          <div>
            <dt>Last trained</dt>
            <dd>{summary.lastTrained ? formatDate(summary.lastTrained) : 'Not yet'}</dd>
          </div>
        </dl>
        <WeekChart academy={academy} id={id} today={today} />
        <p className="hint">
          Attendance comes from the sessions each person checks in to. Their notes, techniques
          and competitions are theirs alone and are not shown here.
        </p>
      </section>

      <section className="card" aria-labelledby="history-heading">
        <h2 id="history-heading">Promotions</h2>
        {newestFirst.length === 0 ? (
          <p className="muted">None recorded yet.</p>
        ) : (
          <ol className="list" reversed aria-labelledby="history-heading">
            {newestFirst.map((promotion) => (
              <li key={promotion.id} className="list__item list__item--stacked">
                <div className="list__row">
                  <BeltGraphic rank={promotion} size="small" />
                  <div className="list__main">
                    <strong>{formatRank(promotion)}</strong>
                    <span className="muted">
                      {formatDate(promotion.date)}
                      {promotion.promotedBy && ` · by ${promotion.promotedBy}`}
                    </span>
                  </div>
                </div>
                <div className="actions actions--tight">
                  <ConfirmDelete
                    label={`${formatRank(promotion)} for ${member.name}`}
                    onConfirm={() => onChange(removePromotion(academy, id, promotion.id))}
                  />
                </div>
              </li>
            ))}
          </ol>
        )}
        <p className="hint">
          Deleting one entered by mistake puts the rank back to the highest that is left.
        </p>
      </section>
    </>
  );
}

function Manage({ academy, today, onChange, onOpen }: Props & { onOpen(id: string): void }) {
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const apply = (result: ReturnType<typeof setRole>) => {
    setError(result.ok ? null : result.error);
    if (result.ok) onChange(result.value);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(academy.joinCode);
      setCopied(true);
    } catch {
      // No clipboard here (an old browser, or no permission): the code is on screen to read out.
      setCopied(false);
    }
  };

  return (
    <>
      <section className="card" aria-labelledby="invite-heading">
        <h2 id="invite-heading">Invite people</h2>
        <p className="muted">
          Give this code to someone joining {academy.name}. They sign in, enter it, and appear in
          your students as a new member with no rank.
        </p>
        <p className="join-code" aria-label="Joining code">
          {academy.joinCode}
        </p>
        <div className="actions">
          <button type="button" className="button button--primary" onClick={copy}>
            Copy code
          </button>
          <button
            type="button"
            className="button"
            onClick={() => {
              setCopied(false);
              onChange(renewJoinCode(academy, `${newId().slice(0, 4)}-${newId().slice(0, 4)}`));
            }}
          >
            Replace code
          </button>
          <span className="saved" role="status">
            {copied ? 'Copied.' : ''}
          </span>
        </div>
        <p className="hint">Replacing the code stops the old one working. Nobody already in is affected.</p>
      </section>

      <section className="card" aria-labelledby="members-heading">
        <h2 id="members-heading">Members and roles</h2>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <ul className="list" aria-labelledby="members-heading">
          {listMembers(academy, ALL_STUDENTS, today).map(({ member }) => (
            <li key={member.id} className="list__item list__item--stacked">
              <div className="list__row">
                <div className="list__main">
                  <strong className="list__detail">{member.name}</strong>
                  <span className="muted">Joined {formatDate(member.joinedOn)}</span>
                </div>
                <label className="visually-hidden" htmlFor={`role-${member.id}`}>
                  Role for {member.name}
                </label>
                <select
                  id={`role-${member.id}`}
                  className="select--compact"
                  value={member.role}
                  onChange={(event) => apply(setRole(academy, member.id, event.target.value as MemberRole))}
                >
                  {MEMBER_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="actions actions--tight">
                <button
                  type="button"
                  className="button button--small"
                  aria-label={`Open ${member.name}`}
                  onClick={() => onOpen(member.id)}
                >
                  Open
                </button>
                <ConfirmDelete
                  label={`${member.name} from the academy`}
                  onConfirm={() => apply(removeMember(academy, member.id))}
                />
              </div>
            </li>
          ))}
        </ul>
        <p className="hint">
          A coach can see students' rank and attendance and record promotions. An owner can also
          change roles, remove members and replace the code. Removing someone takes them out of
          the academy; their own training record stays theirs.
        </p>
      </section>
    </>
  );
}

/** What a coach or owner sees of their academy. */
export function AcademyView({ academy, today, onChange }: Props) {
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const open = (from: 'home' | 'students') => (id: string) => setScreen({ name: 'student', id, from });
  const section = screen.name === 'student' ? screen.from : screen.name;

  return (
    <>
      <p className="notice" role="note">
        <strong>Preview with a sample academy.</strong> These people are made up, apart from
        "{YOU_NAME}", which is your own record from the Student view. Changes to the made-up
        people are not saved.
      </p>
      <section className="card" aria-labelledby="academy-heading">
        <p className="eyebrow">Your academy</p>
        <h2 id="academy-heading">{academy.name}</h2>
        <nav className="choices__row" aria-label="Academy sections">
          {SECTIONS.map(({ name, label }) => (
            <button
              key={name}
              type="button"
              className="chip chip--button"
              aria-current={section === name && screen.name !== 'student' ? 'page' : undefined}
              aria-pressed={section === name}
              onClick={() => setScreen({ name } as Screen)}
            >
              {label}
            </button>
          ))}
        </nav>
      </section>

      {screen.name === 'home' && <Home academy={academy} today={today} onOpen={open('home')} />}
      {screen.name === 'students' && (
        <Students academy={academy} today={today} onOpen={open('students')} />
      )}
      {screen.name === 'manage' && (
        <Manage academy={academy} today={today} onChange={onChange} onOpen={open('students')} />
      )}
      {screen.name === 'student' && (
        <Student
          academy={academy}
          id={screen.id}
          today={today}
          backLabel={screen.from === 'home' ? 'Back to overview' : 'Back to students'}
          onBack={() => setScreen({ name: screen.from } as Screen)}
          onChange={onChange}
        />
      )}
    </>
  );
}
