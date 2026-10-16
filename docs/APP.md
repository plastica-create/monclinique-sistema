# Aplicativo web (app/): arquitetura, decisões e limitações

Next.js 16 (App Router) + React 19 + TypeScript estrito + `@supabase/ssr`. CSS próprio, gráficos em SVG feitos à mão, sem biblioteca de UI e sem fonte baixada de terceiros. Como rodar e publicar: `app/README.md`.

## Princípios

1. **A segurança é do banco.** O app só esconde menu e valida formulário. Toda leitura e escrita usa o cliente Supabase do usuário logado (chave anon + JWT dele), e a RLS de `db/002_rls.sql` decide. Não existe `service_role` no app.
2. **Tudo no servidor.** Não há cliente Supabase no navegador. Os cookies de sessão são `httpOnly` e o JavaScript da página nunca vê o token. Páginas (Server Components) e Server Actions falam com o banco.
3. **Sem dado pessoal em URL, log ou query string.** A busca de paciente é Server Action (POST). Filtros em URL só levam categorias e datas. Erros do banco viram mensagem genérica em português e o log leva só o código (`src/lib/erros.ts`).
4. **Texto clínico só por RPC auditada.** O app nunca lê `atendimentos.texto` por SELECT: o prontuário vem de `ler_prontuario`, que grava a leitura na auditoria. Links para telas sensíveis usam `prefetch={false}` para não gerar leitura espúria.
5. **Painel só com agregados.** O Início lê apenas as views `vw_*` (`src/lib/data/painel.ts`).

## Pastas

```
app/
  src/proxy.ts               (o antigo middleware) CSP com nonce, renova a sessão, protege rotas
  src/app/(auth)/            login, recuperar e redefinir senha, /mfa
  src/app/(app)/             módulos por papel: inicio, pacientes, agenda, orcamentos, financeiro
                             (mês, vencidos, conciliação), prontuario, leads, admin (equipe,
                             médicos, auditoria), seguranca (MFA do próprio usuário)
  src/app/auth/callback      troca do código PKCE do e-mail de recuperação
  src/actions/               Server Actions: auth, pacientes, agenda, orcamentos, financeiro,
                             prontuario (evolução, anexos, consentimentos), leads, admin
  src/lib/sessao.ts          estado da sessão (login, MFA, perfil, papel) e exigirSessao()
  src/lib/roles.ts           papéis, menu e capacidades (espelha a matriz da RLS)
  src/lib/schemas.ts         validação zod de todos os formulários
  src/lib/data/              consultas por módulo (uma função por operação)
  src/lib/*.test.ts          testes unitários (Vitest)
  src/components/            formulários (useActionState), tabelas, gráficos SVG
  e2e/                       testes de navegador (Playwright) contra um Supabase de teste
db/005_app.sql               funções e tabela que o app usa (aplicar depois de 001–003)
db/tests/                    stub do Supabase, semente fictícia e teste de aceite da RLS
```

## Decisões que valem registrar

- **Next 16:** `proxy.ts` no lugar de `middleware.ts`; `params`, `searchParams` e `cookies()` assíncronos; `typedRoutes` ligado; o layout raiz chama `connection()` para que tudo seja dinâmico e o nonce do CSP mude a cada requisição.
- **MFA:** `sessao.ts` distingue sem login, "precisa validar o 2º fator" (sessão aal1 com fator TOTP verificado), "bloqueado pelo banco por falta de MFA" (perfil ativo mas `papel_atual()` nulo, então cadastrar o fator em `/mfa`), "sem perfil" e normal. O nível vem do claim `aal` do JWT. O admin só liga a exigência de MFA para alguém estando ele mesmo em aal2.
- **CPF/RG:** ficam em `pacientes_documentos` e aparecem mascarados. "Revelar" chama `revelar_documento` (005), que grava a leitura na auditoria **antes** de devolver o valor; o valor some da tela em 30 s e nunca vai no HTML inicial. Recepção e comercial só gravam.
- **Cadastro de paciente:** origem obrigatória (lista `ORIGENS`), aviso de possível duplicado por `possiveis_duplicados` (nome + nascimento ou celular) com confirmação explícita. Busca por `buscar_pacientes` (nome sem acento ou dígitos do telefone), que respeita a RLS de quem busca.
- **Agenda:** aviso de conflito de horário do mesmo médico; baixa exige desfecho (compareceu, faltou, cancelou + motivo); agendamento futuro só pode ser confirmado ou cancelado.
- **Orçamentos:** perda exige motivo; "registrar contato" acrescenta linha datada na observação; itens recalculam bruto e líquido (duas escritas, não atômicas).
- **Financeiro:** lançamentos, baixa de pagamento, vencidos com mensagem de cobrança copiável (a cópia é registrada com `registrar_exportacao`) e conciliação mensal contra contabilidade e Conta Azul (tabela `conciliacao_mensal`, em 005).
- **Anexos:** o servidor valida e devolve URL assinada de upload; o navegador envia direto ao Storage (evita o limite de corpo da Vercel) e o servidor registra os metadados. Abertura por URL assinada de 60 s; anexo clínico entra na auditoria antes de abrir.
- **Leads:** CSV colado ou lido no navegador; "Pré-visualizar" não grava; o ID externo faz upsert. Sem integração automática com o Black CRM.
- **Segurança HTTP:** CSP com nonce (`script-src 'self' 'nonce-…' 'strict-dynamic'`), HSTS, `X-Frame-Options: DENY` e `frame-ancestors 'none'`, Referrer-Policy, Permissions-Policy, `nosniff`, `noindex`, COOP e `Cache-Control: private, no-store` nas páginas.
- **Rate limit de login:** em memória, por instância (5 falhas em 15 min por IP + e-mail). Em serverless é parcial; a defesa principal é a do Supabase Auth.

## Como foi verificado

- `db/tests/rodar.sh` aplica 001–003 e 005 duas vezes (idempotência) num Postgres 16 com um stub do Supabase, carrega dados **fictícios** e roda 48 checagens da RLS por papel, incluindo usuário sem perfil e MFA aal1 x aal2. Roda no CI a cada PR.
- Os 17 testes `e2e/` rodaram contra um Supabase local (Postgres 16 + GoTrue + PostgREST reais) com um usuário de cada papel: cabeçalhos de segurança, login, menus por papel, cadastro e busca de paciente, agenda e baixa, CPF revelado com auditoria, limites do médico, orçamento, financeiro e conciliação, importação de leads, cadastro e desafio de MFA.
- CI: tipos (`tsc` com rotas tipadas), lint, testes unitários e build.

## Limitações e pendências

- **Storage não foi testado** (envio e abertura de anexos): o ambiente local não tinha o serviço de Storage. Testar no staging antes de usar.
- **Recuperação de senha por e-mail não foi testada:** depende do SMTP e das Redirect URLs configuradas no Supabase.
- O app não cria usuários nem mostra e-mails (`auth.users` não é exposta): criar no painel do Supabase e depois definir o perfil em Admin › Equipe.
- Prontuário: editor de texto simples com salvamento manual; ao editar, o `texto_html` legado vira `null` (a versão anterior fica na auditoria). HTML legado é exibido convertido para texto.
- Auditoria na tela mostra quem, quando e o quê, sem o conteúdo antes e depois (pode ter dado pessoal).
- Acessibilidade verificada por inspeção (rótulos, foco, tabelas ocultas nos gráficos), não com leitor de tela.
