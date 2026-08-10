# Watchlist

A deliberately simple personal library for movies, series, and anime. Add a title in seconds, keep the reason it caught your attention, then move it to watched and optionally rate it from 1–10.

## Product behavior

- One watch state for movies and full shows: `watchlist` or `watched`
- TMDB search for movies, TV, and anime, with a custom-title fallback
- Optional note before watching; optional rating and review note afterward
- Unrated watched titles are kept in a prominent “How was it?” section
- Item details open in a side inspector on desktop and a bottom sheet on mobile
- Swipe left on a mobile row to reveal Remove; removals have Undo
- System-aware light and dark themes
- Installable PWA without an app store; authenticated responses are never cached
- Persistent database-backed sessions and private, disabled-by-default signup

## Local development

Infrastructure and the development environment are defined in [`specific.hcl`](./specific.hcl). The app expects Specific rather than a manually assembled local stack.

1. Add a TMDB API read-access token and a temporary bootstrap password to the gitignored `specific.local` file:

   ```hcl
   secrets {
     tmdb_access_token = "your-tmdb-read-token"
     bootstrap_password = "choose-at-least-eight-characters"
   }
   ```

2. Validate the environment:

   ```sh
   specific check
   ```

3. Start Postgres and the app:

   ```sh
   specific dev
   ```

4. In a second terminal, bootstrap the private user once:

   ```sh
   specific exec web pnpm auth:bootstrap
   ```

The username defaults to `mateo`. Public signup remains disabled after bootstrap. For anything beyond local development, replace the temporary password with a unique strong password before deploying.

## First deployment and TMDB setup

Run `specific deploy` to create the production environment and public URL. The initial deployment uses a generated placeholder for the TMDB token so the URL exists before TMDB asks for it. Search will remain unavailable until you request a real TMDB read-access token, set `tmdb_access_token` on the production environment’s **Secrets and config** page in the Specific Dashboard, and deploy again.

## Checks

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
specific check
```

Movie and television metadata and images are supplied by [TMDB](https://www.themoviedb.org/). This product is not endorsed or certified by TMDB.
