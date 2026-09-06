#!/bin/sh
set -eu
[ "$#" -eq 1 ] || { echo "usage: install-local.sh <path-to-mdhere.app>" >&2; exit 64; }
app=$1
[ -d "$app" ] || { echo "mdhere app bundle not found: $app" >&2; exit 66; }
app=$(cd "$app" && pwd)
[ -x "$app/Contents/MacOS/mdhere" ] || { echo "mdhere executable not found in app bundle" >&2; exit 66; }
target="${HOME}/.local/bin"
mkdir -p "$target"
sed "s|/Applications/mdhere.app/Contents/MacOS/mdhere|$app/Contents/MacOS/mdhere|" "$(dirname "$0")/mdhere" > "$target/mdhere"
chmod +x "$target/mdhere"
printf 'Installed %s\n' "$target/mdhere"
