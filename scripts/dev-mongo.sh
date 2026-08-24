#!/usr/bin/env bash
# Keeps a port-forward open from localhost:27019 to the cluster's Mongo, so
# local development can use the PRODUCTION database (see scripts/dev-api.sh).
#
# `kubectl port-forward` is not durable: it drops on an idle connection, on an
# API-server hiccup, and whenever the mongo pod restarts. A single invocation
# left running for a day will not survive the day, and the failure is silent
# from the API's side (it just stops being able to reach Mongo). Hence the
# loop: when the forward exits for any reason, it is restarted.
#
# Run this in its own terminal and leave it. Ctrl-C stops it.
set -uo pipefail

CONTEXT=${MONGO_CONTEXT:-dadonew}
NAMESPACE=${MONGO_NAMESPACE:-infra}
LOCAL_PORT=${MONGO_LOCAL_PORT:-27019}

if lsof -nP -iTCP:"$LOCAL_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "port $LOCAL_PORT is already bound -- another port-forward is probably already running" >&2
  exit 1
fi

echo "forwarding localhost:$LOCAL_PORT -> svc/mongo:27017 ($CONTEXT/$NAMESPACE); Ctrl-C to stop"
while true; do
  kubectl --context "$CONTEXT" -n "$NAMESPACE" port-forward svc/mongo "$LOCAL_PORT:27017"
  status=$?
  # 130 is Ctrl-C reaching kubectl directly; anything else is a drop worth
  # reconnecting through.
  [ $status -eq 130 ] && break
  echo "port-forward exited ($status), reconnecting in 2s" >&2
  sleep 2
done
