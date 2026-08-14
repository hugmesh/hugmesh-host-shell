#!/usr/bin/env bash
set -euo pipefail

CONTAINER=hugmesh-e2e-nginx
PORT=8081
IMAGE=hugmesh.net:e2e-test

cleanup() {
  docker stop "$CONTAINER" 2>/dev/null || true
  docker rm   "$CONTAINER" 2>/dev/null || true
}
trap cleanup EXIT

echo "Building Docker image..."
docker build -t "$IMAGE" .

echo "Starting nginx container on port $PORT..."
docker run -d --name "$CONTAINER" -p "${PORT}:8080" "$IMAGE"

echo "Waiting for nginx to be ready..."
for i in $(seq 1 30); do
  curl -sf "http://localhost:${PORT}/" && break || sleep 1
done

echo "Running e2e tests against nginx..."
./node_modules/.bin/nightwatch --env nginx --config ./nightwatch.conf.js
