export type LibraryMode = "watchlist" | "watched";

export type MediaItem = {
  id: string;
  provider: string;
  externalId: number | null;
  mediaType: "movie" | "tv" | "other";
  title: string;
  originalTitle: string | null;
  releaseYear: number | null;
  posterPath: string | null;
  overview: string | null;
  status: LibraryMode;
  watchlistNote: string | null;
  reviewNote: string | null;
  rating: number | null;
  addedAt: string;
  watchedAt: string | null;
  pinnedAt: string | null;
};

type CacheEntry = {
  cachedAt: number;
  items: MediaItem[];
};

export const LIBRARY_CACHE_TTL_MS = 2 * 60 * 1000;

const entries = new Map<string, CacheEntry>();
const pendingRequests = new Map<string, Promise<MediaItem[]>>();

function cacheKey(scope: string, mode: LibraryMode) {
  return `${scope}:${mode}`;
}

export function getCachedLibrary(scope: string, mode: LibraryMode) {
  return entries.get(cacheKey(scope, mode))?.items ?? null;
}

export function isLibraryCacheFresh(scope: string, mode: LibraryMode, now = Date.now()) {
  const entry = entries.get(cacheKey(scope, mode));
  return Boolean(entry && now - entry.cachedAt < LIBRARY_CACHE_TTL_MS);
}

export function setCachedLibrary(scope: string, mode: LibraryMode, items: MediaItem[], cachedAt = Date.now()) {
  entries.set(cacheKey(scope, mode), { cachedAt, items });
}

export async function loadLibrary(scope: string, mode: LibraryMode, force = false) {
  const key = cacheKey(scope, mode);
  const cached = entries.get(key);
  if (!force && cached && isLibraryCacheFresh(scope, mode)) return cached.items;

  const pending = pendingRequests.get(key);
  if (pending) return pending;

  const request: Promise<MediaItem[]> = fetch(`/api/items?status=${mode}`, {
    cache: "no-store",
    credentials: "same-origin",
  })
    .then(async (response) => {
      const body = (await response.json()) as { error?: string; items?: MediaItem[] };
      if (!response.ok || !body.items) throw new Error(body.error ?? "Could not load your list.");
      if (pendingRequests.get(key) === request) setCachedLibrary(scope, mode, body.items);
      return body.items;
    })
    .finally(() => {
      if (pendingRequests.get(key) === request) pendingRequests.delete(key);
    });

  pendingRequests.set(key, request);
  return request;
}

export function upsertCachedLibraryItem(scope: string, item: MediaItem) {
  const modes: LibraryMode[] = ["watchlist", "watched"];

  for (const mode of modes) {
    const key = cacheKey(scope, mode);
    const entry = entries.get(key);
    if (!entry) continue;

    if (mode !== item.status) {
      if (!entry.items.some((current) => current.id === item.id)) continue;
      entries.set(key, {
        cachedAt: Date.now(),
        items: entry.items.filter((current) => current.id !== item.id),
      });
      continue;
    }

    const index = entry.items.findIndex((current) => current.id === item.id);
    const items = index === -1
      ? [item, ...entry.items]
      : entry.items.map((current) => current.id === item.id ? item : current);
    entries.set(key, { cachedAt: Date.now(), items });
  }
}

export function removeCachedLibraryItem(scope: string, itemId: string) {
  for (const mode of ["watchlist", "watched"] as const) {
    const key = cacheKey(scope, mode);
    const entry = entries.get(key);
    if (!entry) continue;
    if (!entry.items.some((item) => item.id === itemId)) continue;
    entries.set(key, {
      cachedAt: Date.now(),
      items: entry.items.filter((item) => item.id !== itemId),
    });
  }
}

export function clearLibraryCache(scope?: string) {
  if (!scope) {
    entries.clear();
    pendingRequests.clear();
    return;
  }

  for (const mode of ["watchlist", "watched"] as const) {
    entries.delete(cacheKey(scope, mode));
    pendingRequests.delete(cacheKey(scope, mode));
  }
}
