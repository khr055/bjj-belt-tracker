import { useState } from 'react';
import { BackupReminder } from './components/BackupReminder';
import { BackupView } from './components/BackupView';
import { CalendarCard } from './components/CalendarCard';
import { CaughtCard } from './components/CaughtCard';
import { CompetitionRecordCard } from './components/CompetitionRecordCard';
import { CompetitionsView } from './components/CompetitionsView';
import { MatTimeStats } from './components/MatTimeStats';
import { NextCompetitionCard } from './components/NextCompetitionCard';
import { RankCard } from './components/RankCard';
import { SessionForm } from './components/SessionForm';
import { SessionList } from './components/SessionList';
import { TechniqueFocusCard } from './components/TechniqueFocusCard';
import { TechniquesView } from './components/TechniquesView';
import { TimeInGradeCard } from './components/TimeInGradeCard';
import { TimeOffCard } from './components/TimeOffCard';
import { TimelineView } from './components/TimelineView';
import { nextCompetition, pastCompetitions } from './domain/competitions';
import { todayIso } from './domain/dates';
import { caughtTally, sessionDefaults } from './domain/sessions';
import { buildTimeline } from './domain/timeline';
import { TrendsCard } from './components/TrendsCard';
import { useAppState } from './state/useAppState';
import { useRankIcons } from './state/useRankIcons';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'training', label: 'Training' },
  { id: 'techniques', label: 'Techniques' },
  { id: 'compete', label: 'Compete' },
  { id: 'backup', label: 'Backup' },
] as const;
type TabId = (typeof TABS)[number]['id'];

export default function App() {
  const { data, saveFailed, actions } = useAppState();
  useRankIcons(data.rank);
  const [tab, setTab] = useState<TabId>('overview');
  const today = todayIso();
  const timeline = buildTimeline(data.promotions, data.rank, today);
  const defaults = sessionDefaults(data.sessions);
  const caughtBefore = caughtTally(data.sessions).map((entry) => entry.name);
  const next = nextCompetition(data.competitions, today);
  const hasCompeted = pastCompetitions(data.competitions, today).length > 0;

  return (
    <div className="app">
      <header className="app__header">
        <h1>BJJ Belt Tracker</h1>
      </header>

      <nav className="tabs" aria-label="Sections">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className="tabs__tab"
            aria-current={tab === id ? 'page' : undefined}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      {saveFailed && (
        <p className="error" role="alert">
          Your browser blocked saving. Changes will be lost when you close this page.
        </p>
      )}

      <main className="app__main">
        {tab === 'overview' && (
          <>
            <BackupReminder data={data} today={today} onBackUp={() => setTab('backup')} />
            <RankCard
              rank={data.rank}
              currentBeltSince={timeline.currentBeltSince}
              today={today}
              onSave={actions.setRank}
            />
            {next && <NextCompetitionCard competition={next} today={today} />}
            {data.rank && (
              <TimeInGradeCard rank={data.rank} promotions={data.promotions} today={today} />
            )}
            <MatTimeStats data={data} today={today} />
            {data.techniques.length > 0 && (
              <TechniqueFocusCard
                techniques={data.techniques}
                sessions={data.sessions}
                timeOff={data.timeOff}
                today={today}
              />
            )}
            <CaughtCard sessions={data.sessions} />
            {hasCompeted && (
              <CompetitionRecordCard competitions={data.competitions} today={today} />
            )}
            <section className="card" aria-labelledby="quick-log-heading">
              <h2 id="quick-log-heading">Log a session</h2>
              <SessionForm
                defaults={defaults}
                techniques={data.techniques}
                caughtBefore={caughtBefore}
                today={today}
                onSubmit={(input) => actions.addSession(input, today)}
              />
            </section>
          </>
        )}

        {tab === 'timeline' && (
          <TimelineView
            data={data}
            today={today}
            onAdd={(input) => actions.addPromotion(input, today)}
            onUpdate={(id, input) => actions.updatePromotion(id, input, today)}
            onDelete={actions.deletePromotion}
          />
        )}

        {tab === 'training' && (
          <>
            <section className="card" aria-labelledby="log-heading">
              <h2 id="log-heading">Log a session</h2>
              <SessionForm
                defaults={defaults}
                techniques={data.techniques}
                caughtBefore={caughtBefore}
                today={today}
                onSubmit={(input) => actions.addSession(input, today)}
              />
            </section>
            <TrendsCard
              sessions={data.sessions}
              timeOff={data.timeOff}
              weeklyGoal={data.weeklyGoal}
              today={today}
              onSetGoal={actions.setWeeklyGoal}
            />
            <CalendarCard data={data} today={today} />
            <TimeOffCard
              timeOff={data.timeOff}
              sessions={data.sessions}
              today={today}
              onAdd={actions.addTimeOff}
              onUpdate={actions.updateTimeOff}
              onDelete={actions.deleteTimeOff}
            />
            <section className="card" aria-labelledby="sessions-heading">
              <h2 id="sessions-heading">Sessions</h2>
              <SessionList
                sessions={data.sessions}
                techniques={data.techniques}
                today={today}
                onUpdate={(id, input) => actions.updateSession(id, input, today)}
                onDelete={actions.deleteSession}
              />
            </section>
          </>
        )}

        {tab === 'techniques' && (
          <TechniquesView
            techniques={data.techniques}
            sessions={data.sessions}
            competitions={data.competitions}
            timeOff={data.timeOff}
            today={today}
            onAdd={(input) => actions.addTechnique(input, today)}
            onUpdate={(id, input) => actions.updateTechnique(id, input, today)}
            onSetStatus={(id, status) => actions.setTechniqueStatus(id, status, today)}
            onDelete={actions.deleteTechnique}
          />
        )}

        {tab === 'compete' && (
          <CompetitionsView
            competitions={data.competitions}
            techniques={data.techniques}
            today={today}
            onAdd={(input) => actions.addCompetition(input, today)}
            onUpdate={(id, input) => actions.updateCompetition(id, input, today)}
            onDelete={actions.deleteCompetition}
            onAddMatch={(competitionId, input) => actions.addMatch(competitionId, input, today)}
            onUpdateMatch={actions.updateMatch}
            onDeleteMatch={actions.deleteMatch}
          />
        )}

        {tab === 'backup' && (
          <BackupView data={data} today={today} onRestore={actions.replaceData} />
        )}
      </main>
    </div>
  );
}
