import "server-only";

import { parseRetryAfter } from "@/lib/tmdb-search";

export type TmdbFetchResult<T> =
  | { ok: true; data: T }
  | { ok: false; kind: "unconfigured"; status: 503 }
  | { ok: false; kind: "rate_limited"; status: 429; retryAfter: number }
  | { ok: false; kind: "error"; status: number };

/**
 * The single place that talks to TMDB. Responses are never cached by Next —
 * every caller caches in Postgres instead, so the TTL is explicit and shared
 * across instances rather than per-render.
 */
export async function tmdbFetch<T>(
  path: string,
  params: Record<string, string> = {},
): Promise<TmdbFetchResult<T>> {
  const token = process.env.TMDB_ACCESS_TOKEN;
  if (!token) return { ok: false, kind: "unconfigured", status: 503 };

  const url = new URL(`https://api.themoviedb.org/3${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
    });
  } catch {
    return { ok: false, kind: "error", status: 502 };
  }

  if (response.status === 429) {
    return {
      ok: false,
      kind: "rate_limited",
      status: 429,
      retryAfter: parseRetryAfter(response.headers.get("Retry-After")),
    };
  }

  if (!response.ok) return { ok: false, kind: "error", status: response.status };

  try {
    return { ok: true, data: (await response.json()) as T };
  } catch {
    return { ok: false, kind: "error", status: 502 };
  }
}
