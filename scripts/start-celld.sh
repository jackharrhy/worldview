#!/bin/sh
set -eu

# Authoritative objects and disposable replicas share the persistent volume,
# but occupy separate directories so cache cleanup cannot remove the store.
export CELLD_BIN="${CELLD_BIN:-celld}"
export CELLD_BUCKET="${CELLD_BUCKET:-sqlite:///var/lib/celld/object-store/objects.sqlite3}"
export CELLD_WATCH="${CELLD_WATCH:-/var/lib/celld/state-sqlite}"
export CELLD_DURABILITY="${CELLD_DURABILITY:-bucket}"

cd "$(dirname "$0")/.."
node scripts/deploy-celld.mjs
exec "$CELLD_BIN" --no-control-plane "$@"
