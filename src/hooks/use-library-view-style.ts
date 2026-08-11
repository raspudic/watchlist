"use client";

import { useSyncExternalStore } from "react";

export type LibraryViewStyle = "grid" | "list";

const EVENT_NAME = "watchlist-view-style-change";
const STORAGE_PREFIX = "watchlist-view-style";
const memoryPreferences = new Map<string, LibraryViewStyle>();

export function parseLibraryViewStyle(value: string | null): LibraryViewStyle {
  return value === "grid" ? "grid" : "list";
}

function storageKey(scope: string) {
  return `${STORAGE_PREFIX}:${scope}`;
}

function getSnapshot(scope: string) {
  try {
    const stored = localStorage.getItem(storageKey(scope));
    return parseLibraryViewStyle(stored ?? memoryPreferences.get(scope) ?? null);
  } catch {
    return memoryPreferences.get(scope) ?? "list";
  }
}

function subscribe(scope: string, onChange: () => void) {
  function onStorage(event: StorageEvent) {
    if (event.key === storageKey(scope)) onChange();
  }

  function onPreferenceChange(event: Event) {
    if ((event as CustomEvent<{ scope: string }>).detail.scope === scope) onChange();
  }

  window.addEventListener("storage", onStorage);
  window.addEventListener(EVENT_NAME, onPreferenceChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(EVENT_NAME, onPreferenceChange);
  };
}

function setPreference(scope: string, view: LibraryViewStyle) {
  memoryPreferences.set(scope, view);
  try {
    localStorage.setItem(storageKey(scope), view);
  } catch {}
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { scope } }));
}

export function useLibraryViewStyle(scope: string) {
  const view = useSyncExternalStore(
    (onChange) => subscribe(scope, onChange),
    () => getSnapshot(scope),
    () => "list" as const,
  );

  return [view, (nextView: LibraryViewStyle) => setPreference(scope, nextView)] as const;
}
