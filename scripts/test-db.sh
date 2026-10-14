#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
container="campus-security-${RANDOM}-$$"
trap 'docker rm -fv "$container" >/dev/null 2>&1 || true' EXIT
docker run --name "$container" -e POSTGRES_HOST_AUTH_METHOD=trust -d postgres:17-alpine >/dev/null
for attempt in $(seq 1 30); do
  if docker exec "$container" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec -i "$container" psql -h 127.0.0.1 -U postgres -v ON_ERROR_STOP=1 < supabase/tests/bootstrap.sql >/dev/null
for migration in supabase/migrations/*.sql; do
  docker exec -i "$container" psql -h 127.0.0.1 -U postgres -v ON_ERROR_STOP=1 < "$migration" >/dev/null
done
docker exec -i "$container" psql -h 127.0.0.1 -U postgres -v ON_ERROR_STOP=1 < supabase/tests/isolation.sql
