"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export interface SalesFocusState {
  sectionId: string | null;
  label: string | null;
  available: number | null;
}

interface SalesFocusValue extends SalesFocusState {
  setFocus: (next: SalesFocusState) => void;
  clearFocus: () => void;
}

const EMPTY: SalesFocusState = { sectionId: null, label: null, available: null };
const SalesFocusContext = createContext<SalesFocusValue | null>(null);

export function SalesFocusProvider({ children }: { children: ReactNode }) {
  const [focus, setFocusState] = useState<SalesFocusState>(EMPTY);
  const setFocus = useCallback((next: SalesFocusState) => {
    setFocusState((prev) =>
      prev.sectionId === next.sectionId &&
      prev.label === next.label &&
      prev.available === next.available
        ? prev
        : next,
    );
  }, []);
  const clearFocus = useCallback(() => setFocusState(EMPTY), []);
  const value = useMemo<SalesFocusValue>(
    () => ({ ...focus, setFocus, clearFocus }),
    [clearFocus, focus, setFocus],
  );
  return <SalesFocusContext.Provider value={value}>{children}</SalesFocusContext.Provider>;
}

export function useSalesFocus() {
  return useContext(SalesFocusContext);
}
