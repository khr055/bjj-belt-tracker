import type { Academy, Attendance, Away, Member, MemberRole } from './academy';
import { addDays } from './dates';
import type { Belt, Promotion } from './types';

/**
 * A made-up academy for trying the coach's screens before there are accounts to fill them. The
 * people are invented. Everything is worked out from `today`, so the lists a coach sees (minimum
 * time met, gone quiet, joined recently) always have someone in them, whenever it is opened.
 */

interface Person {
  name: string;
  role?: MemberRole;
  /** Days ago they joined. */
  joined: number;
  /** Belt, stripes and how many days ago each was awarded. */
  promotions: [Belt, number, number][];
  /** Sessions a week, on average. */
  perWeek: number;
  /** Days since their last session, when they have stopped coming. */
  quietFor?: number;
  /** Spells away, as days ago for the first and last day; no last day means still away. */
  away?: [number, number?][];
}

const PEOPLE: Person[] = [
  { name: 'Marco Silva', role: 'owner', joined: 2900, promotions: [['black', 0, 2600], ['black', 1, 1500], ['black', 2, 380]], perWeek: 5 },
  { name: 'Priya Nair', role: 'coach', joined: 2100, promotions: [['purple', 0, 1300], ['brown', 0, 520], ['brown', 2, 120]], perWeek: 4 },
  { name: 'Alex Romero', joined: 1500, promotions: [['white', 0, 1500], ['blue', 0, 1010], ['blue', 3, 300]], perWeek: 3 },
  { name: 'Beth Okafor', joined: 1250, promotions: [['white', 0, 1250], ['blue', 0, 800], ['blue', 2, 210]], perWeek: 2.5 },
  { name: 'Chen Wei', joined: 1900, promotions: [['blue', 0, 1400], ['purple', 0, 610], ['purple', 1, 240]], perWeek: 3.5 },
  { name: 'Dana Whitlock', joined: 420, promotions: [['white', 0, 420], ['white', 2, 200], ['white', 3, 75]], perWeek: 3 },
  { name: 'Emeka Obi', joined: 300, promotions: [['white', 0, 300], ['white', 1, 160]], perWeek: 2, quietFor: 34 },
  { name: 'Farah Haddad', joined: 700, promotions: [['white', 0, 700], ['white', 4, 260], ['blue', 0, 95]], perWeek: 3, away: [[26]] },
  { name: 'Gus Lindqvist', joined: 520, promotions: [['white', 0, 520], ['white', 2, 300], ['white', 4, 110]], perWeek: 4 },
  { name: 'Hana Sato', joined: 240, promotions: [['white', 0, 240], ['white', 1, 100]], perWeek: 1.5, quietFor: 23 },
  { name: 'Ivo Marek', joined: 610, promotions: [['white', 0, 610], ['blue', 0, 180]], perWeek: 2.5, away: [[70, 50]] },
  { name: 'Jo Castellan', joined: 150, promotions: [['white', 0, 150], ['white', 1, 40]], perWeek: 3 },
  { name: 'Kit Brennan', joined: 19, promotions: [['white', 0, 19]], perWeek: 3 },
  // Joined last week and not yet given a rank by a coach.
  { name: 'Lena Fischer', joined: 6, promotions: [], perWeek: 3 },
];

/** How far back attendance is made up for; enough for the charts and the counts shown. */
const HISTORY_DAYS = 140;

/** A small repeatable random number generator, so the same day always shows the same academy. */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function build(person: Person, index: number, today: string): Member {
  const next = random(index + 1);
  const away: Away[] = (person.away ?? []).map(([first, last]) => ({
    startDate: addDays(today, -first),
    ...(last !== undefined ? { endDate: addDays(today, -last) } : {}),
  }));
  const isAway = (date: string) =>
    away.some((spell) => spell.startDate <= date && date <= (spell.endDate ?? today));

  const attendance: Attendance[] = [];
  const from = Math.min(person.joined, HISTORY_DAYS);
  for (let ago = from; ago >= (person.quietFor ?? 0); ago -= 1) {
    const date = addDays(today, -ago);
    // Always drawn, so a spell away does not shift which other days are trained.
    const trains = next() < person.perWeek / 7;
    const long = next() < 0.3;
    const nogi = next() < 0.25;
    const openMat = next() < 0.15;
    if (!trains || isAway(date)) continue;
    attendance.push({
      date,
      durationMinutes: long ? 90 : 60,
      type: nogi ? 'nogi' : 'gi',
      kind: openMat ? 'open-mat' : 'class',
    });
  }
  // Whoever has gone quiet did train on their last day, so the count of days is exact.
  if (person.quietFor !== undefined && attendance.at(-1)?.date !== addDays(today, -person.quietFor)) {
    attendance.push({ date: addDays(today, -person.quietFor), durationMinutes: 60, type: 'gi', kind: 'class' });
  }

  const promotions: Promotion[] = person.promotions.map(([belt, stripes, ago]) => ({
    id: `sample-${index}-${belt}-${stripes}`,
    belt,
    stripes,
    date: addDays(today, -ago),
  }));
  return {
    id: `sample-${index}`,
    name: person.name,
    role: person.role ?? 'student',
    joinedOn: addDays(today, -person.joined),
    promotions,
    attendance,
    away,
  };
}

export function sampleAcademy(today: string): Academy {
  return {
    name: 'Riverside Jiu-Jitsu',
    joinCode: 'riverside-7q4k',
    members: PEOPLE.map((person, index) => build(person, index, today)),
  };
}
