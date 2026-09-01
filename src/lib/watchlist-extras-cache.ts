import type { TitleExtras, WatchlistExtrasResponse } from "@/lib/tonight";

type CacheEntry = {
  cachedAt: number;
  response: WatchlistExtrasResponse;
};

/* Longer than the library's own cache: catalog metadata moves on a daily job,
   not on what the reader just did. */
export const WATCHLIST_EXTRAS_TTL_MS = 5 * 60 * 1000;

export const EMPTY_EXTRAS: WatchlistExtrasResponse = {
  regions: [],
  selectedProviderIds: [],
  titles: [] as TitleExtras[],
};

const entries = new Map<string, CacheEntry>();
const pendingRequests = new Map<string, Promise<WatchlistExtrasResponse>>();

export function getCachedWatchlistExtras(scope: string) {
  return entries.get(scope)?.response ?? null;
}

export function setCachedWatchlistExtras(
  scope: string,
  response: WatchlistExtrasResponse,
  cachedAt = Date.now(),
) {
  entries.set(scope, { cachedAt, response });
}

export function isWatchlistExtrasFresh(scope: string, now = Date.now()) {
  const entry = entries.get(scope);
  return Boolean(entry && now - entry.cachedAt < WATCHLIST_EXTRAS_TTL_MS);
}

/**
 * The enrichment behind the watchlist. It is deliberately a second request:
 * the list paints from the library cache first, and this fills in genres,
 * runtimes, scores and where each title streams when it arrives.
 */
export async function loadWatchlistExtras(scope: string, force = false) {
  const cached = entries.get(scope);
  if (!force && cached && isWatchlistExtrasFresh(scope)) return cached.response;

  const pending = pendingRequests.get(scope);
  if (pending) return pending;

  const request: Promise<WatchlistExtrasResponse> = fetch("/api/watchlist-extras", {
    cache: "no-store",
    credentials: "same-origin",
  })
    .then(async (response) => {
      const body = (await response.json()) as Partial<WatchlistExtrasResponse> & { error?: string };
      if (!response.ok || !body.titles) throw new Error(body.error ?? "Could not load streaming details.");
      const answer: WatchlistExtrasResponse = {
        regions: body.regions ?? [],
        selectedProviderIds: body.selectedProviderIds ?? [],
        titles: body.titles,
      };
      if (pendingRequests.get(scope) === request) setCachedWatchlistExtras(scope, answer);
      return answer;
    })
    .finally(() => {
      if (pendingRequests.get(scope) === request) pendingRequests.delete(scope);
    });

  pendingRequests.set(scope, request);
  return request;
}

export function clearWatchlistExtras(scope?: string) {
  if (!scope) {
    entries.clear();
    pendingRequests.clear();
    return;
  }
  entries.delete(scope);
  pendingRequests.delete(scope);
}
