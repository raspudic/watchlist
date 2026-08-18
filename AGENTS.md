# Project rules

## Development

- Use Specific for infrastructure, environments, secrets, workflows, and observability. Read `specific docs`, run the app with `specific dev`, and run `specific check` after changing Specific configuration.
- In Codex Cloud, implement changes and run non-interactive checks. Do not start the dev server, install a browser, capture screenshots, or add binary evidence unless requested.
- Outside Codex Cloud, verify UI changes with `specific dev` and the development account in `README.md` when useful or requested.

## Git

- Make every change on a short-lived branch and open a pull request; never push directly to `main` or `release`.
- Use a Conventional Commit pull-request title. GitHub squash-merges that title into `main`; branch commits may stay granular, but must not include secrets or unrelated changes.
- Use `fix:` only for behavior present in a previous release. Fold fixes to unpublished work into the change that introduced them.
- After verification, publish the pull request. Agents may squash-merge ordinary pull requests once required checks pass and must never bypass those checks.
- The Release Please pull request is the production gate: merge it only with explicit user approval. Only the release workflow may update `release`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
