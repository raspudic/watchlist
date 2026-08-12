#!/usr/bin/env bash

set -euo pipefail

# Codex Cloud starts tasks as root. Specific's local Postgres cannot initialize
# as root, so repair that environment detail once during the Cloud setup phase.
# The Codex environment itself is configured to provide Node 22.

: "${TMDB_READ_ACCESS_TOKEN:?Add TMDB_READ_ACCESS_TOKEN as a Codex environment secret}"

codex_cloud_runtime_user="watchlist-dev"
codex_cloud_project_dir="$(git rev-parse --show-toplevel)"

node -e '
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 13)) {
    throw new Error(`Node 22.13 or newer is required; found ${process.versions.node}`);
  }
'

# Node may be selected through Codex's version manager under root's home.
# Copy the executable and install pnpm system-wide so the non-root app process
# does not depend on root-only paths.
codex_cloud_node_source="$(readlink -f "$(command -v node)")"
if [ "$codex_cloud_node_source" != "/usr/local/bin/node" ]; then
  install -m 0755 "$codex_cloud_node_source" /usr/local/bin/node
fi
npm install --global --prefix /usr/local pnpm@11.16.0

curl -fsSL https://specific.dev/install.sh | sh
install -m 0755 /root/.local/bin/specific /usr/local/bin/specific-real

if ! command -v runuser >/dev/null 2>&1 || ! command -v script >/dev/null 2>&1; then
  apt-get update
  apt-get install -y --no-install-recommends util-linux
fi

if ! id -u "$codex_cloud_runtime_user" >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash "$codex_cloud_runtime_user"
fi

# Transparently use the non-root account whenever Specific needs to start
# local resources. Other commands continue to run as the calling user.
tee /usr/local/bin/specific >/dev/null <<'SPECIFIC_WRAPPER'
#!/bin/sh
set -eu

case "${1:-}" in
  dev | exec)
    if [ "$(id -u)" -eq 0 ] && id -u watchlist-dev >/dev/null 2>&1; then
      exec runuser -u watchlist-dev -- env \
        HOME=/home/watchlist-dev \
        PATH=/usr/local/bin:/usr/bin:/bin \
        /usr/local/bin/specific-real "$@"
    fi
    ;;
esac

exec /usr/local/bin/specific-real "$@"
SPECIFIC_WRAPPER
chmod 0755 /usr/local/bin/specific

# The Specific installer adds /root/.local/bin ahead of /usr/local/bin in the
# Cloud agent's PATH. Replace that original entry with the wrapper as well;
# otherwise `specific dev` resolves to the root-running binary and initdb
# refuses to start.
ln -sfn /usr/local/bin/specific /root/.local/bin/specific

if [ "$(readlink -f "$(command -v specific)")" != "/usr/local/bin/specific" ]; then
  echo "Specific wrapper is not first on PATH" >&2
  exit 1
fi

cd "$codex_cloud_project_dir"
pnpm install --frozen-lockfile
# Keep Chromium available to Cloud tasks for responsive UI verification and
# screenshots. Container caching avoids repeating the browser download for
# every task created from this environment.
pnpm exec playwright install --with-deps chromium

umask 077
printf 'secrets {\n  tmdb_read_access_token = "%s"\n}\n' \
  "$TMDB_READ_ACCESS_TOKEN" > specific.local

specific check

# The non-root Specific process needs to write its Postgres data and Next.js
# build output in the checkout. Root remains able to edit files during tasks.
chown -R "$codex_cloud_runtime_user:$codex_cloud_runtime_user" "$codex_cloud_project_dir"
git config --global --add safe.directory "$codex_cloud_project_dir"

# Download and initialize development resources during setup so `specific dev`
# can expose the web service promptly inside the shorter agent command window.
specific exec web -- true

printf 'Codex Cloud environment ready: Node %s, pnpm %s, Specific %s\n' \
  "$(node --version)" \
  "$(pnpm --version)" \
  "$(specific --version)"
