"use client";

import { createContext, type ReactNode, useContext } from "react";

const LibraryCacheScopeContext = createContext<string | null>(null);

export function LibraryCacheProvider({ children, scope }: { children: ReactNode; scope: string }) {
  return <LibraryCacheScopeContext.Provider value={scope}>{children}</LibraryCacheScopeContext.Provider>;
}

export function useLibraryCacheScope() {
  const scope = useContext(LibraryCacheScopeContext);
  if (!scope) throw new Error("Library cache scope is unavailable.");
  return scope;
}
