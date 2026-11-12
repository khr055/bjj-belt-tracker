import { describe, expect, it } from 'vitest';
import {
  addCompetition,
  addMatch,
  competitionRecord,
  deleteCompetition,
  deleteMatch,
  describeMatch,
  formatMedals,
  formatMethods,
  formatTally,
  MAX_MATCHES,
  sortCompetitions,
  tally,
  updateCompetition,
  updateMatch,
  type CompetitionInput,
  type MatchInput,
} from './competitions';
import { emptyData, type AppData, type Competition, type Result } from './types';

const TODAY = '2026-11-11';
const OPEN: CompetitionInput = { name: 'Autumn Open', date: '2026-10-17', type: 'gi' };

function must(result: Result<AppData>): AppData {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

function errorOf(result: Result<AppData>): string {
  if (result.ok) throw new Error('expected an error');
  return result.error;
}

function withCompetition(input: CompetitionInput = OPEN): { data: AppData; id: string } {
  const data = must(addCompetition(emptyData(), input, TODAY));
  return { data, id: data.competitions[0].id };
}

describe('competitions', () => {
  it('logs a competition with tidy optional details and no matches', () => {
    const { data } = withCompetition({
      ...OPEN,
      name: '  Autumn Open ',
      division: ' Adult, blue belt ',
      medal: 'gold',
      notes: '   ',
    });
    expect(data.competitions[0]).toMatchObject({
      name: 'Autumn Open',
      date: '2026-10-17',
      type: 'gi',
      division: 'Adult, blue belt',
      medal: 'gold',
      matches: [],
    });
    expect(data.competitions[0]).not.toHaveProperty('notes');
  });

  it.each([
    [{ ...OPEN, name: '   ' }, 'competition name'],
    [{ ...OPEN, name: 'x'.repeat(81) }, '80 characters'],
    [{ ...OPEN, date: '2026-11-12' }, 'future'],
    [{ ...OPEN, date: 'last month' }, 'valid competition date'],
    [{ ...OPEN, type: 'judo' }, 'gi or no-gi'],
    [{ ...OPEN, medal: 'platinum' }, 'no medal'],
    [{ ...OPEN, notes: 'x'.repeat(501) }, '500 characters'],
  ])('rejects %o', (input, message) => {
    expect(errorOf(addCompetition(emptyData(), input as CompetitionInput, TODAY))).toContain(message);
  });

  it('edits the details and keeps the matches', () => {
    const { data, id } = withCompetition();
    const withMatch = must(addMatch(data, id, { result: 'win', method: 'points' }));

    const edited = must(
      updateCompetition(withMatch, id, { ...OPEN, name: 'Winter Open', type: 'nogi' }, TODAY),
    );
    expect(edited.competitions[0]).toMatchObject({ id, name: 'Winter Open', type: 'nogi' });
    expect(edited.competitions[0].matches).toEqual(withMatch.competitions[0].matches);

    expect(errorOf(updateCompetition(withMatch, 'gone', OPEN, TODAY))).toContain('no longer exists');
    expect(deleteCompetition(withMatch, id).competitions).toEqual([]);
  });

  it('lists the newest competition first', () => {
    let data = must(addCompetition(emptyData(), { ...OPEN, name: 'B', date: '2026-05-01' }, TODAY));
    data = must(addCompetition(data, { ...OPEN, name: 'C', date: '2026-09-01' }, TODAY));
    data = must(addCompetition(data, { ...OPEN, name: 'A', date: '2025-01-01' }, TODAY));
    expect(sortCompetitions(data.competitions).map((c) => c.name)).toEqual(['C', 'B', 'A']);
  });
});

describe('matches', () => {
  it('adds matches in the order they were fought', () => {
    const { data, id } = withCompetition();
    let next = must(addMatch(data, id, { result: 'win', method: 'submission', submission: ' Armbar ' }));
    next = must(addMatch(next, id, { result: 'loss', method: 'points', opponent: ' A. Rival ' }));
    expect(next.competitions[0].matches).toMatchObject([
      { result: 'win', method: 'submission', submission: 'Armbar' },
      { result: 'loss', method: 'points', opponent: 'A. Rival' },
    ]);
  });

  it('drops details that do not apply to the result', () => {
    const { data, id } = withCompetition();
    let next = must(addMatch(data, id, { result: 'draw', method: 'points', submission: 'Armbar' }));
    next = must(addMatch(next, id, { result: 'win', method: 'points', submission: 'Armbar' }));
    const [draw, win] = next.competitions[0].matches;
    expect(draw).toEqual({ id: draw.id, result: 'draw' });
    expect(win).toEqual({ id: win.id, result: 'win', method: 'points' });
  });

  it.each([
    [{ result: 'forfeit' }, 'win, loss or draw'],
    [{ result: 'win' }, 'how the match was decided'],
    [{ result: 'loss', method: 'coin toss' }, 'how the match was decided'],
    [{ result: 'win', method: 'submission', submission: 'x'.repeat(61) }, '60 characters'],
    [{ result: 'win', method: 'points', opponent: 'x'.repeat(81) }, '80 characters'],
  ])('rejects %o', (input, message) => {
    const { data, id } = withCompetition();
    expect(errorOf(addMatch(data, id, input as MatchInput))).toContain(message);
  });

  it('needs the competition to exist and stops at the limit', () => {
    const { data, id } = withCompetition();
    const input: MatchInput = { result: 'win', method: 'points' };
    expect(errorOf(addMatch(data, 'gone', input))).toContain('no longer exists');

    let full = data;
    for (let index = 0; index < MAX_MATCHES; index += 1) full = must(addMatch(full, id, input));
    expect(errorOf(addMatch(full, id, input))).toContain(`${MAX_MATCHES} matches`);
  });

  it('edits and removes a match', () => {
    const { data, id } = withCompetition();
    const added = must(addMatch(data, id, { result: 'win', method: 'points' }));
    const matchId = added.competitions[0].matches[0].id;

    const edited = must(updateMatch(added, id, matchId, { result: 'loss', method: 'decision' }));
    expect(edited.competitions[0].matches).toEqual([
      { id: matchId, result: 'loss', method: 'decision' },
    ]);
    expect(errorOf(updateMatch(added, id, 'gone', { result: 'draw' }))).toContain('no longer exists');

    expect(deleteMatch(added, id, matchId).competitions[0].matches).toEqual([]);
    expect(deleteMatch(added, 'gone', matchId)).toBe(added);
  });
});

describe('describing results', () => {
  it('describes how a match ended', () => {
    expect(describeMatch({ id: 'a', result: 'win', method: 'submission', submission: 'Armbar' })).toBe(
      'Win by submission (Armbar)',
    );
    expect(describeMatch({ id: 'b', result: 'win', method: 'submission' })).toBe('Win by submission');
    expect(describeMatch({ id: 'c', result: 'loss', method: 'points' })).toBe('Loss on points');
    expect(describeMatch({ id: 'd', result: 'loss', method: 'decision' })).toBe(
      "Loss by referee's decision",
    );
    expect(describeMatch({ id: 'e', result: 'draw' })).toBe('Draw');
  });

  it('formats a tally, mentioning draws only when there are some', () => {
    expect(formatTally({ wins: 1, losses: 1, draws: 0 })).toBe('1 win · 1 loss');
    expect(formatTally({ wins: 3, losses: 0, draws: 2 })).toBe('3 wins · 0 losses · 2 draws');
  });
});

describe('competitionRecord', () => {
  const competitions: Competition[] = [
    {
      id: 'c1',
      date: '2026-10-17',
      name: 'Autumn Open',
      type: 'gi',
      medal: 'gold',
      matches: [
        { id: 'm1', result: 'win', method: 'submission', submission: 'Armbar' },
        { id: 'm2', result: 'win', method: 'points' },
        { id: 'm3', result: 'win', method: 'submission' },
      ],
    },
    {
      id: 'c2',
      date: '2026-05-02',
      name: 'Spring Open',
      type: 'nogi',
      medal: 'bronze',
      matches: [
        { id: 'm4', result: 'win', method: 'advantages' },
        { id: 'm5', result: 'loss', method: 'points' },
      ],
    },
    {
      id: 'c3',
      date: '2025-11-08',
      name: 'Sub-only invitational',
      type: 'nogi',
      matches: [{ id: 'm6', result: 'draw' }],
    },
  ];

  it('totals matches, methods and medals across competitions', () => {
    const record = competitionRecord(competitions);
    expect(record).toMatchObject({ competitions: 3, matches: 6, wins: 4, losses: 1, draws: 1 });
    expect(record.winsBy).toEqual({
      submission: 2,
      points: 1,
      advantages: 1,
      decision: 0,
      disqualification: 0,
    });
    expect(record.lossesBy.points).toBe(1);
    expect(record.medals).toEqual({ gold: 1, silver: 0, bronze: 1 });

    expect(formatMethods(record.winsBy)).toBe('2 by submission, 1 on points, 1 on advantages');
    expect(formatMethods(record.lossesBy)).toBe('1 on points');
    expect(formatMedals(record.medals)).toBe('1 gold, 1 bronze');
  });

  it('is all zeros with nothing logged', () => {
    const record = competitionRecord([]);
    expect(record).toMatchObject({ competitions: 0, matches: 0, wins: 0, losses: 0, draws: 0 });
    expect(formatMethods(record.winsBy)).toBe('');
    expect(formatMedals(record.medals)).toBe('');
  });

  it('tallies one competition on its own', () => {
    expect(tally(competitions[1].matches)).toEqual({ wins: 1, losses: 1, draws: 0 });
  });
});
