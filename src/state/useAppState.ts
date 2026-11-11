import { useState } from 'react';
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
  };

  return { data, saveFailed, actions };
}
