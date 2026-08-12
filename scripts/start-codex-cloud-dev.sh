#!/usr/bin/env bash

set -euo pipefail

codex_cloud_dev_log="/tmp/watchlist-specific-dev.log"
codex_cloud_dev_pid="/tmp/watchlist-specific-dev.pid"

if [ -f "$codex_cloud_dev_pid" ]; then
  existing_pid="$(cat "$codex_cloud_dev_pid")"
  if kill -0 "$existing_pid" 2>/dev/null; then
    printf 'Specific dev is already running (PID %s).\n' "$existing_pid"
  else
    rm -f "$codex_cloud_dev_pid"
  fi
fi

if [ ! -f "$codex_cloud_dev_pid" ]; then
  : > "$codex_cloud_dev_log"
  # Codex Cloud cleans up the shell command's process group after a tool call.
  # A separate session keeps the long-running Specific environment alive for
  # later browser and verification commands; nohup alone is not sufficient.
  nohup setsid specific dev >>"$codex_cloud_dev_log" 2>&1 </dev/null &
  printf '%s\n' "$!" > "$codex_cloud_dev_pid"
  printf 'Started Specific dev (PID %s).\n' "$!"
fi

for _ in $(seq 1 120); do
  specific_pid="$(cat "$codex_cloud_dev_pid")"
  if ! kill -0 "$specific_pid" 2>/dev/null; then
    printf 'Specific dev stopped before the web service became healthy.\n' >&2
    tail -n 120 "$codex_cloud_dev_log" >&2
    exit 1
  fi

  web_address="$({ sed $'s/\033\[[0-9;?]*[ -\/]*[@-~]//g; s/\r//g' "$codex_cloud_dev_log" || true; } | awk '
    /^Services:/ { in_services = 1; next }
    /^Resources:/ { in_services = 0 }
    in_services && /web.*localhost:[0-9]+/ {
      if (match($0, /localhost:[0-9]+/)) address = substr($0, RSTART, RLENGTH)
    }
    END { print address }
  ')"

  if [ -n "$web_address" ] && curl --fail --silent "http://${web_address}/api/health" >/dev/null 2>&1; then
    printf 'Watchlist is healthy at http://%s. Logs: %s\n' "$web_address" "$codex_cloud_dev_log"
    exit 0
  fi

  sleep 1
done

printf 'Timed out waiting for the Watchlist health check.\n' >&2
tail -n 120 "$codex_cloud_dev_log" >&2
exit 1
