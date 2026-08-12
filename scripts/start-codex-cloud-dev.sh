#!/usr/bin/env bash

set -euo pipefail

codex_cloud_dev_log="/tmp/watchlist-specific-dev.log"
codex_cloud_diagnostic_log="/tmp/watchlist-specific-diagnostics.log"

strip_terminal_control_sequences() {
  tr '\r' '\n' | sed -E $'s|\033\\[[0-?]*[ -/]*[@-~]||g'
}

print_startup_diagnostics() {
  diagnostic_status="$1"

  printf '\n===== Watchlist Cloud startup diagnostics =====\n' >&2
  printf 'Captured: %s\n' "$(date --iso-8601=seconds 2>/dev/null || date)" >&2
  printf 'Launcher status: %s\n' "$diagnostic_status" >&2
  printf 'Working directory: %s\n' "$PWD" >&2
  printf 'Git revision: %s\n' "$(git rev-parse --short HEAD 2>/dev/null || printf 'unavailable')" >&2
  printf 'Kernel: %s\n' "$(uname -a 2>/dev/null || printf 'unavailable')" >&2
  printf 'Launcher identity: %s\n' "$(id 2>/dev/null || printf 'unavailable')" >&2
  if id watchlist-dev >/dev/null 2>&1; then
    printf 'Specific runtime identity: %s\n' "$(id watchlist-dev)" >&2
  else
    printf 'Specific runtime identity: watchlist-dev is missing\n' >&2
  fi
  printf 'Node: %s\n' "$(node --version 2>/dev/null || printf 'unavailable')" >&2
  printf 'pnpm: %s\n' "$(pnpm --version 2>/dev/null || printf 'unavailable')" >&2
  printf 'Specific executable: %s\n' "$(command -v specific 2>/dev/null || printf 'unavailable')" >&2
  printf 'Specific version: %s\n' "$(specific --version 2>/dev/null || printf 'unavailable')" >&2

  printf '\nFilesystem:\n' >&2
  df -hT "$PWD" >&2 2>/dev/null || true
  for diagnostic_path in \
    "$PWD" \
    "$PWD/.specific" \
    "$PWD/.specific/keys" \
    "$PWD/.specific/keys/default" \
    "$PWD/.specific/keys/default/data" \
    "$PWD/.specific/keys/default/data/main" \
    "$PWD/.next"; do
    if [ -e "$diagnostic_path" ]; then
      stat --format='%A (%a) %U:%G %n' "$diagnostic_path" >&2 2>/dev/null || true
    else
      printf 'missing %s\n' "$diagnostic_path" >&2
    fi
  done

  printf '\nSpecific state and service-log files:\n' >&2
  if [ -d "$PWD/.specific/keys/default" ]; then
    find "$PWD/.specific/keys/default" -maxdepth 3 -type f \
      -printf '%M (%m) %u:%g %s bytes %TY-%Tm-%TdT%TH:%TM:%TS %p\n' \
      >&2 2>/dev/null || true
  else
    printf 'No default Specific state directory exists.\n' >&2
  fi

  if [ -d "$PWD/.specific/keys/default/logs" ]; then
    while IFS= read -r -d '' service_log; do
      printf '\n--- %s (last 80 lines) ---\n' "$service_log" >&2
      tail -n 80 "$service_log" >&2 2>/dev/null || true
    done < <(find "$PWD/.specific/keys/default/logs" -maxdepth 2 -type f -print0)
  fi

  printf '\nRelevant processes:\n' >&2
  ps -eo pid,ppid,sid,stat,user,etime,cmd 2>/dev/null \
    | awk 'NR == 1 || /specific|postgres|next dev/ { print }' >&2 || true

  printf '\nFinal Specific output (terminal animation collapsed):\n' >&2
  if [ -s "$codex_cloud_dev_log" ]; then
    strip_terminal_control_sequences < "$codex_cloud_dev_log" \
      | awk 'NF && $0 != previous { print; previous = $0 }' \
      | tail -n 160 >&2
  else
    printf 'No Specific output was captured.\n' >&2
  fi
  printf '===== End Watchlist Cloud startup diagnostics =====\n' >&2
}

: > "$codex_cloud_dev_log"
printf 'Starting Specific dev in this long-running command session.\n'
printf 'Keep the session alive while running browser checks in parallel.\n'
printf 'Startup diagnostics will be printed if the process exits.\n'

printf 'Validating Specific configuration before startup...\n'
specific check

# Codex Cloud may terminate detached descendants even when they use nohup or a
# separate session. Keep Specific attached to this command and give it a PTY so
# its interactive supervisor remains alive after the shell runner yields.
set +e
script -q -e -f -c "specific dev" /dev/null 2>&1 | tee "$codex_cloud_dev_log"
specific_status="${PIPESTATUS[0]}"
set -e

# Specific can currently print a fatal startup error while returning status 0.
# Convert those explicit failure messages into a failing launcher result.
if grep -Eq 'Failed to start|FATAL:|\[ELIFECYCLE\]|Command failed with (code|exit code)' \
  "$codex_cloud_dev_log"; then
  specific_status=1
fi

print_startup_diagnostics "$specific_status" 2>&1 \
  | tee "$codex_cloud_diagnostic_log" >&2
printf 'Specific dev exited with status %s. Logs: %s\n' \
  "$specific_status" "$codex_cloud_dev_log" >&2
printf 'Diagnostics: %s\n' "$codex_cloud_diagnostic_log" >&2
exit "$specific_status"
