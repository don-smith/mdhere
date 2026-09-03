#!/bin/sh
set -eu
root=$(mktemp -d)
trap 'rm -rf "$root"' EXIT
mkdir "$root/space folder"
app="$root/app"
cat > "$app" <<'APP'
#!/bin/sh
printf '%s\n' "$@"
APP
chmod +x "$app"
launcher="$(cd "$(dirname "$0")/../.." && pwd)/scripts/mdhere"
MDHERE_APP="$app" "$launcher" "$root/space folder" | grep -- "--root"
MDHERE_APP="$app" "$launcher" "$root/space folder" | grep "space folder"
if MDHERE_APP="$app" "$launcher" "$root/missing"; then exit 1; fi
bundle="$root/mdhere.app"
mkdir -p "$bundle/Contents/MacOS" "$root/home"
cp "$app" "$bundle/Contents/MacOS/mdhere"
HOME="$root/home" scripts/install-local.sh "$bundle" >/dev/null
installed="$root/home/.local/bin/mdhere"
[ -x "$installed" ]
"$installed" "$root/space folder" | grep -- "--root"
"$installed" "$root/space folder" | grep "space folder"
