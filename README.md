# mdhere

mdhere is a read-only, macOS-first Markdown reader for an existing local folder. It opens one confined library per window, renders safe GitHub-flavored Markdown, and keeps local files under Rust’s authority rather than granting the webview filesystem access.

## Requirements

- macOS 13 or later
- Node 24.20.x (`corepack` enabled)
- Rust 1.98.0

Install dependencies and the browser used by the in-memory browser suite:

```sh
corepack pnpm install
pnpm exec playwright install chromium
```

## Develop

Open the fixture library in a Tauri development window:

```sh
pnpm tauri dev -- -- --root "$(git rev-parse --show-toplevel)/tests/fixtures/library"
```

The extra `--` forwards `--root` past Cargo. To open without a root, omit everything after `dev`; mdhere presents the native folder picker.

Useful checks:

```sh
pnpm verify
pnpm build
pnpm tauri build --bundles app
```

`pnpm verify` runs formatting, linting, TypeScript/Svelte checks, native checks, the production-license policy, and all automated tests. `pnpm verify:bundle -- "<path>/mdhere.app"` checks a built app’s name, identity, version, macOS minimum, bundled themes, font notices, and source capability policy.

## Prepare release metadata

`package.json` is the application version authority. Prepare a version with the repository command so the package, Cargo manifest, and Cargo lock metadata stay aligned:

```sh
pnpm version:prepare -- 0.2.0 --dry-run
pnpm version:prepare -- 0.2.0
```

Review and commit those metadata changes before creating `v0.2.0`. CI must verify committed metadata; it must not prepare a version. After fetching `origin/main` and creating the tag locally, its preflight is:

```sh
git fetch origin main
pnpm release:preflight -- refs/tags/v0.2.0
```

The first release matrix uses only these explicit Tauri build arguments:

| Platform        | Command               | Expected bundle               |
| --------------- | --------------------- | ----------------------------- |
| macOS universal | `pnpm bundle:macos`   | `mdhere_0.2.0_universal.dmg`  |
| Linux x86-64    | `pnpm bundle:linux`   | `mdhere_0.2.0_amd64.AppImage` |
| Windows x86-64  | `pnpm bundle:windows` | `mdhere_0.2.0_x64-setup.exe`  |

Run each cross-platform command on its corresponding operating system. Release workflow and signing instructions are added separately; these commands do not publish or upload artifacts.

## Use the app

- **Open Folder** replaces the current window’s root only. Cancelling keeps its current root.
- **Refresh** rescans the current root and retains the selected document when possible.
- **⌘N** opens a new window and asks for a folder.
- **⌘+=**, **⌘++**, **⌘-**, and **⌘0** adjust or reset whole-application zoom on macOS. Use Control instead of Command on Windows and Linux. The zoom level is shared by all windows and restored after restart.
- Launching `mdhere [folder]` opens a separate window for that directory; no argument uses the shell’s current directory.

### Keyboard controls

| Context | Keys                       | Action                                        |
| ------- | -------------------------- | --------------------------------------------- |
| Tree    | `j` / `k`, `↓` / `↑`       | Move through visible items                    |
| Tree    | `h` / `l`, `←` / `→`       | Collapse/expand folders                       |
| Tree    | `Enter` / `Space`          | Open a document or toggle a folder            |
| Tree    | `gg` / `G`, `Home` / `End` | First/last visible item                       |
| Tree    | `Shift+J` / `Shift+K`      | Scroll the reader without moving tree focus   |
| Tree    | `Tab`                      | Move to the reader                            |
| Reader  | `j` / `k`, `d` / `u`       | Scroll by line or half-page                   |
| Reader  | `gg` / `G`                 | Jump to the top/bottom                        |
| Reader  | `Esc`                      | Return to the tree                            |
| App     | `⌘/Ctrl+=`, `+`, `-`, `0`  | Increase, decrease, or reset application zoom |
| App     | `?`                        | Show keyboard help                            |

## Install the command

Build the unsigned local app first, then install its launcher without administrator access:

```sh
pnpm tauri build --bundles app
scripts/install-local.sh "src-tauri/target/release/bundle/macos/mdhere.app"
```

The installer writes `~/.local/bin/mdhere`. Add that directory to `PATH` if it is not already present:

```sh
export PATH="$HOME/.local/bin:$PATH"
```

Moving or replacing the `.app` requires rerunning the installer. The build is unsigned and not notarized, so macOS Gatekeeper may require you to approve it in **System Settings → Privacy & Security** before its first launch.

## Security boundaries

- Rust canonicalizes every selected root and confines scans, document reads, local links, and image protocol requests to that root.
- The reader permits Markdown, not raw HTML; rendered output is sanitized. Remote images, SVG, unsafe URL schemes, and paths outside the root are blocked.
- The webview receives only Tauri’s `core:default` capability. It has no filesystem, shell, dialog, or plugin permission.
- External links are limited to validated `https` URLs and open through a narrow native command.

## Themes

mdhere includes light and dark themes, remembers the global choice, and supports trusted local reader-theme packages. See [the theme guide](docs/themes.md) and its [starter package](docs/themes/starter/).

## v1 exclusions

mdhere does not edit files, watch for filesystem changes, search, synchronize with Resonance, load remote content, support raw HTML or SVG, or ship signing, notarization, auto-update, App Store, Windows, or Linux distribution.
