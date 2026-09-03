#!/bin/sh
set -eu
root=$(mktemp -d)
trap 'rm -rf "$root"' EXIT
app="$root/mdhere.app"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources/themes/mdhere-light" "$app/Contents/Resources/themes/mdhere-dark"
cat > "$app/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>dev.mdhere.app</string>
<key>LSMinimumSystemVersion</key><string>13.0</string>
<key>CFBundleExecutable</key><string>mdhere</string>
</dict></plist>
PLIST
: > "$app/Contents/MacOS/mdhere"
chmod +x "$app/Contents/MacOS/mdhere"
for theme in mdhere-light mdhere-dark; do
  : > "$app/Contents/Resources/themes/$theme/theme.json"
  : > "$app/Contents/Resources/themes/$theme/reader.css"
done
pnpm verify:bundle -- "$app"
