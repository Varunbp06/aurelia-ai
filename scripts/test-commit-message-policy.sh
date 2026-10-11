#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
hook="$root/.githooks/commit-msg"
tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT HUP INT TERM
message_file="$tmpdir/message"
must_pass() {
  label=$1; message=$2; printf '%s\n' "$message" > "$message_file"
  if "$hook" "$message_file" >/dev/null 2>&1; then printf 'PASS: %s\n' "$label"; else echo "FAIL: valid message rejected: $label" >&2; exit 1; fi
}
must_reject() {
  label=$1; message=$2; printf '%s\n' "$message" > "$message_file"
  if "$hook" "$message_file" >/dev/null 2>&1; then echo "FAIL: prohibited message accepted: $label" >&2; exit 1; else status=$?; if [ "$status" -eq 1 ]; then printf 'PASS: rejected %s\n' "$label"; else printf 'FAIL: unexpected hook error for %s (exit %s)\n' "$label" "$status" >&2; exit 1; fi; fi
}
must_pass 'ordinary conventional commit' 'fix: repair deployment configuration'
must_pass 'legitimate reference to the tool name' 'docs: explain Codebuff footer policy'
must_reject 'promotional generated footer' '🤖 Generated with Codebuff'
must_reject 'co-author trailer' 'Co-Authored-By: Codebuff <noreply@codebuff.com>'
must_reject 'lowercase co-author trailer' 'co-authored-by: codebuff'
must_reject 'standalone tool email' 'noreply@codebuff.com'
printf 'All commit-message policy tests passed.\n'
