"use client";

import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";

type RegionContextValue = {
  /** The saved countries, home first. Empty until one is chosen. */
  regions: string[];
  /** The first country: what a single-country answer is about. */
  homeRegion: string | null;
  /** A guess from the browser's language header, used to prefill the picker. */
  suggestedRegion: string | null;
  setRegions: (regions: string[]) => void;
};

const RegionContext = createContext<RegionContextValue | null>(null);

export function RegionProvider({
  children,
  regions: savedRegions,
  suggestedRegion,
}: {
  children: ReactNode;
  regions: string[];
  suggestedRegion: string | null;
}) {
  const [regions, setRegionsState] = useState(savedRegions);

  // Saving updates local state immediately so an open detail sheet fills in
  // without waiting for the session to be re-read.
  const setRegions = useCallback((next: string[]) => setRegionsState(next), []);
  const value = useMemo(
    () => ({ regions, homeRegion: regions[0] ?? null, suggestedRegion, setRegions }),
    [regions, setRegions, suggestedRegion],
  );

  return <RegionContext.Provider value={value}>{children}</RegionContext.Provider>;
}

export function useRegion() {
  const value = useContext(RegionContext);
  if (!value) throw new Error("Region context is unavailable.");
  return value;
}
