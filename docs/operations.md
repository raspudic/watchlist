# Operations

## API protection

Authenticated application routes use shared PostgreSQL counters, so the limits apply consistently when more than one web instance is running.

| Activity | Account limit | Shared application limit |
| --- | --- | --- |
| TMDB search | 10 requests per 10 seconds and 30 per minute | 12 upstream requests per 500 ms and 30 per second |
| Library reads and local search | 30 requests per 10 seconds and 120 per minute | — |
| Library writes | 15 requests per 10 seconds and 60 per minute | — |

There is no daily quota. Identical normalized TMDB searches are cached for 30 seconds across application instances. A cache hit still counts against the account search limits, but it does not consume shared upstream capacity.

Limited requests return HTTP `429`, a `Retry-After` header, and a JSON body with `code`, `reason`, and `retryAfter`. The UI keeps the user's search text, shows a retry countdown, and leaves library and custom-title actions available.

Expired limiter buckets and TMDB cache entries are deleted by the daily `lifecycle-cleanup` job.

## Operational events

The application writes JSON events to standard output for Specific's log explorer:

- `api_rate_limited`
- `tmdb_search_completed`
- `tmdb_search_failed`
- `tmdb_upstream_limited`

Events contain only status, duration, cache state, limit category, and retry timing. They must not include account identifiers, email or IP addresses, tokens, URLs, search text, titles, or notes.
