import { useState } from 'react';
import {
  addCompetition,
  addMatch,
  deleteCompetition,
  deleteMatch,
  updateCompetition,
  updateMatch,
  type CompetitionInput,
  type MatchInput,
} from '../domain/competitions';
import { setWeeklyGoal } from '../domain/goals';
import {
  addPromotion,
  deletePromotion,
  setRank,
  updatePromotion,
  type PromotionInput,
} from '../domain/promotions';
import { addSession, deleteSession, updateSession, type SessionInput } from '../domain/sessions';
import type { AppData, Rank, Result } from '../domain/types';
import { loadData, saveData } from './storage';

/** Each action returns an error message, or null when the change was applied. */
export interface AppActions {
  setRank(rank: Rank): string | null;
  addPromotion(input: PromotionInput, today: string): string | null;
  updatePromotion(id: string, input: PromotionInput, today: string): string | null;
  deletePromotion(id: string): void;
  addSession(input: SessionInput, today: string): string | null;
  updateSession(id: string, input: SessionInput, today: string): string | null;
  deleteSession(id: string): void;
  /** Null clears the goal. */
  setWeeklyGoal(goal: number | null): string | null;
  addCompetition(input: CompetitionInput, today: string): string | null;
  updateCompetition(id: string, input: CompetitionInput, today: string): string | null;
  deleteCompetition(id: string): void;
  addMatch(competitionId: string, input: MatchInput): string | null;
  updateMatch(competitionId: string, matchId: string, input: MatchInput): string | null;
  deleteMatch(competitionId: string, matchId: string): void;
  /** Swaps in a whole data set, e.g. from a backup file. */
  replaceData(data: AppData): void;
}

export function useAppState(): { data: AppData; saveFailed: boolean; actions: AppActions } {
  const [data, setData] = useState<AppData>(loadData);
  const [saveFailed, setSaveFailed] = useState(false);

  const commit = (next: AppData) => {
    setData(next);
    setSaveFailed(!saveData(next));
  };

  const apply = (result: Result<AppData>): string | null => {
    if (!result.ok) return result.error;
    commit(result.value);
    return null;
  };

  const actions: AppActions = {
    setRank: (rank) => apply(setRank(data, rank)),
    addPromotion: (input, today) => apply(addPromotion(data, input, today)),
    updatePromotion: (id, input, today) => apply(updatePromotion(data, id, input, today)),
    deletePromotion: (id) => commit(deletePromotion(data, id)),
    addSession: (input, today) => apply(addSession(data, input, today)),
    updateSession: (id, input, today) => apply(updateSession(data, id, input, today)),
    deleteSession: (id) => commit(deleteSession(data, id)),
    setWeeklyGoal: (goal) => apply(setWeeklyGoal(data, goal)),
    addCompetition: (input, today) => apply(addCompetition(data, input, today)),
    updateCompetition: (id, input, today) => apply(updateCompetition(data, id, input, today)),
    deleteCompetition: (id) => commit(deleteCompetition(data, id)),
    addMatch: (competitionId, input) => apply(addMatch(data, competitionId, input)),
    updateMatch: (competitionId, matchId, input) =>
      apply(updateMatch(data, competitionId, matchId, input)),
    deleteMatch: (competitionId, matchId) => commit(deleteMatch(data, competitionId, matchId)),
    replaceData: commit,
  };

  return { data, saveFailed, actions };
}
