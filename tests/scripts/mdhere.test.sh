#!/bin/sh
set -eu
root=$(mktemp -d)
trap 'rm -rf "$root"' EXIT
mkdir "$root/space folder"
printf '# guide\n' > "$root/space folder/guide.md"
printf 'plain\n' > "$root/space folder/plain.txt"
printf '# outside\n' > "$root/outside.md"
app="$root/app"
cat > "$app" <<'APP'
#!/bin/sh
printf '%s\n' "$@"
APP
chmod +x "$app"
launcher="$(cd "$(dirname "$0")/../.." && pwd)/scripts/mdhere"
(
  cd "$root/space folder"
  MDHERE_APP="$app" "$launcher"
) | grep "$root/space folder"
MDHERE_APP="$app" "$launcher" "$root/space folder" | grep "$root/space folder"
MDHERE_APP="$app" "$launcher" "$root/space folder" "guide.md" | grep "guide.md"
if MDHERE_APP="$app" "$launcher" "$root/missing"; then exit 1; fi
if MDHERE_APP="$app" "$launcher" "$root/space folder" "missing.md"; then exit 1; fi
if MDHERE_APP="$app" "$launcher" "$root/space folder" "plain.txt"; then exit 1; fi
if MDHERE_APP="$app" "$launcher" "$root/space folder" "../outside.md"; then exit 1; fi
bundle="$root/mdhere.app"
mkdir -p "$bundle/Contents/MacOS" "$root/home"
cp "$app" "$bundle/Contents/MacOS/mdhere"
HOME="$root/home" scripts/install-local.sh "$bundle" >/dev/null
installed="$root/home/.local/bin/mdhere"
[ -x "$installed" ]
"$installed" "$root/space folder" "guide.md" | grep "guide.md"
