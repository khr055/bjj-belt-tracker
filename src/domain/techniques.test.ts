import { describe, expect, it } from 'vitest';
import {
  addSession,
  filterSessions,
  sessionLanded,
  sessionTechniques,
  updateSession,
} from './sessions';
import {
  activityOf,
  addTechnique,
  cleanLink,
  linkHost,
  nextStatus,
  sessionsFor,
  sessionsToLand,
  setTechniqueStatus,
  daysUntrained,
  deleteTechnique,
  formatUntrained,
  groupByPosition,
  isStale,
  landedIn,
  MAX_TECHNIQUES,
  sortTechniques,
  statusCounts,
  techniqueActivity,
  techniqueFocus,
  untrained,
  updateTechnique,
  type TechniqueInput,
} from './techniques';
import { emptyData, type AppData, type Session, type Technique, type TimeOff } from './types';

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
      landed: 0,
      lastLanded: null,
    });
    expect(activityOf(activity, technique({ id: 'b' }))).toEqual({
      sessions: 1,
      lastTrained: '2026-11-05',
      landed: 0,
      lastLanded: null,
    });
    expect(activityOf(activity, technique({ id: 'never' }))).toEqual({
      sessions: 0,
      lastTrained: null,
      landed: 0,
      lastLanded: null,
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

describe('techniques landed in rolling', () => {
  const data = mustAdd(mustAdd(emptyData(), KNEE_CUT), ARMBAR);
  const [kneeCut, armbar] = data.techniques;
  const base = { date: TODAY, durationMinutes: 60, type: 'gi' } as const;

  it('keeps the techniques landed on a session, each once, and only ones in the journal', () => {
    const result = addSession(
      data,
      { ...base, techniqueIds: [kneeCut.id], landedIds: [armbar.id, 'deleted', armbar.id] },
      TODAY,
    );
    if (!result.ok) throw new Error(result.error);
    const [logged] = result.value.sessions;
    expect(logged.landedIds).toEqual([armbar.id]);
    expect(sessionLanded(logged, data.techniques).map((t) => t.name)).toEqual(['Armbar']);
    expect(landedIn(armbar, logged)).toBe(true);
    expect(landedIn(kneeCut, logged)).toBe(false);

    const none = addSession(data, { ...base, landedIds: [] }, TODAY);
    expect(none.ok && none.value.sessions[0]).not.toHaveProperty('landedIds');
  });

  it('counts landing a technique as training it, and says how often it has landed', () => {
    const sessions: Session[] = [
      { ...session('s1', '2026-10-01', ['a']) },
      { ...session('s2', '2026-10-20', ['a']), landedIds: ['a'] },
      // Landed without being ticked as worked on.
      { ...session('s3', '2026-11-05'), landedIds: ['a', 'b'] },
      { ...session('s4', '2026-11-09', ['a']) },
    ];
    const activity = techniqueActivity(sessions);
    expect(activityOf(activity, technique({ id: 'a' }))).toEqual({
      sessions: 4,
      lastTrained: '2026-11-09',
      landed: 2,
      lastLanded: '2026-11-05',
    });
    expect(activityOf(activity, technique({ id: 'b' }))).toEqual({
      sessions: 1,
      lastTrained: '2026-11-05',
      landed: 1,
      lastLanded: '2026-11-05',
    });
    expect(sessionsFor(technique({ id: 'b' }), sessions).map((s) => s.id)).toEqual(['s3']);
  });

  it('finds a session by a technique landed in it', () => {
    const result = addSession(data, { ...base, landedIds: [armbar.id] }, TODAY);
    if (!result.ok) throw new Error(result.error);
    const filter = { type: 'all', text: 'armbar' } as const;
    expect(filterSessions(result.value.sessions, filter, data.techniques)).toHaveLength(1);
  });

  it('takes a deleted technique off the sessions it was landed in', () => {
    const result = addSession(
      data,
      { ...base, techniqueIds: [kneeCut.id, armbar.id], landedIds: [armbar.id] },
      TODAY,
    );
    if (!result.ok) throw new Error(result.error);
    const [left] = deleteTechnique(result.value, armbar.id).sessions;
    expect(left.techniqueIds).toEqual([kneeCut.id]);
    expect(left).not.toHaveProperty('landedIds');
  });
});

describe('going stale around time off', () => {
  const off = (startDate: string, endDate?: string): TimeOff => ({
    id: startDate,
    startDate,
    ...(endDate ? { endDate } : {}),
    reason: 'injury',
  });
  const drilling = technique({ id: 'x', status: 'drilling' });
  // Trained 38 days before today.
  const trained = { lastTrained: '2026-10-04' };

  it('pauses the clock during time off', () => {
    expect(untrained(drilling, trained, TODAY)).toEqual({ days: 38, daysOff: 0 });
    expect(isStale(drilling, trained, TODAY)).toBe(true);

    // Four weeks off, starting ten days after it was trained.
    const timeOff = [off('2026-10-14', '2026-11-10')];
    expect(untrained(drilling, trained, TODAY, timeOff)).toEqual({ days: 10, daysOff: 28 });
    expect(daysUntrained(drilling, trained, TODAY, timeOff)).toBe(10);
    expect(isStale(drilling, trained, TODAY, timeOff)).toBe(false);
  });

  it('goes stale once 30 days that were not time off have passed', () => {
    const timeOff = [off('2026-10-14', '2026-10-21')];
    // 38 days less 8 off is exactly 30.
    expect(untrained(drilling, trained, TODAY, timeOff)).toEqual({ days: 30, daysOff: 8 });
    expect(isStale(drilling, trained, TODAY, timeOff)).toBe(true);
    expect(isStale(drilling, trained, TODAY, [off('2026-10-14', '2026-10-22')])).toBe(false);
  });

  it('holds everything while time off is still going on', () => {
    const timeOff = [off('2026-10-14')];
    expect(untrained(drilling, trained, TODAY, timeOff)).toEqual({ days: 9, daysOff: 29 });
    expect(untrained(drilling, trained, '2027-03-01', timeOff)).toMatchObject({ days: 9 });
  });

  it('ignores time off from before it was last trained, and the day it was trained', () => {
    expect(untrained(drilling, trained, TODAY, [off('2026-09-01', '2026-10-04')])).toEqual({
      days: 38,
      daysOff: 0,
    });
  });

  it('pauses the clock for a technique that has never been trained', () => {
    const added = technique({ id: 'new', addedOn: '2026-10-01' });
    const never = { lastTrained: null };
    expect(untrained(added, never, TODAY, [off('2026-10-05', '2026-10-25')])).toEqual({
      days: 20,
      daysOff: 21,
    });
  });

  it('says how long, and how much time off was left out', () => {
    expect(formatUntrained({ days: 31, daysOff: 0 })).toBe('31 days');
    expect(formatUntrained({ days: 31, daysOff: 28 })).toBe('31 days, not counting 28 days off');
    expect(formatUntrained({ days: 1, daysOff: 1 })).toBe('1 day, not counting 1 day off');
  });

  it('leaves time off out of what the overview calls stale', () => {
    const techniques = [
      technique({ id: 'held', name: 'Held' }),
      technique({ id: 'stale', name: 'Stale' }),
    ];
    const sessions = [session('s1', '2026-10-04', ['held']), session('s2', '2026-08-01', ['stale'])];
    const timeOff = [off('2026-10-14', '2026-11-10')];
    const focus = techniqueFocus({ techniques, sessions, timeOff }, TODAY);
    expect(focus.stale).toEqual([{ technique: techniques[1], days: 74, daysOff: 28 }]);
    // Held back from stale by the time off, but not trained in the last 30 days: in neither list.
    expect(focus.recent).toEqual([]);
  });
});

describe('a link on a technique', () => {
  it('keeps a web address, adding https when no scheme was typed', () => {
    expect(cleanLink('https://www.youtube.com/watch?v=abc')).toBe(
      'https://www.youtube.com/watch?v=abc',
    );
    expect(cleanLink('  youtube.com/watch?v=abc ')).toBe('https://youtube.com/watch?v=abc');
    expect(cleanLink('http://example.com')).toBe('http://example.com/');
    expect(cleanLink('')).toBeUndefined();
    expect(cleanLink('   ')).toBeUndefined();
    expect(cleanLink(undefined)).toBeUndefined();
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,hello',
    'file:///etc/passwd',
    'mailto:coach@example.com',
    'not a link',
    'armbar',
    `https://example.com/${'x'.repeat(500)}`,
  ])('refuses %s', (value) => {
    expect(cleanLink(value)).toBeNull();
  });

  it('refuses anything that is not text', () => {
    expect(cleanLink(7)).toBeNull();
    expect(cleanLink({ href: 'https://example.com' })).toBeNull();
  });

  it('is stored tidied, survives other edits and a change of stage, and can be removed', () => {
    let data = mustAdd(emptyData(), { ...KNEE_CUT, link: 'youtube.com/watch?v=abc' });
    const { id } = data.techniques[0];
    expect(data.techniques[0].link).toBe('https://youtube.com/watch?v=abc');

    const moved = setTechniqueStatus(data, id, 'landing', TODAY);
    if (!moved.ok) throw new Error(moved.error);
    expect(moved.value.techniques[0].link).toBe('https://youtube.com/watch?v=abc');

    const bad = updateTechnique(data, id, { ...KNEE_CUT, link: 'javascript:alert(1)' }, TODAY);
    expect(!bad.ok && bad.error).toContain('web address');

    const cleared = updateTechnique(data, id, { ...KNEE_CUT, link: '' }, TODAY);
    if (!cleared.ok) throw new Error(cleared.error);
    data = cleared.value;
    expect(data.techniques[0]).not.toHaveProperty('link');
  });

  it('names the site a link goes to', () => {
    expect(linkHost('https://www.youtube.com/watch?v=abc')).toBe('youtube.com');
    expect(linkHost('https://bjjfanatics.com/x')).toBe('bjjfanatics.com');
  });
});
