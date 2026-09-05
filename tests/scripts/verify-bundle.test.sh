#!/bin/sh
set -eu
root=$(mktemp -d)
trap 'rm -rf "$root"' EXIT
app="$root/mdhere.app"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources/themes"
cat > "$app/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>dev.mdhere.app</string>
<key>CFBundleName</key><string>mdhere</string>
<key>CFBundleShortVersionString</key><string>0.1.0</string>
<key>CFBundleVersion</key><string>0.1.0</string>
<key>LSMinimumSystemVersion</key><string>13.0</string>
<key>CFBundleExecutable</key><string>mdhere</string>
</dict></plist>
PLIST
: > "$app/Contents/MacOS/mdhere"
chmod +x "$app/Contents/MacOS/mdhere"
reader_selectors=':host .reader-page .reader-content .front-matter .front-matter-summary .front-matter-fields .front-matter-field .front-matter-key .front-matter-value .front-matter-map .front-matter-list .front-matter-tags .front-matter-tag .front-matter-warning .mdhere-image-unavailable .shiki .task-list-item .contains-task-list'
shiki_variables='--shiki-foreground --shiki-background --shiki-token-comment --shiki-token-constant --shiki-token-string --shiki-token-string-expression --shiki-token-keyword --shiki-token-parameter --shiki-token-function --shiki-token-punctuation --shiki-token-link --shiki-token-changed --shiki-token-deleted --shiki-token-inserted'
contract_css=':host {'
for variable in $shiki_variables; do contract_css="$contract_css$variable: #000000;"; done
contract_css="$contract_css }"
for selector in $reader_selectors; do contract_css="$contract_css\n$selector {}"; done

for theme in mdhere-light mdhere-dark field-notes; do
  package="$app/Contents/Resources/themes/$theme"
  mkdir -p "$package"
  cat > "$package/theme.json" <<JSON
{"schemaVersion":2,"id":"$theme","name":"$theme","appearance":"light","shell":{"background":"#ffffff","panel":"#ffffff","surface":"#ffffff","raisedSurface":"#ffffff","foreground":"#172033","foregroundStrong":"#101827","muted":"#5a6475","faint":"#7b8494","border":"#d9dfea","borderStrong":"#b8c3d6","accent":"#195bbd","accentForeground":"#ffffff","accentSoft":"#e5efff","hover":"#f0f4fa","selected":"#dbeafe","focus":"#195bbd","danger":"#a63838","warning":"#966614","overlay":"#17203366"}}
JSON
  printf '%b\n' "$contract_css" > "$package/reader.css"
done
if pnpm verify:bundle -- "$app"; then
  echo 'verify:bundle accepted a bundle without font license notices' >&2
  exit 1
fi
mkdir -p "$app/Contents/Resources/licenses/fonts"
cp THIRD_PARTY_LICENSES.md "$app/Contents/Resources/licenses/THIRD_PARTY_LICENSES.md"
cp src/assets/fonts/inventory.json src/assets/fonts/LICENSE-Source-Sans-3.md src/assets/fonts/LICENSE-Source-Serif-4.md "$app/Contents/Resources/licenses/fonts/"
pnpm verify:bundle -- "$app"

renamed="$root/not-mdhere.app"
mv "$app" "$renamed"
if pnpm verify:bundle -- "$renamed"; then
  echo 'verify:bundle accepted an incorrectly named application bundle' >&2
  exit 1
fi
mv "$renamed" "$app"

cp "$app/Contents/Info.plist" "$root/Info.plist"
perl -0pi -e 's/<string>0\.1\.0<\//<string>9.9.9<\//g' "$app/Contents/Info.plist"
if pnpm verify:bundle -- "$app"; then
  echo 'verify:bundle accepted stale application version metadata' >&2
  exit 1
fi
cp "$root/Info.plist" "$app/Contents/Info.plist"

printf '\nstale\n' >> "$app/Contents/Resources/licenses/fonts/LICENSE-Source-Sans-3.md"
if pnpm verify:bundle -- "$app"; then
  echo 'verify:bundle accepted a stale font license notice' >&2
  exit 1
fi
cp src/assets/fonts/LICENSE-Source-Sans-3.md "$app/Contents/Resources/licenses/fonts/"

: > "$app/Contents/Resources/themes/field-notes/reader.css"
if pnpm verify:bundle -- "$app"; then
  echo 'verify:bundle accepted empty reader.css' >&2
  exit 1
fi
printf '%b\n' "$contract_css" > "$app/Contents/Resources/themes/field-notes/reader.css"
printf '/* %s %s */\n:host { content: "%s"; }\n.reader-page { content: ".reader-content"; }\n' "$reader_selectors" "$shiki_variables" "$shiki_variables" > "$app/Contents/Resources/themes/field-notes/reader.css"
if pnpm verify:bundle -- "$app"; then
  echo 'verify:bundle accepted reader contract entries in comments or string values' >&2
  exit 1
fi
printf '%b\n' "$contract_css" > "$app/Contents/Resources/themes/field-notes/reader.css"
printf '{"schemaVersion":2,"id":"field-notes","name":"Field Notes","appearance":"light","shell":{}}\n' > "$app/Contents/Resources/themes/field-notes/theme.json"
if pnpm verify:bundle -- "$app"; then
  echo 'verify:bundle accepted an incomplete manifest' >&2
  exit 1
fi

for token in background panel surface raisedSurface foreground foregroundStrong muted faint border borderStrong accent accentForeground accentSoft hover selected focus danger warning overlay; do
  grep -q "\`$token\`" docs/themes.md
  grep -q "\"$token\"" docs/themes/starter/theme.json
done
for hook in :host .reader-page .reader-content .front-matter .front-matter-summary .front-matter-fields .front-matter-field .front-matter-key .front-matter-value .front-matter-map .front-matter-list .front-matter-tags .front-matter-tag .front-matter-warning .mdhere-image-unavailable .shiki .task-list-item .contains-task-list; do
  grep -Fq "$hook" docs/themes.md
done
for variable in --shiki-foreground --shiki-background --shiki-token-comment --shiki-token-constant --shiki-token-string --shiki-token-string-expression --shiki-token-keyword --shiki-token-parameter --shiki-token-function --shiki-token-punctuation --shiki-token-link --shiki-token-changed --shiki-token-deleted --shiki-token-inserted; do
  grep -Fq -- "$variable" docs/themes.md
done
grep -q 'V1 to v2 migration' docs/themes.md
grep -q 'Install a package' docs/themes.md
