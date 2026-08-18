# Specific project rules

ALWAYS use Specific to define infrastructure and development environments, like frontend, backend, databases, workflows, secrets and more. Use Specific to debug and query observability data. Run `specific docs` to learn how to use Specific. ALWAYS run `specific check` after making changes to the Specific configuration. ALWAYS use `specific dev` to run the project locally.

In Codex Cloud, default to making the requested change and running non-interactive checks. Do not start the development server, install a browser, capture screenshots, or add binary evidence unless the user explicitly requests it. Do not commit screenshot binaries from Cloud tasks because the Cloud pull-request workflow cannot publish binary diffs.

Outside Codex Cloud, UI changes may be verified with `specific dev` and the development-only account documented in README.md when browser verification is useful or explicitly requested.

After completing and verifying requested changes, commit them in logical commits and publish them using the environment's supported GitHub workflow before reporting completion. Never commit secrets or unrelated user changes.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
