# watchlist

A simple personal library for movies and shows.

## Run locally

1. Install [Specific](https://docs.specific.dev/installation), then install the project dependencies:

   ```sh
   corepack enable
   pnpm install --frozen-lockfile
   ```

2. Create a gitignored `specific.local` with a TMDB API read-access token:

   ```hcl
   secrets {
     tmdb_read_access_token = "your-tmdb-read-token"
   }
   ```

3. Validate and start the app and its Postgres database:

   ```sh
   specific check
   specific dev
   ```

4. Sign in with username `watchlist` and password `watchlist-local-2026!`.

These credentials are development-only; production is configured separately in Specific.

Public sign-up is disabled. The bootstrap user is an administrator and can create seven-day,
single-use links from `/people`. To promote an existing production bootstrap user after
deploying this migration, run `specific exec web -- pnpm auth:bootstrap`; no password is changed.

See [Operations](docs/operations.md) for API limits and privacy-safe runtime events.

Movie and television metadata and images are supplied by [TMDB](https://www.themoviedb.org/). This product is not endorsed or certified by TMDB.

## Account deletion and lifecycle operations

Account deletion requires the current password and an explicit irreversible confirmation. It permanently removes the live account, credential records, sessions, invitations associated with that account, and every library row, including previously removed titles and the viewing history behind them. The final administrator cannot delete their account; promote another existing user first with `specific exec web -- env BOOTSTRAP_USERNAME=their-username pnpm auth:bootstrap`.

Specific runs `lifecycle-cleanup` daily at 02:00 UTC. The idempotent job removes expired sessions, verification records, API limiter buckets and TMDB cache entries; Better Auth limiter rows idle for more than 24 hours; and invitations that have been accepted, revoked, or expired for more than 30 days. It uses a PostgreSQL advisory lock, so an overlapping run exits without making changes. Run it manually with:

```sh
specific exec lifecycle-cleanup
```

Deletion affects the live database immediately. Infrastructure backups may retain deleted data until the provider's normal backup-retention period ends.
