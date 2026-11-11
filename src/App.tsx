import { useState } from 'react';
import { MatTimeStats } from './components/MatTimeStats';
import { RankCard } from './components/RankCard';
import { SessionForm } from './components/SessionForm';
import { SessionList } from './components/SessionList';
import { TimelineView } from './components/TimelineView';
import { todayIso } from './domain/dates';
import { sessionDefaults } from './domain/sessions';
import { buildTimeline } from './domain/timeline';
import { useAppState } from './state/useAppState';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'training', label: 'Training' },
] as const;
type TabId = (typeof TABS)[number]['id'];

export default function App() {
  const { data, saveFailed, actions } = useAppState();
  const [tab, setTab] = useState<TabId>('overview');
  const today = todayIso();
  const timeline = buildTimeline(data.promotions, data.rank, today);
  const defaults = sessionDefaults(data.sessions);

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
            <RankCard
              rank={data.rank}
              currentBeltSince={timeline.currentBeltSince}
              today={today}
              onSave={actions.setRank}
            />
            <MatTimeStats data={data} />
            <section className="card" aria-labelledby="quick-log-heading">
              <h2 id="quick-log-heading">Log a session</h2>
              <SessionForm
                defaults={defaults}
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
                today={today}
                onSubmit={(input) => actions.addSession(input, today)}
              />
            </section>
            <section className="card" aria-labelledby="sessions-heading">
              <h2 id="sessions-heading">Sessions</h2>
              <SessionList
                sessions={data.sessions}
                today={today}
                onUpdate={(id, input) => actions.updateSession(id, input, today)}
                onDelete={actions.deleteSession}
              />
            </section>
          </>
        )}
      </main>
    </div>
  );
}
