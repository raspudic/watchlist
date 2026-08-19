import "server-only";

type OperationalEvent =
  | "api_rate_limited"
  | "tmdb_search_completed"
  | "tmdb_search_failed"
  | "tmdb_upstream_limited"
  | "tmdb_watch_providers_completed"
  | "tmdb_watch_providers_failed";

type OperationalFields = {
  cacheHit?: boolean;
  durationMs?: number;
  reason?: string;
  retryAfter?: number;
  status?: number;
};

/**
 * Emits intentionally small, structured events for Specific's log explorer.
 * The type does not accept identifiers, tokens, URLs, or user-provided text.
 */
export function logOperationalEvent(event: OperationalEvent, fields: OperationalFields = {}) {
  console.info(JSON.stringify({
    type: "operational_event",
    event,
    ...fields,
  }));
}
