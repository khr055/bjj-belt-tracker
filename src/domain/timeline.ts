import { sortPromotions } from './promotions';
import { rankValue } from './rank';
import { BELTS, type Belt, type Promotion, type Rank } from './types';

export interface TimelineEntry {
  promotion: Promotion;
  kind: 'start' | 'belt' | 'stripe';
  /** When the next rank began. `today` while this is the current rank; null if not known. */
  endDate: string | null;
  ongoing: boolean;
}

export interface BeltSpan {
  belt: Belt;
  startDate: string;
  /** When the next belt began. `today` while this is the current belt; null if not known. */
  endDate: string | null;
  ongoing: boolean;
}

export interface Timeline {
  /** Oldest first. */
  entries: TimelineEntry[];
  /** Oldest first, one per belt that has at least one logged promotion. */
  belts: BeltSpan[];
  /** True when the current rank is higher than anything in the logged history. */
  currentRankUndated: boolean;
  /** Earliest logged date at the current belt, if any. */
  currentBeltSince: string | null;
}

function entryKind(promotion: Promotion): TimelineEntry['kind'] {
  if (promotion.stripes > 0) return 'stripe';
  return promotion.belt === 'white' ? 'start' : 'belt';
}

export function buildTimeline(
  promotions: Promotion[],
  currentRank: Rank | null,
  today: string,
): Timeline {
  const sorted = sortPromotions(promotions);
  const last = sorted[sorted.length - 1];
  const currentValue = currentRank ? rankValue(currentRank) : null;
  // With no rank set, the newest promotion is taken to be the current rank.
  const lastIsCurrent = !!last && (currentValue === null || rankValue(last) === currentValue);
  const currentBelt: Belt | null = currentRank?.belt ?? last?.belt ?? null;

  const entries = sorted.map<TimelineEntry>((promotion, index) => {
    const next = sorted[index + 1];
    if (next) return { promotion, kind: entryKind(promotion), endDate: next.date, ongoing: false };
    return {
      promotion,
      kind: entryKind(promotion),
      endDate: lastIsCurrent ? today : null,
      ongoing: lastIsCurrent,
    };
  });

  const belts: BeltSpan[] = [];
  for (const belt of BELTS) {
    const first = sorted.find((p) => p.belt === belt);
    if (!first) continue;
    const beltIndex = BELTS.indexOf(belt);
    const nextBeltStart = sorted.find((p) => BELTS.indexOf(p.belt) > beltIndex);
    if (nextBeltStart) {
      belts.push({ belt, startDate: first.date, endDate: nextBeltStart.date, ongoing: false });
    } else {
      const ongoing = belt === currentBelt;
      belts.push({ belt, startDate: first.date, endDate: ongoing ? today : null, ongoing });
    }
  }

  return {
    entries,
    belts,
    currentRankUndated: currentValue !== null && !lastIsCurrent,
    currentBeltSince: belts.find((span) => span.belt === currentBelt)?.startDate ?? null,
  };
}
