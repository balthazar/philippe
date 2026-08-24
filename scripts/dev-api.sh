#!/usr/bin/env bash
# Runs the API locally against the PRODUCTION database.
#
# One state, not two: local dev and philippe.balthazar.dev read and write the
# same `philippe` database, so an edit made in the local admin is live on the
# public site the moment it saves, and vice versa. There is no separate local
# Mongo any more -- docker-compose.dev.yml's `mongo` service is now only the
# WordPress migration's scratch database (migrate/), nothing else.
#
# Requires scripts/dev-mongo.sh running in another terminal: 27019 is a
# port-forward into the cluster, not a local server.
#
# Two things are deliberately NOT shared with production:
#
#   - Media. Uploads made here land in MEDIA_ROOT on this machine only; an
#     image uploaded locally 404s on the public site until its file is copied
#     onto the cluster's philippe-media volume (and the reverse). Only the
#     database is shared.
#   - The admin login. seedAdmin() only creates a user when the collection is
#     empty and production's already holds the real admin, so no ADMIN_EMAIL /
#     ADMIN_PASSWORD is set here: log in with the PRODUCTION credentials (read
#     the password back with the command in docs/deploy.md).
set -euo pipefail

cd "$(dirname "$0")/.."

MONGO_PORT=${MONGO_LOCAL_PORT:-27019}
if ! nc -z 127.0.0.1 "$MONGO_PORT" >/dev/null 2>&1; then
  echo "nothing listening on 127.0.0.1:$MONGO_PORT -- start ./scripts/dev-mongo.sh first" >&2
  exit 1
fi

# Signs this machine's admin session cookies and nothing else -- unrelated to
# production's own JWT_SECRET. Persisted (rather than generated per run)
# because `node --watch` restarts the process on every file save, and a secret
# that changed each time would log you out on every edit. .dev/ is gitignored.
mkdir -p .dev
SECRET_FILE=.dev/jwt-secret
[ -f "$SECRET_FILE" ] || { openssl rand -hex 32 > "$SECRET_FILE"; chmod 600 "$SECRET_FILE"; }

export MONGO_URI="mongodb://127.0.0.1:$MONGO_PORT"
export MONGO_DB=philippe
export MEDIA_ROOT=${MEDIA_ROOT:-/tmp/philippe-media}
export PORT=${PORT:-8090}
export JWT_SECRET=$(cat "$SECRET_FILE")

echo "api -> $MONGO_URI/$MONGO_DB (PRODUCTION), media $MEDIA_ROOT, port $PORT"
cd api
exec npm run dev
