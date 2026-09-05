#!/bin/sh
set -eu

# Keep preparation and the runtime on the same bucket, including legacy bare names.
export CELLD_BUCKET="${CELLD_BUCKET:-az://worldview-celld}"
case "$CELLD_BUCKET" in
  az://*) ;;
  *) CELLD_BUCKET="az://$CELLD_BUCKET" ;;
esac

cd /app
node scripts/deploy-celld-azurite.mjs
exec "$CELLD_BIN" "$@"
