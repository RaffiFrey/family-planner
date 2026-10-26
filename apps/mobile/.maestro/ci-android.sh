#!/usr/bin/env bash
# Runs the Maestro flows on the CI emulator (called from .github/workflows/mobile.yml, repo root as cwd).
# On failure the tails of the logs are emitted as workflow annotations so they show on the run page.
set -uo pipefail

annotate() {
  local title=$1 file=$2
  [ -f "$file" ] || return 0
  local body
  body=$(tail -c 3500 "$file" | sed -e 's/%/%25/g' -e 's/\r//g' | awk '{printf "%s%%0A", $0}')
  echo "::error title=${title}::${body}"
}

stage() { echo "::notice title=android e2e::$1 ($(date -u +%H:%M:%S))"; }

fail() {
  echo "step failed: $1"
  annotate "maestro output" maestro.log
  annotate "api.log" api.log
  annotate "metro.log" metro.log
  adb logcat -d -t 300 '*:E' > logcat.txt 2>/dev/null
  annotate "logcat errors" logcat.txt
  exit 1
}

stage "emulator booted"
# Background servers must be stopped on exit, or the emulator runner waits for them until the job times out.
pids=()
cleanup() { for p in "${pids[@]}"; do pkill -TERM -P "$p" 2>/dev/null; kill -TERM "$p" 2>/dev/null; done; }
trap cleanup EXIT
(cd apps/api && exec node --env-file=../../.env dist/main.js > ../../api.log 2>&1 < /dev/null) &
pids+=($!)
(cd apps/mobile && CI=1 exec npx expo start --port 8081 > ../../metro.log 2>&1 < /dev/null) &
pids+=($!)
stage "waiting for api and metro"
timeout 330 npx --yes wait-on -t 300000 http://localhost:4000/v1/health http://localhost:8081/status || fail "api/metro start"
adb reverse tcp:8081 tcp:8081 && adb reverse tcp:4000 tcp:4000 || fail "adb reverse"
stage "installing apk"
timeout 300 adb install -r apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk > maestro.log 2>&1 || fail "apk install"
stage "building js bundle"
# Build the JS bundle once so the first flow's launch wait isn't spent compiling (best effort).
curl -sS -f -o /dev/null --max-time 900 \
  "http://localhost:8081/.expo/.virtual-metro-entry.bundle?platform=android&dev=true&minify=false" \
  >> maestro.log 2>&1 || stage "bundle prewarm failed, continuing"
stage "running maestro"
timeout 1200 "$HOME/.maestro/bin/maestro" test --debug-output maestro-debug \
  apps/mobile/.maestro/config.yaml apps/mobile/.maestro >> maestro.log 2>&1 || fail "maestro"
stage "maestro passed"
cat maestro.log
