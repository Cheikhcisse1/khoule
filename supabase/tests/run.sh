#!/bin/sh
# Lance les migrations + seed + tests RLS dans un PostgreSQL jetable (Docker requis).
# Usage : sh supabase/tests/run.sh   (depuis la racine du projet)
set -e
docker rm -f khoule-pg-test >/dev/null 2>&1 || true
docker run -d --name khoule-pg-test -e POSTGRES_PASSWORD=test -v "$(pwd)/supabase:/sb:ro" postgres:15-alpine >/dev/null
until docker exec khoule-pg-test pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done
sleep 2
run() { docker exec khoule-pg-test psql -U postgres -v ON_ERROR_STOP=1 -q -t -f "$1" 2>&1 | grep -E 'NOTICE|ERROR|ÉCHEC|===|assert' || true; }
run /sb/tests/00_supabase_stub.sql
for f in supabase/migrations/*.sql; do echo "-> $f"; run "/sb/${f#supabase/}"; done
run /sb/seed.sql
run /sb/tests/rls_test.sql
docker rm -f khoule-pg-test >/dev/null
