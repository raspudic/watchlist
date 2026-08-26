# Operations

## API protection

Authenticated application routes use shared PostgreSQL counters, so the limits apply consistently when more than one web instance is running.

| Activity | Account limit | Shared application limit |
| --- | --- | --- |
| TMDB search | 10 requests per 10 seconds and 30 per minute | 12 upstream requests per 500 ms and 30 per second |
| TMDB watch providers | 20 requests per 10 seconds and 60 per minute | 12 upstream requests per 500 ms and 30 per second |
| Library reads and local search | 30 requests per 10 seconds and 120 per minute | — |
| Library writes | 15 requests per 10 seconds and 60 per minute | — |

There is no daily quota. Identical normalized TMDB searches are cached for one hour across application instances and for 15 minutes in the current browser session. A shared-cache hit counts against the library-read limit rather than the account TMDB allowance and does not consume shared upstream capacity.

Watch provider lookups have their own account limit so that opening a title does not consume the search budget. They share the same upstream application limit. Availability is cached per title and country for 12 hours, and the list of supported countries for 30 days; JustWatch supplies TMDB with one export a day, so a shorter window would only add upstream traffic.

Limited requests return HTTP `429`, a `Retry-After` header, and a JSON body with `code`, `reason`, and `retryAfter`. The UI keeps the user's search text, shows a retry countdown, and leaves library and custom-title actions available.

Expired limiter buckets and TMDB cache entries are deleted by the daily `lifecycle-cleanup` job.

## Operational events

The application writes JSON events to standard output for Specific's log explorer:

- `api_rate_limited`
- `tmdb_search_completed`
- `tmdb_search_failed`
- `tmdb_upstream_limited`
- `tmdb_watch_providers_completed`
- `tmdb_watch_providers_failed`

Events contain only status, duration, cache state, limit category, and retry timing. They must not include account identifiers, email or IP addresses, tokens, URLs, search text, titles, notes, TMDB identifiers, or the country a user has chosen.
