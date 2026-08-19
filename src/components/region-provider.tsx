"use client";

import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";

type RegionContextValue = {
  /** The saved country, or null when the user has not chosen one yet. */
  region: string | null;
  /** A guess from the browser's language header, used to prefill the picker. */
  suggestedRegion: string | null;
  setRegion: (region: string) => void;
};

const RegionContext = createContext<RegionContextValue | null>(null);

export function RegionProvider({
  children,
  region: savedRegion,
  suggestedRegion,
}: {
  children: ReactNode;
  region: string | null;
  suggestedRegion: string | null;
}) {
  const [region, setRegionState] = useState(savedRegion);

  // Saving updates local state immediately so an open detail sheet fills in
  // without waiting for the session to be re-read.
  const setRegion = useCallback((next: string) => setRegionState(next), []);
  const value = useMemo(
    () => ({ region, suggestedRegion, setRegion }),
    [region, setRegion, suggestedRegion],
  );

  return <RegionContext.Provider value={value}>{children}</RegionContext.Provider>;
}

export function useRegion() {
  const value = useContext(RegionContext);
  if (!value) throw new Error("Region context is unavailable.");
  return value;
}
