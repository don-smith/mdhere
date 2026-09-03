#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
fixture_root="$(mktemp -d -t mdhere-reader-check)"

cleanup() {
  rm -rf "$fixture_root"
}
trap cleanup EXIT

mkdir -p "$fixture_root/images"

cat >"$fixture_root/Readme.md" <<'MARKDOWN'
# Reader check

~~Strikethrough~~ and “typographic quotes”.

- [x] completed task
- [ ] open task

| Feature | Result |
| --- | --- |
| Table | works |

```ts
const rendered = true;
```

![Local image](images/cover.png)
![Missing image](images/missing.png)

[Jump to second document](Second.md#second-section)
[Open HTTPS](https://example.com)
[Blocked traversal](../outside.md)

<script>alert('must not run')</script>
MARKDOWN

cat >"$fixture_root/Second.md" <<'MARKDOWN'
# Second section

Local-link destination.
MARKDOWN

cat >"$fixture_root/images/cover.ppm" <<'PPM'
P3
8 8
255
224 82 82  224 82 82  224 82 82  224 82 82  224 82 82  224 82 82  224 82 82  224 82 82
224 82 82  255 220 94  255 220 94  255 220 94  255 220 94  255 220 94  255 220 94  224 82 82
224 82 82  255 220 94  38 166 91  38 166 91  38 166 91  38 166 91  255 220 94  224 82 82
224 82 82  255 220 94  38 166 91  66 133 244  66 133 244  38 166 91  255 220 94  224 82 82
224 82 82  255 220 94  38 166 91  66 133 244  66 133 244  38 166 91  255 220 94  224 82 82
224 82 82  255 220 94  38 166 91  38 166 91  38 166 91  38 166 91  255 220 94  224 82 82
224 82 82  255 220 94  255 220 94  255 220 94  255 220 94  255 220 94  255 220 94  224 82 82
224 82 82  224 82 82  224 82 82  224 82 82  224 82 82  224 82 82  224 82 82  224 82 82
PPM
sips -s format png -Z 240 "$fixture_root/images/cover.ppm" --out "$fixture_root/images/cover.png" >/dev/null
rm "$fixture_root/images/cover.ppm"

cat <<EOF
Launching mdhere with a temporary manual-check library.

Check that tables, tasks, strikethrough, typography, code, and the local image render.
Confirm the missing image and traversal link fail safely; the HTTPS link opens externally;
and the local link opens Second.md with its heading focused. No alert should appear.

Close the development app to remove the temporary library.
EOF

cd "$repo_root"
pnpm tauri dev -- -- --root "$fixture_root"
