#!/usr/bin/env bash
# Aplica 001–003 + 005 num Postgres VAZIO de teste, com o stub do Supabase, a semente fictícia
# e o teste de aceite da RLS. Também confere que tudo é idempotente (roda 2 vezes).
# Uso: PGHOST=... PGUSER=postgres PGDATABASE=teste bash db/tests/rodar.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
log=$(mktemp)
p() {
  if ! psql -v ON_ERROR_STOP=1 -q "$@" >"$log" 2>&1; then
    cat "$log"; echo "FALHOU: psql $*" >&2; exit 1
  fi
}

p -f db/tests/00_supabase_stub.sql
for rodada in 1 2; do
  for f in db/001_schema.sql db/002_rls.sql db/003_views.sql db/005_app.sql; do
    p -f "$f"; echo "rodada $rodada: $f ok"
  done
done
p -c "insert into auth.users (email) select e || '@teste.local' from unnest(array['admin','medico','medico2','comercial','recepcao','financeiro','semperfil']) e on conflict do nothing"
p -f db/tests/seed_ficticio.sql
p -f db/tests/aceite_rls.sql
grep -q 'ACEITE DA RLS: TODOS OS TESTES PASSARAM' "$log" || { cat "$log"; exit 1; }
echo 'ACEITE DA RLS: TODOS OS TESTES PASSARAM'
