#!/bin/sh
# Sets the release version shown in the app and used for the offline cache.
# Usage: scripts/release.sh <version>
set -eu

version="${1:-}"
if ! printf '%s' "$version" | grep -Eq '^[0-9A-Za-z][0-9A-Za-z.-]*$'; then
  echo "usage: $0 <version>   (e.g. 1.1)" >&2
  exit 1
fi

cd "$(dirname "$0")/.."

missing=0
for asset in $(sed -n 's/^  "\(.*\)",$/\1/p' sw.js); do
  [ "$asset" = "./" ] && continue
  if [ ! -f "$asset" ]; then
    echo "sw.js lists a missing file: $asset" >&2
    missing=1
  fi
done
[ "$missing" -eq 0 ] || exit 1

sed -i "s/^const APP_VERSION = \".*\";/const APP_VERSION = \"$version\";/" app.js
sed -i "s/^const CACHE_VERSION = \".*\";/const CACHE_VERSION = \"$version\";/" sw.js

grep -H '^const APP_VERSION' app.js
grep -H '^const CACHE_VERSION' sw.js
