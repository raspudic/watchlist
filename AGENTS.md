# Project rules

## Development

- Use Specific for infrastructure, environments, secrets, workflows, and observability. Read `specific docs`, run the app with `specific dev`, and run `specific check` after changing Specific configuration.
- In Codex Cloud, implement changes and run non-interactive checks. Do not start the dev server, install a browser, capture screenshots, or add binary evidence unless requested.
- Outside Codex Cloud, verify UI changes with `specific dev` and the development account in `README.md` when useful or requested.

## Git

- Use Conventional Commits. Each final commit must be coherent, independently understandable, and pass its relevant checks. Never commit secrets or unrelated changes.
- Small changes may be committed directly to `main`. For larger work, use a short-lived branch and preserve a clean series of logical commits with rebase-and-merge. Squash only a PR that is one indivisible change; do not use merge commits.
- Autosquash `fixup!` commits before publishing. Do not publish WIP, feedback, test-fix, or similar development-only commits.
- Use `fix:` only for behavior present in a previous release; fold fixes to unpublished work into the introducing commit.
- After verification, commit and publish through the environment's supported GitHub workflow before reporting completion.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
