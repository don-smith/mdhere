# Themes

mdhere includes Paper, Midnight, and Field Notes. Theme selection applies to every open window and is stored in:

```text
~/Library/Application Support/dev.mdhere.app/themes
```

Choose "Open Themes Folder" to create and reveal that folder. "Reload Themes" reads packages again. If the selected package is absent or invalid, mdhere uses Paper until the package is valid again. It keeps the saved package ID, so a repaired package becomes active after reload.

## Install a package

A package is a directory with `theme.json` and `reader.css`.

1. Copy `docs/themes/starter` to the Themes folder.
2. Rename the copied directory.
3. Set a unique lower-case `id` in `theme.json`.
4. Edit its shell tokens and reader CSS.
5. Reload themes in mdhere.

User packages cannot replace a built-in ID. mdhere reads local packages only. The app blocks remote network content, and `reader.css` is confined to the reader Shadow DOM.

## Schema v2

`theme.json` uses schema version 2. `id` may contain lower-case ASCII letters, digits, and single hyphens. `name` must not be empty. `appearance` is `light` or `dark`.

Every `shell` token is required. Values are `#RRGGBB`, except `overlay`, which is `#RRGGBBAA`.

| Token              | Use                                                |
| ------------------ | -------------------------------------------------- |
| `background`       | Window canvas                                      |
| `panel`            | Library sidebar                                    |
| `surface`          | Toolbar and status strip                           |
| `raisedSurface`    | Dialogs, notices, inputs, selects, raised controls |
| `foreground`       | Normal shell text and icons                        |
| `foregroundStrong` | Titles and high-emphasis text                      |
| `muted`            | Secondary text and resting controls                |
| `faint`            | Paths, section labels, tertiary status             |
| `border`           | Dividers and ordinary outlines                     |
| `borderStrong`     | Elevated outlines                                  |
| `accent`           | Active controls and selection markers              |
| `accentForeground` | Content placed on `accent`                         |
| `accentSoft`       | Low-emphasis accent backgrounds                    |
| `hover`            | Pointer-hover background                           |
| `selected`         | Selected tree row and pressed state                |
| `focus`            | Keyboard focus indicator                           |
| `danger`           | Errors and unavailable content                     |
| `warning`          | Theme diagnostics and malformed front matter       |
| `overlay`          | Dialog backdrop                                    |

Unknown fields are ignored. mdhere rejects missing or malformed required fields and identifies the field in its diagnostic.

```json
{
  "schemaVersion": 2,
  "id": "paper-blue",
  "name": "Paper Blue",
  "appearance": "light",
  "shell": {
    "background": "#f7f8fb",
    "panel": "#ffffff",
    "surface": "#ffffff",
    "raisedSurface": "#ffffff",
    "foreground": "#172033",
    "foregroundStrong": "#101827",
    "muted": "#5a6475",
    "faint": "#7b8494",
    "border": "#d9dfea",
    "borderStrong": "#b8c3d6",
    "accent": "#195bbd",
    "accentForeground": "#ffffff",
    "accentSoft": "#e5efff",
    "hover": "#f0f4fa",
    "selected": "#dbeafe",
    "focus": "#195bbd",
    "danger": "#a63838",
    "warning": "#966614",
    "overlay": "#17203366"
  }
}
```

## Reader CSS contract

`reader.css` is adopted after mdhere's structural reader CSS. Package CSS owns reader presentation, while mdhere keeps overflow handling, image sizing, table mechanics, focus mechanics, task-list mechanics, and the framed page bounds.

Use these stable hooks: `:host`, `.reader-page`, `.reader-content`, `.front-matter`, `.front-matter-summary`, `.front-matter-fields`, `.front-matter-field`, `.front-matter-key`, `.front-matter-value`, `.front-matter-map`, `.front-matter-list`, `.front-matter-tags`, `.front-matter-tag`, `.front-matter-warning`, `.mdhere-image-unavailable`, `.shiki`, `.task-list-item`, `.contains-task-list`, plus ordinary Markdown element selectors. Define every listed hook in `reader.css`; selectors may be grouped when they share a rule. The starter stylesheet is a complete readable implementation of this contract.

Syntax highlighting reads these CSS variables from the package: `--shiki-foreground`, `--shiki-background`, `--shiki-token-comment`, `--shiki-token-constant`, `--shiki-token-string`, `--shiki-token-string-expression`, `--shiki-token-keyword`, `--shiki-token-parameter`, `--shiki-token-function`, `--shiki-token-punctuation`, `--shiki-token-link`, `--shiki-token-changed`, `--shiki-token-deleted`, and `--shiki-token-inserted`. mdhere emits only `var(--shiki-…)` references, so packages choose the complete syntax palette without a fixed Shiki theme.

## V1 to v2 migration

Schema v1 packages are rejected. Set `schemaVersion` to `2`, add the fourteen new shell tokens, and replace the old five-token `shell` object with all nineteen tokens in the starter package. Keep `id`, `name`, and `appearance`. Reload the package after saving it.

## Package boundaries

Packages are local files. They cannot add shell CSS, scripts, downloads, or remote assets. They can set validated shell tokens and reader CSS inside the reader Shadow DOM.
