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
sleep "${MDHERE_DELAY:-0}"
printf '%s\n' "$@" > "$MDHERE_LOG"
APP
chmod +x "$app"
launcher="$(cd "$(dirname "$0")/../.." && pwd)/scripts/mdhere"
wait_for_log() {
  tries=0
  while [ ! -s "$1" ]; do
    tries=$((tries + 1))
    [ "$tries" -lt 50 ] || { echo "timed out waiting for $1" >&2; exit 1; }
    sleep 0.1
  done
}
launch() {
  log=$1
  shift
  rm -f "$log"
  MDHERE_APP="$app" MDHERE_LOG="$log" MDHERE_DELAY=1 "$launcher" "$@"
  [ ! -e "$log" ] || { echo "launcher waited for the app" >&2; exit 1; }
  wait_for_log "$log"
}
(
  cd "$root/space folder"
  launch "$root/cwd.log"
)
grep "$root/space folder" "$root/cwd.log"
launch "$root/folder.log" "$root/space folder"
grep "$root/space folder" "$root/folder.log"
launch "$root/file.log" "$root/space folder" "guide.md"
grep "guide.md" "$root/file.log"
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
log="$root/installed.log"
MDHERE_LOG="$log" MDHERE_DELAY=1 "$installed" "$root/space folder" "guide.md"
[ ! -e "$log" ] || { echo "installed launcher waited for the app" >&2; exit 1; }
wait_for_log "$log"
grep "guide.md" "$log"

# An installed launcher must not retain a relative path to the selected app bundle.
# It must work when invoked from an unrelated directory.
mkdir "$root/relative-home"
installer="$(cd "$(dirname "$0")/../.." && pwd)/scripts/install-local.sh"
(
  cd "$root"
  HOME="$root/relative-home" "$installer" "mdhere.app" >/dev/null
)
installed="$root/relative-home/.local/bin/mdhere"
log="$root/relative-install.log"
(
  cd /
  MDHERE_LOG="$log" MDHERE_DELAY=1 "$installed" "$root/space folder" "guide.md"
)
wait_for_log "$log"
grep "guide.md" "$log"
