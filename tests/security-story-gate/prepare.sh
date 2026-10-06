#!/usr/bin/env bash
set -euo pipefail
fixture_dir="$(cd "$(dirname "$0")" && pwd)"
root="$(mktemp -d "${TMPDIR:-/tmp}/mdhere-story-gate.XXXXXX")"
mkdir "$root/library" "$root/outside"
cp "$fixture_dir"/{Story.html,story.css,story.js,pixel.png} "$root/library/"
printf '# Known read-only IPC target\n' > "$root/library/known.md"
printf 'OUTSIDE ROOT: MUST NOT BE SERVED\n' > "$root/outside/secret.js"
cp "$fixture_dir/pixel.png" "$root/outside/outside.png"
ln -s "$root/outside/outside.png" "$root/library/escape.png"
ln -s "$root/outside/secret.js" "$root/library/escape.js"
printf 'fixture root: %s\noutside root: %s\n' "$root/library" "$root/outside"
