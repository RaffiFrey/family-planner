import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface HouseholdSelection {
  householdId: string | null;
  setHouseholdId: (id: string | null) => void;
}

/** Remembers which household the user last opened (UI state only; data lives in TanStack Query). */
export const useHouseholdSelection = create<HouseholdSelection>()(
  persist(
    (set) => ({
      householdId: null,
      setHouseholdId: (householdId) => set({ householdId }),
    }),
    { name: 'fp.household', storage: createJSONStorage(() => localStorage) },
  ),
);
