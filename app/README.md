# Mon Clinique — aplicativo web

Next.js 16 + Supabase. Arquitetura e decisões: `../docs/APP.md`. Passo a passo das contas: `../docs/SETUP-VERCEL-SUPABASE-GIT.md` (este arquivo segue a mesma ordem).

## Rodar na sua máquina (contra o Supabase de **staging**)

Requisitos: Node 22 (mínimo 20.9).

```bash
cd app
cp .env.example .env.local     # preencha com a URL e a chave anon do projeto de staging
npm ci
npm run dev                    # http://localhost:3000
```

Só existem duas variáveis, e ambas são públicas por natureza (a RLS protege os dados):

| Variável | Valor |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | chave `anon` ou `publishable` |

O app **não usa** `service_role`. Não cadastre essa chave na Vercel.

## Verificações

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

O CI (`.github/workflows/ci.yml`) roda isso e também `db/tests/rodar.sh` (SQL + aceite da RLS num Postgres de teste) em todo pull request.

Testes de navegador (`e2e/`): precisam de um Supabase de teste com a semente fictícia `db/tests/seed_ficticio.sql` e os usuários `admin`, `medico`, `medico2`, `comercial`, `recepcao`, `financeiro` e `semperfil` `@teste.local`, todos com a senha definida em `e2e/ajuda.ts`. Com o app rodando em `:3000`: `npm run test:e2e`. **Nunca** rode contra produção.

## Publicar (ordem do tutorial)

1. **Supabase staging e produção** (região São Paulo, Pro, cadastro público desligado, MFA TOTP ligado, só `public` exposto). Tutorial §1.1 a §1.3.
2. **Banco**, no SQL Editor, nesta ordem: `db/001_schema.sql` → `002_rls.sql` → `003_views.sql` → **`005_app.sql`** (funções do app e conciliação). Se rodar o 002 de novo, rode 003 e 005 de novo.
3. **Staging:** rode `db/tests/seed_ficticio.sql` (dados fictícios). **Produção:** `db/004_carga.sql` com os CSVs limpos, na máquina segura (tutorial §1.6). Nunca o contrário.
4. **Usuários:** crie no painel (Authentication → Users) e defina o papel com o `insert into public.perfis` do tutorial §1.7. Depois disso o admin ajusta papéis em Admin › Equipe e vincula médicos em Admin › Médicos.
5. **Teste de aceite** (tutorial §2) e Security Advisor sem erros.
6. **Vercel:** importar o repositório, *Root Directory* = `app`, região `gru1` (já em `vercel.json`). Variáveis por ambiente: *Production* → projeto de produção; *Preview* e *Development* → staging.
7. **Domínio** e, no Supabase, `Site URL` e `Redirect URLs` com o domínio final mais `/auth/callback`. Configure o SMTP próprio (recuperação de senha).
8. **MFA obrigatório:** cada admin e médico cadastra o 2º fator em Segurança; depois o admin liga a exigência (Admin › Equipe, ou `update public.config_seguranca set exigir_mfa_admin_medico = true`).
9. **Antes de usar com pacientes:** testar no staging o envio e a abertura de anexos (Storage) e a recuperação de senha por e-mail. Esses dois fluxos não foram testados localmente.

Os cabeçalhos de segurança (CSP com nonce, HSTS etc.) vêm de `next.config.ts` e `src/proxy.ts`; não precisa repetir na Vercel.
