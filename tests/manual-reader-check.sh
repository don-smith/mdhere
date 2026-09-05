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
---
title: Reader check
tags: [manual, reader, safe, ignored]
context:
  mode: visual
---
# Reader check

This longer fixture should read as one plausible field guide rather than a component catalogue. ~~Strikethrough~~ and “typographic quotes” remain visible. Inline code such as `WaitingToSync`, `#general`, and `mdhere --refresh` must stay whole in a narrow reader.

## Field observations

- morning light at the overlook
- a repaired trail marker
- notes stored beside their image

### Review route

1. Read once for continuity.
2. Compare local evidence.
3. Resize before approval.

#### Work still visible

- [x] completed task
- [ ] open task

##### Reading desk note

> A useful reader makes structure visible, then gets out of the way.

###### Technical appendix

| Feature | Result |
| --- | --- |
| Table | works |

```ts
const rendered = true;
```

```mermaid
flowchart LR
  A[Refresh source] --> B[Diagram]
```

```mmd
sequenceDiagram
  Reader->>Mermaid: Render diagram
  Mermaid-->>Reader: SVG
```

```mermaid
This is not a Mermaid diagram.
```

```mermaid
%%{init: {"theme": "dark", "themeVariables": {"lineColor": "#ff0000"}} }%%
flowchart LR
  App palette --> Still active
```

```mermaid
flowchart LR; Rejected --> Style; style Rejected fill:#ff0000
```

![Local image](images/cover.png)
![Missing image](images/missing.png)
![Unavailable remote image](https://example.com/image.png)

[Jump to second document](Second.md#second-section)
[Open HTTPS](https://example.com)
[Blocked traversal](../outside.md)

<script>alert('must not run')</script>
MARKDOWN

cat >"$fixture_root/Second.md" <<'MARKDOWN'
# Second section

Local-link destination.
MARKDOWN

cat >"$fixture_root/Malformed.md" <<'MARKDOWN'
---
title: [unterminated
---
# Malformed front matter
MARKDOWN

{
  printf '%s\n' '---' 'notes: '
  head -c $((64 * 1024 + 1)) /dev/zero | tr '\0' x
  printf '%s\n' '' '---' '# Over-limit front matter'
} >"$fixture_root/Over-limit.md"

cat >"$fixture_root/Unclosed.md" <<'MARKDOWN'
---
title: This remains Markdown

# Unclosed front matter
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

Check that valid metadata starts collapsed and renders tags and nested values. Confirm Malformed.md
shows an escaped warning, Over-limit.md reports truncated source, and Unclosed.md remains ordinary Markdown.
Also check that all six heading levels, prose, links, ordered and unordered lists, tasks, quotes, tables, strikethrough, typography, code, the valid Mermaid diagrams, and the local image render.
Confirm the invalid Mermaid source remains visible with a clear reason. In Readme.md, edit `A[Refresh source]`
to `A[Changed source]`, then use Refresh library and confirm the updated diagram appears. Repeat the diagram
legibility check in Paper, Midnight, and Field Notes without reopening the document or library. At both 100 and 200 percent zoom, review body comfort, heading hierarchy, vertical rhythm, links, lists, quotes, code, tables, diagrams, metadata, the local image, and unavailable-image treatment. Narrow the packaged app window in every theme and confirm no structural clipping or unreadable contrast. Confirm Source Serif 4 and Source Sans 3 load locally and that the network inspector shows no unexpected requests. In Midnight, check
that the diagram with the `%%{init: ...}%%` directive keeps readable app-controlled connectors instead of red ones.
Confirm the diagram with the semicolon-separated `style` command retains its source with a clear style-override reason. Narrow the reader and
confirm the inline code examples stay whole while prose and fenced code retain their current wrapping and overflow behavior. Confirm the missing image and traversal link fail safely; the HTTPS link opens externally;
and the local link opens Second.md with its heading focused. No alert should appear.

Check the window shell: native traffic lights, title-area glass, drag, and resize must work.
Resize the expanded sidebar, collapse it with its hamburger, use the icon-only Open Folder action,
and expand it to confirm its prior width returns. Close and relaunch the app to confirm that saved
expanded width returns while the sidebar starts expanded. Tab to the Theme trigger: its label and
focus ring must be visible; open it, navigate options with Arrow keys, Home, and End, select with
Enter or Space, dismiss with Escape and a click away, and confirm focus returns to the trigger.
Confirm Reload themes and Themes folder still work across Paper, Midnight, and Field Notes.

With Welcome.md selected and focus in the tree, use Shift+J and Shift+K and confirm the reader scrolls
while the same tree item remains focused and selected. Confirm lowercase j and k still move through the
tree and l still expands or opens its current item. Move focus to the reader, then confirm gg reaches the
top and Shift+G reaches the bottom.

Use Command+=, Command++, Command+-, and Command+0 and confirm the entire application follows the
80, 90, 100, 110, 125, 150, 175, and 200 percent sequence without a second native zoom action. Open a
second window and confirm a zoom change reaches both windows, then open another window and confirm it
starts at the saved zoom. Close and relaunch mdhere and confirm the saved zoom is restored. Confirm zoom
shortcuts do not take over while focus is in the filter input, theme controls, or a dialog.

Close the development app to remove the temporary library.
EOF

cd "$repo_root"
pnpm tauri dev -- -- --root "$fixture_root"
