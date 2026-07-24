#!/usr/bin/env bash
#
# e2e-browseract.sh — Full core-flow E2E test for the YLx photo-proofing
# gallery, driven live through a real browser via the `browser-act` CLI
# (https://www.browseract.com — install: `uv tool install browser-act-cli`).
#
# Exercises the whole photographer + client journey against a running
# deployment (defaults to production): admin login -> create album ->
# upload a real photo -> copy PIN/share link -> client enters PIN ->
# selects + submits a photo -> admin sees the selection -> admin unlocks
# (selection cleared) -> test album is deleted so no data is left behind.
#
# Requires: `browser-act` installed + authenticated (`browser-act --version`,
# `browser-act browser list`), `jq`, and a real photo file to upload.
#
# Usage:
#   YLX_ADMIN_EMAIL=admin@example.com YLX_ADMIN_PASSWORD=secret \
#     ./scripts/e2e-browseract.sh
#
# Env vars:
#   BASE_URL              Target deployment (default: https://ylex.my.id)
#   YLX_ADMIN_EMAIL        Admin login email (required, no default)
#   YLX_ADMIN_PASSWORD     Admin login password (required, no default —
#                          never hardcode this; export it in your shell)
#   PHOTO_PATH             Photo to upload (default: test-foto.JPG at repo root)
#   BROWSERACT_BROWSER_ID  browser-act browser id to use (default: first
#                          browser returned by `browser-act browser list`)
#   TEST_MAX_SELECTIONS    Max selections for the test album (default: 15)
#
# The script is non-interactive and safe to re-run: it always creates its
# own uniquely-named/timestamped test album and deletes it again at the end
# — via a trap, so cleanup runs even if an earlier stage fails.

set -uo pipefail

BASE_URL="${BASE_URL:-https://ylex.my.id}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PHOTO_PATH="${PHOTO_PATH:-$REPO_ROOT/test-foto.JPG}"
TEST_MAX_SELECTIONS="${TEST_MAX_SELECTIONS:-15}"
SESSION="e2e-browseract-$$-$(date +%s)"
CLIENT_NAME="E2E Test Client"
TIMESTAMP="$(date -u +%Y%m%d-%H%M%S)"
ALBUM_TITLE="E2E BrowserAct Test ${TIMESTAMP}"
ALBUM_PIN="$(printf '%04d' $((RANDOM % 10000)))"

STEP_NUM=0
ALBUM_ID=""
ALBUM_SLUG=""
SESSION_OPENED=0

step() {
  STEP_NUM=$((STEP_NUM + 1))
  echo
  echo "==> [$STEP_NUM] $1"
}

pass() {
  echo "    PASS: $1"
}

fail() {
  echo "    FAIL: $1" >&2
  exit 1
}

bract() {
  browser-act --session "$SESSION" "$@"
}

# Runs a browser-act command; exits via fail() with a clear message if it errors.
must() {
  local desc="$1"
  shift
  if ! bract "$@"; then
    fail "$desc"
  fi
}

# Executes a JS snippet in the page via `eval --stdin` and prints the result.
js_eval() {
  printf '%s' "$1" | bract eval --stdin
}

cleanup() {
  local exit_code=$?
  echo
  echo "==> Cleanup"

  if [[ -n "$ALBUM_ID" ]]; then
    echo "    Deleting test album ($ALBUM_ID) ..."
    local delete_js='(async()=>{try{const r=await fetch("/api/admin/albums/'"$ALBUM_ID"'",{method:"DELETE"});return r.status;}catch(e){return "error:"+e;}})()'
    local delete_status
    delete_status="$(js_eval "$delete_js" 2>&1)"
    echo "    Delete response: $delete_status"

    bract navigate "$BASE_URL/admin" >/dev/null 2>&1
    bract wait stable >/dev/null 2>&1
    local list_text
    list_text="$(bract get text --selector body 2>&1)"
    if echo "$list_text" | grep -qF "$ALBUM_TITLE"; then
      echo "    FAIL: test album still appears in the admin album list!"
      exit_code=1
    else
      echo "    PASS: test album no longer appears in the admin album list"
    fi
  else
    echo "    (no test album was created — nothing to delete)"
  fi

  if [[ "$SESSION_OPENED" -eq 1 ]]; then
    bract session close "$SESSION" >/dev/null 2>&1
  fi

  echo
  if [[ "$exit_code" -eq 0 ]]; then
    echo "==== E2E RESULT: PASS ===="
  else
    echo "==== E2E RESULT: FAIL ===="
  fi
  exit "$exit_code"
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
step "Preflight checks"

command -v browser-act >/dev/null 2>&1 || fail "browser-act CLI not found in PATH — install with: uv tool install browser-act-cli"
command -v jq >/dev/null 2>&1 || fail "jq not found in PATH — required to parse browser-act's captured API responses"
[[ -n "${YLX_ADMIN_EMAIL:-}" ]] || fail "YLX_ADMIN_EMAIL is not set — export it before running this script"
[[ -n "${YLX_ADMIN_PASSWORD:-}" ]] || fail "YLX_ADMIN_PASSWORD is not set — export it before running this script (never hardcode it)"
[[ -f "$PHOTO_PATH" ]] || fail "photo not found at $PHOTO_PATH — set PHOTO_PATH to a real image file"

browser-act --version >/dev/null 2>&1 || fail "browser-act --version failed — is the CLI installed correctly?"

if [[ -n "${BROWSERACT_BROWSER_ID:-}" ]]; then
  BROWSER_ID="$BROWSERACT_BROWSER_ID"
else
  BROWSER_ID="$(browser-act browser list 2>/dev/null | grep -oP 'id=\K[0-9]+' | head -1)"
fi
[[ -n "${BROWSER_ID:-}" ]] || fail "no browser-act browser available — run 'browser-act browser list' (and authenticate the CLI first)"

pass "browser-act CLI available, jq available, admin creds + photo present, browser id=$BROWSER_ID"
echo "    BASE_URL=$BASE_URL"
echo "    Album title: $ALBUM_TITLE (PIN $ALBUM_PIN)"

# ---------------------------------------------------------------------------
step "Open browser and log in as admin"

must "open browser session at $BASE_URL/admin/login" browser open "$BROWSER_ID" "$BASE_URL/admin/login"
SESSION_OPENED=1
must "wait for login page to settle" wait stable

must "fill admin email" input --selector "#email" --text "$YLX_ADMIN_EMAIL"
must "fill admin password" input --selector "#password" --text "$YLX_ADMIN_PASSWORD"
must "submit login form" click --selector ".login-btn"
must "wait for admin dashboard to load" wait stable
must "confirm admin dashboard loaded" wait selector --selector ".btn-new-album" --state visible --timeout 15000

pass "logged in as $YLX_ADMIN_EMAIL"

# ---------------------------------------------------------------------------
step "Create test album: $ALBUM_TITLE"

must "open New Album modal" click --selector ".btn-new-album"
must "wait for album form modal" wait selector --selector "#album-title" --state visible --timeout 10000

must "fill album title" input --selector "#album-title" --text "$ALBUM_TITLE"
must "fill client name" input --selector "#album-clientName" --text "$CLIENT_NAME"
# The event-date field is a compound day/month/year picker — plain char-by-char
# typing garbles it, --mode fill sets the value directly and is reliable.
must "fill event date" input --selector "#album-eventDate" --text "2099-01-01" --mode fill
must "fill PIN" input --selector "#album-pin" --text "$ALBUM_PIN"
must "set max selections" input --selector "#album-maxSelections" --text "$TEST_MAX_SELECTIONS" --mode fill
must "submit album form" click --selector '.modal-form button[type="submit"]'
must "wait for album list to refresh" wait stable

ALBUM_SELECTOR="button[aria-label=\"Open album ${ALBUM_TITLE}\"]"
must "confirm new album appears in the list" wait selector --selector "$ALBUM_SELECTOR" --state visible --timeout 15000
pass "album created (PIN $ALBUM_PIN, max selections $TEST_MAX_SELECTIONS)"

# ---------------------------------------------------------------------------
step "Open the new album and capture its id/slug"

must "open the new album" click --selector "$ALBUM_SELECTOR"
must "wait for album detail page" wait stable
must "confirm album detail page loaded" wait selector --selector ".album-detail" --state visible --timeout 15000

DETAIL_CSV="$(bract network requests --type xhr,fetch)"
DETAIL_REQ_ID="$(echo "$DETAIL_CSV" | grep -P ',GET,200,Fetch,application/json,[0-9.]+,https?://[^,]*/api/admin/albums/[0-9a-fA-F-]{8,}$' | tail -1 | cut -d, -f1)"
[[ -n "$DETAIL_REQ_ID" ]] || fail "could not find the album-detail API request in network log to read id/slug"

DETAIL_BODY="$(bract network request "$DETAIL_REQ_ID" | sed -n 's/^response_body=//p')"
ALBUM_ID="$(echo "$DETAIL_BODY" | jq -r '.album.id // empty')"
ALBUM_SLUG="$(echo "$DETAIL_BODY" | jq -r '.album.customSlug // .album.slug // empty')"
DETAIL_PIN="$(echo "$DETAIL_BODY" | jq -r '.album.pin // empty')"

[[ -n "$ALBUM_ID" && -n "$ALBUM_SLUG" ]] || fail "album id/slug missing from API response: $DETAIL_BODY"
[[ "$DETAIL_PIN" == "$ALBUM_PIN" ]] || fail "PIN mismatch: expected $ALBUM_PIN, API returned $DETAIL_PIN"

pass "album id=$ALBUM_ID slug=$ALBUM_SLUG (share link: $BASE_URL/gallery/$ALBUM_SLUG)"

# ---------------------------------------------------------------------------
step "Upload test photo to the album"

must "go to upload page" navigate "$BASE_URL/admin/upload"
must "wait for upload page" wait stable
must "confirm album dropdown present" wait selector --selector "#album-select" --state visible --timeout 15000

ALBUM_OPTION="${ALBUM_TITLE} (${CLIENT_NAME})"
must "select the test album" select --selector "#album-select" --option "$ALBUM_OPTION"
must "attach the test photo" upload --selector 'input[type="file"]' --path "$PHOTO_PATH"
must "wait for file to queue" wait stable
must "start upload" click --selector ".upload-btn"

UPLOAD_DONE=0
for _ in $(seq 1 30); do
  STATS="$(bract get text --selector ".upload-stats" 2>/dev/null || true)"
  if echo "$STATS" | grep -q "Done: 1"; then
    UPLOAD_DONE=1
    break
  fi
  sleep 2
done
[[ "$UPLOAD_DONE" -eq 1 ]] || fail "photo upload did not finish within timeout"
pass "photo uploaded and finalized into the album"

# ---------------------------------------------------------------------------
step "Open gallery as a client and enter PIN"

must "navigate to gallery share link" navigate "$BASE_URL/gallery/$ALBUM_SLUG"
must "wait for PIN entry page" wait stable
must "confirm PIN entry visible" wait selector --selector 'input[aria-label="Digit 1"]' --state visible --timeout 15000

for i in 1 2 3 4; do
  DIGIT="${ALBUM_PIN:$((i - 1)):1}"
  must "enter PIN digit $i" input --selector "input[aria-label=\"Digit $i\"]" --text "$DIGIT"
done
must "wait for verification" wait stable
must "confirm photo grid loaded" wait selector --selector 'div[aria-label^="View photo"]' --state visible --timeout 15000

pass "PIN accepted, photo grid loaded with the uploaded photo"

# ---------------------------------------------------------------------------
step "Select the photo and submit"

must "open the photo in the lightbox" click --selector 'div[aria-label^="View photo"]'
must "wait for lightbox" wait selector --selector ".lightbox-content" --state visible --timeout 10000
must "select the photo" click --selector ".lightbox-select"

SELECT_TEXT="$(bract get text --selector ".lightbox-select" 2>&1)"
echo "$SELECT_TEXT" | grep -q "Selected" || fail "photo did not register as selected (lightbox button: $SELECT_TEXT)"

must "close the lightbox" click --selector 'button[aria-label="Close lightbox"]'
must "wait for gallery grid" wait stable

# Submitting requires two taps (arm, then confirm) within a 5s window, and
# the confirm button resets its own text synchronously before the async
# submit request finishes — so we drive both taps from one script (removing
# CLI round-trip latency as a variable) and verify success via the network
# log rather than trusting the button's label alone.
SUBMIT_JS='(async()=>{const b=document.querySelector(".submit-btn");if(!b)return"no-button";b.click();await new Promise(r=>setTimeout(r,400));const mid=b.textContent;b.click();await new Promise(r=>setTimeout(r,900));return JSON.stringify({mid,fin:b.textContent});})()'
SUBMIT_RESULT="$(js_eval "$SUBMIT_JS")"
echo "    submit-button transcript: $SUBMIT_RESULT"
echo "$SUBMIT_RESULT" | grep -q '"mid":"Yes, Submit"' || fail "submit confirmation did not arm correctly ($SUBMIT_RESULT)"

SUBMIT_NET="$(bract network requests --filter "/api/gallery/${ALBUM_SLUG}/submit" --type xhr,fetch)"
echo "$SUBMIT_NET" | grep -q ",POST,200," || fail "submit request was not observed with a 200 response"

pass "photo selected and submission confirmed (200 from /submit)"

# ---------------------------------------------------------------------------
step "Verify selection in admin, then unlock"

must "go back to admin albums" navigate "$BASE_URL/admin"
must "wait for admin dashboard" wait stable
must "reopen the test album" click --selector "$ALBUM_SELECTOR"
must "wait for album detail page" wait stable
must "confirm album detail page loaded" wait selector --selector ".album-detail" --state visible --timeout 15000

DETAIL_TEXT="$(bract get text --selector body)"
echo "$DETAIL_TEXT" | grep -q "Selected Photos (1" || fail "admin detail page does not show the client's selection"
echo "$DETAIL_TEXT" | grep -qF "$(basename "$PHOTO_PATH")" || fail "selected photo filename not shown in admin detail page"
pass "admin can see the client's submitted selection"

must "click Unlock Gallery" click --selector ".unlock-btn"
must "wait for unlock to apply" wait stable

STATUS_TEXT="$(bract get text --selector ".status-badge" 2>&1)"
[[ "${STATUS_TEXT^^}" == "ACTIVE" ]] || fail "album status is not Active after unlock (got: $STATUS_TEXT)"
AFTER_UNLOCK_TEXT="$(bract get text --selector body)"
echo "$AFTER_UNLOCK_TEXT" | grep -q "Selected Photos (0" || fail "selections were not cleared after unlock"

pass "unlock succeeded — status back to Active, selection cleared"

echo
echo "All stages passed. Proceeding to cleanup (delete test album)."
# Cleanup + final PASS/FAIL summary happens in the cleanup() trap above.
