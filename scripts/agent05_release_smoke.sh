#!/usr/bin/env bash
set -u

WEB_BASE_URL="${AGENT05_WEB_BASE_URL:-http://127.0.0.1:3000}"
BACKEND_BASE_URL="${AGENT05_BACKEND_BASE_URL:-http://127.0.0.1:8000}"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/agent05-smoke.XXXXXX")"
FAILURES=0

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

pass() {
  printf 'PASS %s\n' "$1"
}

fail() {
  printf 'FAIL %s\n' "$1" >&2
  FAILURES=$((FAILURES + 1))
}

note() {
  printf 'NOTE %s\n' "$1"
}

fetch() {
  local url="$1"
  local output="$2"
  curl -fsS --max-time 5 "$url" -o "$output"
}

json_field() {
  local file="$1"
  local expr="$2"
  python3 - "$file" "$expr" <<'PY'
import json
import sys

path, expr = sys.argv[1], sys.argv[2]
with open(path, "r", encoding="utf-8") as handle:
    value = json.load(handle)
for part in expr.split("."):
    if not part:
        continue
    value = value.get(part) if isinstance(value, dict) else None
print("" if value is None else str(value).lower() if isinstance(value, bool) else value)
PY
}

WEB_STATUS_JSON="$TMP_DIR/web-status.json"
BACKEND_HEALTH_JSON="$TMP_DIR/backend-health.json"
AGENT05_HTML="$TMP_DIR/agent05.html"
AGENT05_INDEX="$TMP_DIR/agent05-index.html"
GENERATE_STATUS_JSON="$TMP_DIR/generate-status.json"
FILES_JSON="$TMP_DIR/files.json"

if fetch "$WEB_BASE_URL/api/agent05/status" "$WEB_STATUS_JSON"; then
  pass "web status endpoint loaded: $WEB_BASE_URL/api/agent05/status"
else
  fail "web publishing service is not reachable at $WEB_BASE_URL"
fi

if fetch "$WEB_BASE_URL/agent05" "$AGENT05_HTML" && grep -q '/agent05/index.html' "$AGENT05_HTML"; then
  pass "Agent05 publishing shell loaded: $WEB_BASE_URL/agent05"
else
  fail "Agent05 publishing shell did not load correctly"
fi

if fetch "$WEB_BASE_URL/agent05/index.html" "$AGENT05_INDEX"; then
  pass "Agent05 embedded frontend loaded: $WEB_BASE_URL/agent05/index.html"
else
  fail "Agent05 embedded frontend did not load"
fi

if fetch "$BACKEND_BASE_URL/api/health" "$BACKEND_HEALTH_JSON"; then
  BACKEND_STATUS="$(json_field "$BACKEND_HEALTH_JSON" "status")"
  BACKEND_SCHEMA="$(json_field "$BACKEND_HEALTH_JSON" "schema")"
  if [ "$BACKEND_STATUS" = "ok" ] && [ "$BACKEND_SCHEMA" = "ppt-maker-web-health/v1" ]; then
    pass "PPT Maker backend health is ok: $BACKEND_BASE_URL/api/health"
  else
    fail "backend responded but did not expose ppt-maker-web-health/v1 status"
  fi
else
  fail "PPT Maker backend is not reachable at $BACKEND_BASE_URL"
  note "Start it with: cd /Users/tristanzh/agent/PPT-maker && python3 -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000"
fi

if [ -s "$WEB_STATUS_JSON" ]; then
  BACKEND_AVAILABLE="$(json_field "$WEB_STATUS_JSON" "backend.available")"
  if [ "$BACKEND_AVAILABLE" = "true" ]; then
    pass "web status reports Agent05 backend available"
  else
    fail "web status reports Agent05 backend unavailable"
    BASE_URL="$(json_field "$WEB_STATUS_JSON" "backend.baseUrl")"
    ERROR_DETAIL="$(json_field "$WEB_STATUS_JSON" "backend.error")"
    note "reported backend: ${BASE_URL:-$BACKEND_BASE_URL}"
    [ -n "$ERROR_DETAIL" ] && note "diagnostic: $ERROR_DETAIL"
    note "Start it with: cd /Users/tristanzh/agent/PPT-maker && python3 -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000"
  fi
fi

if fetch "$WEB_BASE_URL/agent05/api/generate/status" "$GENERATE_STATUS_JSON"; then
  if [ "$(json_field "$GENERATE_STATUS_JSON" "schema")" = "ppt-maker-generation-status/v1" ]; then
    pass "proxied generate status endpoint loaded"
  else
    fail "proxied generate status endpoint returned an unexpected schema"
  fi
else
  fail "proxied generate status endpoint failed"
fi

if fetch "$WEB_BASE_URL/agent05/api/files" "$FILES_JSON"; then
  if [ "$(json_field "$FILES_JSON" "schema")" = "ppt-maker-files/v1" ]; then
    pass "proxied files endpoint loaded"
  else
    fail "proxied files endpoint returned an unexpected schema"
  fi
else
  fail "proxied files endpoint failed"
fi

if [ "$FAILURES" -gt 0 ]; then
  printf 'Agent05 release smoke failed with %s issue(s).\n' "$FAILURES" >&2
  exit 1
fi

printf 'Agent05 release smoke passed.\n'
