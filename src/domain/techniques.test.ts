import { describe, expect, it } from 'vitest';
import { addSession, filterSessions, sessionTechniques, updateSession } from './sessions';
import {
  activityOf,
  addTechnique,
  nextStatus,
  sessionsFor,
  sessionsToLand,
  setTechniqueStatus,
  daysUntrained,
  deleteTechnique,
  groupByPosition,
  isStale,
  MAX_TECHNIQUES,
  sortTechniques,
  statusCounts,
  techniqueActivity,
  techniqueFocus,
  updateTechnique,
  type TechniqueInput,
} from './techniques';
import { emptyData, type AppData, type Session, type Technique } from './types';

const TODAY = '2026-11-11';

const KNEE_CUT: TechniqueInput = { name: 'Knee cut pass', position: 'passing', status: 'drilling' };
const ARMBAR: TechniqueInput = { name: 'Armbar', position: 'guard', status: 'learning' };

function mustAdd(data: AppData, input: TechniqueInput, today = TODAY): AppData {
  const result = addTechnique(data, input, today);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

function technique(overrides: Partial<Technique> & Pick<Technique, 'id'>): Technique {
  return {
    name: overrides.id,
    position: 'guard',
    status: 'drilling',
    addedOn: '2026-01-01',
    statusSince: '2026-01-01',
    ...overrides,
  };
}

function session(id: string, date: string, techniqueIds?: string[]): Session {
  return { id, date, durationMinutes: 60, type: 'gi', ...(techniqueIds ? { techniqueIds } : {}) };
}

describe('the technique list', () => {
  it('adds a technique, tidying its text and noting the day', () => {
    const data = mustAdd(emptyData(), { ...KNEE_CUT, name: '  Knee cut pass ', notes: '  ' });
    expect(data.techniques).toHaveLength(1);
    expect(data.techniques[0]).toEqual({
      id: data.techniques[0].id,
      name: 'Knee cut pass',
      position: 'passing',
      status: 'drilling',
      addedOn: TODAY,
      statusSince: TODAY,
    });
  });

  it.each([
    [{ ...KNEE_CUT, name: '   ' }, 'Enter the technique name.'],
    [{ ...KNEE_CUT, name: 'x'.repeat(61) }, '60 characters'],
    [{ ...KNEE_CUT, position: undefined }, 'Choose a position.'],
    [{ ...KNEE_CUT, position: 'ceiling' }, 'Choose a position.'],
    [{ ...KNEE_CUT, status: 'mastered' }, 'how far along'],
    [{ ...KNEE_CUT, notes: 'x'.repeat(501) }, '500 characters'],
  ])('rejects %o', (input, message) => {
    const result = addTechnique(emptyData(), input as TechniqueInput, TODAY);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain(message);
  });

  it('refuses a name that is already in the list, whatever its case', () => {
    const data = mustAdd(emptyData(), KNEE_CUT);
    const again = addTechnique(data, { ...ARMBAR, name: ' knee CUT pass' }, TODAY);
    expect(again).toEqual({ ok: false, error: 'You already have a technique called Knee cut pass.' });
  });

  it('holds a limited number of techniques', () => {
    const techniques = Array.from({ length: MAX_TECHNIQUES }, (_, index) =>
      technique({ id: `t${index}` }),
    );
    const result = addTechnique({ ...emptyData(), techniques }, KNEE_CUT, TODAY);
    expect(!result.ok && result.error).toContain(`up to ${MAX_TECHNIQUES}`);
  });

  it('edits a technique, keeping the day it was added', () => {
    let data = mustAdd(emptyData(), KNEE_CUT, '2026-10-01');
    data = mustAdd(data, ARMBAR);
    const { id } = data.techniques[0];

    const moved = updateTechnique(data, id, { ...KNEE_CUT, status: 'landing', notes: 'Works' }, TODAY);
    expect(moved.ok && moved.value.techniques[0]).toEqual({
      id,
      name: 'Knee cut pass',
      position: 'passing',
      status: 'landing',
      notes: 'Works',
      addedOn: '2026-10-01',
      statusSince: TODAY,
    });

    // An edit that leaves the stage alone leaves its date alone too.
    const renamed = updateTechnique(data, id, { ...KNEE_CUT, name: 'Knee slice' }, TODAY);
    expect(renamed.ok && renamed.value.techniques[0]).toMatchObject({
      name: 'Knee slice',
      statusSince: '2026-10-01',
    });

    // Its own name is not a clash; another technique's is.
    expect(updateTechnique(data, id, { ...KNEE_CUT, name: 'knee cut pass' }, TODAY).ok).toBe(true);
    const clash = updateTechnique(data, id, { ...KNEE_CUT, name: 'armbar' }, TODAY);
    expect(!clash.ok && clash.error).toContain('already have a technique called Armbar');

    const missing = updateTechnique(data, 'gone', KNEE_CUT, TODAY);
    expect(!missing.ok && missing.error).toBe('That technique no longer exists.');
  });

  it('moves a technique to the next stage and dates the move', () => {
    expect(nextStatus('learning')).toBe('drilling');
    expect(nextStatus('drilling')).toBe('landing');
    expect(nextStatus('landing')).toBeNull();

    const data = mustAdd(emptyData(), ARMBAR, '2026-10-01');
    const { id } = data.techniques[0];
    const moved = setTechniqueStatus(data, id, 'drilling', TODAY);
    expect(moved.ok && moved.value.techniques[0]).toMatchObject({
      status: 'drilling',
      addedOn: '2026-10-01',
      statusSince: TODAY,
    });
    // Setting the stage it already has changes nothing.
    expect(setTechniqueStatus(data, id, 'learning', TODAY)).toEqual({ ok: true, value: data });
    expect(setTechniqueStatus(data, 'gone', 'drilling', TODAY).ok).toBe(false);
  });

  it('sorts by name and groups by position in the usual order', () => {
    const techniques = [
      technique({ id: 'a', name: 'triangle', position: 'guard' }),
      technique({ id: 'b', name: 'Armbar', position: 'guard' }),
      technique({ id: 'c', name: 'Rear naked choke', position: 'back' }),
      technique({ id: 'd', name: 'Single leg', position: 'standing' }),
    ];
    expect(sortTechniques(techniques).map((t) => t.name)).toEqual([
      'Armbar',
      'Rear naked choke',
      'Single leg',
      'triangle',
    ]);
    expect(
      groupByPosition(techniques).map((group) => [
        group.position,
        group.techniques.map((t) => t.name),
      ]),
    ).toEqual([
      ['standing', ['Single leg']],
      ['guard', ['Armbar', 'triangle']],
      ['back', ['Rear naked choke']],
    ]);
  });

  it('counts techniques at each stage', () => {
    const techniques = [
      technique({ id: 'a', status: 'learning' }),
      technique({ id: 'b', status: 'landing' }),
      technique({ id: 'c', status: 'landing' }),
    ];
    expect(statusCounts(techniques)).toEqual({ learning: 1, drilling: 0, landing: 2 });
    expect(statusCounts([])).toEqual({ learning: 0, drilling: 0, landing: 0 });
  });
});

describe('techniques on sessions', () => {
  const data = mustAdd(mustAdd(emptyData(), KNEE_CUT), ARMBAR);
  const [kneeCut, armbar] = data.techniques;
  const base = { date: TODAY, durationMinutes: 60, type: 'gi' } as const;

  it('keeps the techniques ticked on a session, each once, and only ones in the journal', () => {
    const result = addSession(
      data,
      { ...base, techniqueIds: [armbar.id, 'deleted', armbar.id, kneeCut.id] },
      TODAY,
    );
    expect(result.ok && result.value.sessions[0].techniqueIds).toEqual([armbar.id, kneeCut.id]);
    expect(
      result.ok && sessionTechniques(result.value.sessions[0], data.techniques).map((t) => t.name),
    ).toEqual(['Armbar', 'Knee cut pass']);
  });

  it('leaves the list off a session with none', () => {
    const none = addSession(data, { ...base, techniqueIds: [] }, TODAY);
    expect(none.ok && none.value.sessions[0]).not.toHaveProperty('techniqueIds');

    const logged = addSession(data, { ...base, techniqueIds: [armbar.id] }, TODAY);
    if (!logged.ok) throw new Error(logged.error);
    const { id } = logged.value.sessions[0];
    const cleared = updateSession(logged.value, id, { ...base, techniqueIds: [] }, TODAY);
    expect(cleared.ok && cleared.value.sessions[0]).toEqual({ id, ...base });
  });

  it('limits how many techniques one session can hold', () => {
    const many = Array.from({ length: 21 }, (_, index) => `t${index}`);
    const result = addSession(data, { ...base, techniqueIds: many }, TODAY);
    expect(!result.ok && result.error).toBe('Choose up to 20 techniques for a session.');
  });

  it('takes a deleted technique off its sessions and keeps the sessions', () => {
    const sessions = [
      session('s1', '2026-11-01', [kneeCut.id, armbar.id]),
      session('s2', '2026-11-02', [kneeCut.id]),
      session('s3', '2026-11-03'),
    ];
    const after = deleteTechnique({ ...data, sessions }, kneeCut.id);
    expect(after.techniques).toEqual([armbar]);
    expect(after.sessions).toEqual([
      session('s1', '2026-11-01', [armbar.id]),
      session('s2', '2026-11-02'),
      session('s3', '2026-11-03'),
    ]);
  });

  it('finds sessions by the name of a technique worked on, as well as by their notes', () => {
    const sessions: Session[] = [
      session('a', '2026-11-01', [kneeCut.id]),
      { ...session('b', '2026-11-02', [armbar.id]), notes: 'Then knee shield' },
      session('c', '2026-11-03'),
    ];
    const ids = (text: string) =>
      filterSessions(sessions, { type: 'all', text }, data.techniques).map((s) => s.id);
    expect(ids('knee')).toEqual(['a', 'b']);
    expect(ids('knee cut')).toEqual(['a']);
    expect(ids('armbar shield')).toEqual(['b']);
    expect(ids('')).toEqual(['a', 'b', 'c']);
  });
});

describe('how often and how recently a technique is trained', () => {
  const sessions = [
    session('s1', '2026-10-01', ['a']),
    session('s2', '2026-11-05', ['a', 'b']),
    session('s3', '2026-10-20', ['a']),
    session('s4', '2026-11-09'),
  ];
  const activity = techniqueActivity(sessions);

  it('counts sessions and finds the latest one', () => {
    expect(activityOf(activity, technique({ id: 'a' }))).toEqual({
      sessions: 3,
      lastTrained: '2026-11-05',
    });
    expect(activityOf(activity, technique({ id: 'b' }))).toEqual({
      sessions: 1,
      lastTrained: '2026-11-05',
    });
    expect(activityOf(activity, technique({ id: 'never' }))).toEqual({
      sessions: 0,
      lastTrained: null,
    });
  });

  it('counts the days since it was trained, or since it was added if that is later', () => {
    const none = { sessions: 0, lastTrained: null };
    expect(daysUntrained(technique({ id: 'x', addedOn: '2026-11-01' }), none, TODAY)).toBe(10);
    const trained = { sessions: 1, lastTrained: '2026-11-05' };
    expect(daysUntrained(technique({ id: 'x', addedOn: '2026-11-01' }), trained, TODAY)).toBe(6);
    // Ticked on a back-dated session: the day it was added is the later of the two.
    expect(daysUntrained(technique({ id: 'x', addedOn: '2026-11-10' }), trained, TODAY)).toBe(1);
  });

  it('goes stale after 30 days, unless it is already landing in rolling', () => {
    const on = (lastTrained: string) => ({ sessions: 1, lastTrained });
    const drilling = technique({ id: 'x', status: 'drilling' });
    expect(isStale(drilling, on('2026-10-13'), TODAY)).toBe(false);
    expect(isStale(drilling, on('2026-10-12'), TODAY)).toBe(true);
    expect(isStale(technique({ id: 'x', status: 'learning' }), on('2026-10-12'), TODAY)).toBe(true);
    expect(isStale(technique({ id: 'x', status: 'landing' }), on('2026-01-01'), TODAY)).toBe(false);
  });
});

describe('a technique\'s history', () => {
  const sessions = [
    session('s1', '2026-10-01', ['a']),
    session('s2', '2026-11-05', ['a', 'b']),
    session('s3', '2026-10-20', ['a']),
    session('s4', '2026-11-09', ['b']),
  ];

  it('lists the sessions it was trained in, newest first', () => {
    expect(sessionsFor(technique({ id: 'a' }), sessions).map((s) => s.id)).toEqual([
      's2',
      's3',
      's1',
    ]);
    expect(sessionsFor(technique({ id: 'never' }), sessions)).toEqual([]);
  });

  it('counts the sessions it took to start landing in rolling', () => {
    const landed = technique({ id: 'a', status: 'landing', statusSince: '2026-10-20' });
    expect(sessionsToLand(landed, sessions)).toBe(2);
    expect(sessionsToLand(technique({ id: 'a', status: 'drilling' }), sessions)).toBeNull();
  });
});

describe('techniqueFocus', () => {
  it('lists what was trained lately and what has gone stale', () => {
    const techniques = [
      technique({ id: 'recent', name: 'Recent' }),
      technique({ id: 'latest', name: 'Latest', status: 'learning' }),
      technique({ id: 'stale', name: 'Stale' }),
      technique({ id: 'staler', name: 'Staler', status: 'learning' }),
      technique({ id: 'landed', name: 'Landed', status: 'landing' }),
      technique({ id: 'new', name: 'New', addedOn: '2026-11-10' }),
    ];
    const sessions = [
      session('s1', '2026-11-03', ['recent', 'landed']),
      session('s2', '2026-11-09', ['latest']),
      session('s3', '2026-10-01', ['stale']),
    ];
    const focus = techniqueFocus({ techniques, sessions }, TODAY);

    expect(focus.counts).toEqual({ learning: 2, drilling: 3, landing: 1 });
    expect(focus.recent.map((entry) => [entry.technique.name, entry.lastTrained])).toEqual([
      ['Latest', '2026-11-09'],
      ['Recent', '2026-11-03'],
    ]);
    // Never trained counts from the day it was added.
    expect(focus.stale.map((entry) => [entry.technique.name, entry.days])).toEqual([
      ['Staler', 314],
      ['Stale', 41],
    ]);
  });

  it('is empty when there are no techniques', () => {
    expect(techniqueFocus(emptyData(), TODAY)).toEqual({
      counts: { learning: 0, drilling: 0, landing: 0 },
      recent: [],
      stale: [],
    });
  });
});
