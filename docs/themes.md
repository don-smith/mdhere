# Themes

mdhere ships with **Mdhere Light** and **Mdhere Dark**. Theme selection applies to every open window and is stored in the application's macOS Application Support directory:

```text
~/Library/Application Support/dev.mdhere.app/themes
```

Choose **Open Themes Folder** from the header to create and reveal that folder. **Reload Themes** re-reads packages without restarting. If a selected package is absent or invalid, mdhere uses the light built-in theme and shows a non-blocking notice.

## Package format

A package is a directory containing `theme.json` and `reader.css`. Copy `docs/themes/starter` into the Themes folder, rename the directory, then edit it.

`theme.json` uses schema version 1. `id` may contain lower-case ASCII letters, digits, and single hyphens only. The five shell colors must be `#RRGGBB` values. User packages cannot replace built-in IDs.

```json
{
  "schemaVersion": 1,
  "id": "paper-blue",
  "name": "Paper Blue",
  "appearance": "light",
  "shell": {
    "background": "#f7f8fb",
    "foreground": "#172033",
    "muted": "#5a6475",
    "border": "#d9dfea",
    "accent": "#195bbd"
  }
}
```

`reader.css` is adopted only by the Markdown reader's Shadow DOM. Use `:host`, `.reader-content`, headings, links, tables, and code selectors to style rendered content. It cannot select the app shell. Custom packages are trusted local customization, but the app CSP still blocks remote network content and the confined asset protocol continues to enforce the selected library root.
