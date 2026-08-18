# Watchlist

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

The development library includes a few sample titles. These credentials and seed data are development-only; production is configured separately in Specific.

Movie and television metadata and images are supplied by [TMDB](https://www.themoviedb.org/). This product is not endorsed or certified by TMDB.
