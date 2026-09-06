# mdhere

mdhere is a read-only, macOS-first Markdown reader for an existing local folder. It keeps one confined library in its single reader window, renders safe GitHub-flavored Markdown, and keeps local files under Rust’s authority rather than granting the webview filesystem access.

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
pnpm tauri dev -- -- "$(git rev-parse --show-toplevel)/tests/fixtures/library"
```

The extra `--` forwards the positional folder past Cargo. With no positional folder, mdhere uses the development command’s current directory.

Useful checks:

```sh
pnpm verify
pnpm build
pnpm tauri build --bundles app
```

`pnpm verify` runs formatting, linting, TypeScript/Svelte checks, native checks, the production-license policy, and all automated tests. `pnpm verify:bundle -- "<path>/mdhere.app"` checks a built app’s name, identity, version, macOS minimum, bundled themes, font notices, and source capability policy.

## Release

`package.json` is the application version authority. Prepare a version with the repository command so the package, Cargo manifest, and Cargo lock metadata stay aligned:

```sh
pnpm version:prepare -- 0.2.0 --dry-run
pnpm version:prepare -- 0.2.0
```

Review and commit those metadata changes on `main`; CI verifies committed metadata and never prepares a version. After the commit is on `origin/main`, create and preflight the exact annotated version tag before pushing it:

```sh
git fetch origin main
git tag -a v0.2.0 -m "mdhere 0.2.0"
pnpm release:preflight -- refs/tags/v0.2.0
git push origin v0.2.0
```

Do not push a tag until its commit is present on `origin/main`. The preflight rejects noncanonical tags, version mismatches, inconsistent Cargo metadata, and tagged commits outside `origin/main`.

The single [Verify and release workflow](.github/workflows/release.yml) runs `pnpm verify` for pull requests to `main`, pushes to `main`, and `v*.*.*` tag pushes. Ordinary pull requests and `main` pushes cannot create release state. A valid tag is serialized by tag name and follows this transaction:

1. verify the repository and run tag/version/main-ancestry preflight;
2. select the Apple signing mode, then create or reuse a draft release with generated notes;
3. build all three platforms with a fail-fast-disabled matrix and upload to that draft; and
4. confirm the draft contains exactly the three expected assets before publishing it.

A failed check or build leaves the release as a draft and prevents publication. Use **Re-run failed jobs** in GitHub Actions after correcting a transient failure. A whole-workflow rerun reuses the existing draft, and the pinned Tauri action replaces same-named draft assets. Never publish a retained draft manually unless all three expected assets and every required job have been independently verified.

Release jobs request only the permissions they need: verification has `contents: read`; draft creation, asset upload, and final publication have `contents: write`. The repository Actions token therefore needs permission to create releases, but no personal access token is required.

The release matrix uses only these explicit Tauri build arguments and assets:

| Platform        | Command               | Published asset               |
| --------------- | --------------------- | ----------------------------- |
| macOS universal | `pnpm bundle:macos`   | `mdhere_0.2.0_universal.dmg`  |
| Linux x86-64    | `pnpm bundle:linux`   | `mdhere_0.2.0_amd64.AppImage` |
| Windows x86-64  | `pnpm bundle:windows` | `mdhere_0.2.0_x64-setup.exe`  |

Run a cross-platform command locally only on its corresponding operating system. These package commands build but do not publish or upload artifacts. Updater JSON, extra architectures, and additional installer formats are intentionally disabled.

### Apple signing modes

The workflow selects one of two macOS modes without printing secret values:

- **Ad-hoc:** leave all six Apple secrets absent. The build sets `APPLE_SIGNING_IDENTITY=-`; it is not Developer ID signed or notarized.
- **Developer ID:** configure all six secrets. The workflow imports the `.p12` into a temporary keychain, derives its `Developer ID Application` identity, signs, notarizes, and removes the certificate and keychain even after failure.

A partial secret set is a configuration error. The preflight fails before draft creation and reports only the missing variable names:

| Secret                       | Value                                          |
| ---------------------------- | ---------------------------------------------- |
| `APPLE_CERTIFICATE`          | Base64-encoded Developer ID Application `.p12` |
| `APPLE_CERTIFICATE_PASSWORD` | Password used when exporting that `.p12`       |
| `KEYCHAIN_PASSWORD`          | Random password for the temporary CI keychain  |
| `APPLE_ID`                   | Apple developer account email                  |
| `APPLE_PASSWORD`             | App-specific password for that Apple ID        |
| `APPLE_TEAM_ID`              | Apple Developer team identifier                |

An ad-hoc downloaded DMG will initially be blocked by Gatekeeper. Drag mdhere to Applications, attempt to open it once, then use **System Settings → Privacy & Security → Open Anyway** and confirm the prompt. Do not describe an ad-hoc build as Apple signed or notarized.

Keep this warning until a tagged GitHub-hosted run uses `developer-id` mode, its macOS job reports successful signing and notarization, and the DMG downloaded from that release passes a real Gatekeeper launch check. Only after all of that evidence exists should the ad-hoc warning be removed in a separate documentation change.

## Use the app

- **Open Folder** replaces the current window’s root only. Cancelling keeps its current root.
- **Refresh** rescans the current root and retains the selected document when possible.
- **⌘+=**, **⌘++**, **⌘-**, and **⌘0** adjust or reset application zoom on macOS. Use Control instead of Command on Windows and Linux. The zoom level is restored after restart.
- Launching `mdhere` uses the shell’s current directory in the sole reader window. `mdhere <folder>` retargets that window to a folder. `mdhere <folder> <relative-file>` retargets it and displays that Markdown file relative to the supplied folder. A subsequent invocation focuses the existing window instead of opening another.

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

mdhere does not edit files, watch for filesystem changes, search, synchronize with Resonance, load remote content, support raw HTML or SVG, auto-update, publish through an app store or package manager, or sign Windows and Linux downloads. Developer ID signing and notarization activate only when the complete Apple secret set is configured; otherwise the macOS release is explicitly ad-hoc signed.
