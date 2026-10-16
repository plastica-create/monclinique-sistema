# Aplicativo web (sistema/app) — arquitetura, decisões e limitações

Next.js 15 (App Router) + TypeScript + `@supabase/ssr`. CSS próprio. Gráficos em SVG/HTML feitos à mão. Instruções de uso: `sistema/app/README.md`.

## Princípios

1. **A segurança é do banco.** O front só esconde menu e valida formulário. Toda leitura/escrita usa o cliente Supabase **do usuário logado** (chave anon + JWT): a RLS de `002_rls.sql` decide. Não existe `service_role` no app.
2. **Tudo no servidor.** Não há cliente Supabase no navegador. Os cookies de sessão são `httpOnly`; o JavaScript da página nunca vê o token. Páginas e Server Actions falam com o banco.
3. **Sem dado pessoal em URL, log ou query string.** A busca de paciente é Server Action (POST). Filtros em URL só têm categorias (status, faixa, datas). Erros do banco viram mensagem genérica em português e o log só leva o código (`lib/erros.ts`).
4. **Texto clínico só por RPC auditada.** Em `atendimentos` o app nunca usa `select('*')`: lê colunas de metadado; o texto vem de `ler_atendimento` (grava auditoria). Abrir a lista do prontuário chama `registrar_leitura_prontuario`. Links de prontuário têm `prefetch={false}` para não gerar leitura espúria.

## Pastas

```
sistema/app
  src/middleware.ts          CSP com nonce, renova sessão, protege rotas
  src/app/(auth)/            login, recuperar/redefinir senha, /mfa
  src/app/(app)/             módulos (menu por papel): inicio, agenda, pacientes, orcamentos,
                             financeiro(+conciliacao), prontuario, leads, qualidade, admin, seguranca
  src/app/auth/callback      troca do código PKCE do e-mail de recuperação
  src/actions/               Server Actions (auth, pacientes, agenda, orcamentos, financeiro,
                             prontuario[anexos/consentimentos], leads, admin)
  src/lib/database.types.ts  tipos do banco (à mão; ver README para regenerar)
  src/lib/data/types.ts      interface Repo (toda a camada de acesso a dados)
  src/lib/data/supabase-repo.ts   implementação real (consultas tipadas, uma função por operação)
  src/lib/data/demo-repo.ts  implementação em memória (modo demo), simula a RLS por papel
  src/lib/demo/              semente 100% sintética
  src/lib/roles.ts           papéis, menu e capacidades (espelha a matriz da RLS)
  src/lib/schemas.ts         validação zod de todos os formulários
  src/lib/{text,datas,aging,busca,duplicados,csv,financeiro,consentimentos,kpis}.ts   regras puras (testadas)
  src/components/            UI (formulário com useActionState, gráficos SVG, tabelas)
  sql/005_sugerido.sql       SUGESTÃO de migração (não aplicada)
```

## Decisões que valem registrar

- **Duas implementações de `Repo`** (Supabase e demo) atrás da mesma interface: o modo demo exercita a mesma UI e as mesmas regras sem banco. O demo imita a RLS (financeiro não vê agenda, médico só os seus etc.), mas **a prova real da RLS é o teste de aceite no Supabase**.
- **Indicadores e gráficos do Início** vêm só das `vw_*` (agregados). Cada KPI/gráfico tem URL própria (`/inicio?kpi=<slug>`, `/inicio?grafico=<slug>`), botão “copiar link” e cartão clicável para a lista (`lib/kpis.ts` define slug, papéis, destino e explicação).
- **MFA:** `sessao.ts` reconhece quatro estados além do normal: sem login, “precisa validar o 2º fator” (aal1 com fator cadastrado), “bloqueado pelo banco por falta de MFA” (perfil ativo mas `papel_atual()` nulo → cadastrar o fator em `/mfa`) e “sem perfil”. Cadastro/verificação por `supabase.auth.mfa.enroll / challengeAndVerify / unenroll`.
- **CPF/RG:** mascarados (`•••.•••.•••-••`); “Revelar” é Server Action que grava a revelação em auditoria **antes** de devolver o valor (se a auditoria falhar, não mostra) e o valor some da tela em 30 s. O CPF nunca vai no HTML inicial. Recepção/comercial só gravam (RLS).
- **Origem obrigatória** no cadastro (lista controlada `ORIGENS`), com aviso de possível duplicado (nome + nascimento/celular) e confirmação explícita.
- **Agenda:** baixa exige desfecho (compareceu → `finalizado`, faltou → `faltou`, cancelou → `cancelado` + motivo); futuro só pode ser cancelado. Lista “sem baixa” com botões rápidos.
- **Orçamentos:** perda exige motivo (lista + detalhe se “Outro”). “Marcar contato” acrescenta uma linha datada em `orcamentos.observacao` (não há coluna de contato). Itens recalculam bruto/líquido (duas escritas, não atômicas).
- **Anexos:** o servidor valida e devolve URL **assinada de upload**; o navegador envia direto ao Storage (evita o limite de corpo da Vercel) e o servidor registra os metadados depois de conferir que o objeto existe. Abertura por URL assinada de 60 s; anexo `clinico` aberto por admin/médico entra na auditoria.
- **Importação de leads:** CSV colado ou lido no navegador; “Pré-visualizar” não grava; ID externo faz upsert; sem integração com o Black CRM.
- **Conciliação contábil:** precisa da tabela `conciliacao_mensal` (em `sql/005_sugerido.sql`). Sem ela a tela mostra aviso e só compara com o sistema.
- **Segurança HTTP:** CSP com nonce por requisição (`script-src 'self' 'nonce-…' 'strict-dynamic'`, sem `unsafe-inline` em scripts; `style-src` mantém `unsafe-inline` por causa dos atributos `style` do React/SVG), HSTS, `X-Frame-Options: DENY` e `frame-ancestors 'none'`, Referrer-Policy, Permissions-Policy, `nosniff`, `noindex`. Todas as páginas são dinâmicas (`force-dynamic`) para o nonce funcionar.
- **Fontes:** pilha `Inter, Poppins, system-ui…` **sem baixar fontes** (nenhuma requisição a terceiros). Se a clínica instalar as fontes no aparelho, elas aparecem; senão cai para a fonte do sistema.
- **Rate limit de login:** simples, em memória, por instância (5 falhas / 15 min por IP+e-mail). Em serverless é parcial; a defesa real é a do Supabase Auth.

## Limitações e pendências (honestas)

- **Nada foi testado contra um Supabase real** (nem RLS, nem MFA, nem Storage, nem as RPC). Foi verificado em modo demo, com `tsc`, lint, build e testes unitários. As consultas foram escritas a partir do SQL, mas só um teste de aceite com usuários reais confirma.
- Busca de paciente: o servidor baixa nome/telefone dos pacientes visíveis e filtra em Node (sem acento). Serve para ~2 mil cadastros; para crescer, aplicar `buscar_pacientes` (em `sql/005_sugerido.sql`) e trocar `buscarPacientes` no repo.
- “Revelar CPF/RG” é auditado por `registrar_exportacao` (ação `exportacao`, sem `paciente_id`; o id vai no texto da finalidade). A função própria está em `sql/005_sugerido.sql`.
- Usuários: o app lista perfis (nome/papel/ativo), mas **não mostra e-mail** (a tabela `auth.users` não é exposta) e **não cria usuários** (criar no painel do Supabase + inserir em `perfis`). Não sabe quem já cadastrou MFA (também fora da API).
- Agenda: sem checagem de conflito de horário; edição por formulário (sem arrastar e soltar); “excluir” agendamento não existe (cancelar é o caminho).
- Prontuário: editor de texto puro com salvamento manual/Ctrl+S (sem autosave); ao salvar, `texto_html` legado vai a `null` (a versão anterior fica na auditoria). Não renderiza HTML legado (converte para texto).
- Auditoria na tela: sem o conteúdo antes/depois, de propósito (pode ter dado pessoal).
- Financeiro: formas de pagamento/taxas são agregadas no servidor sobre os últimos 12 meses (até 10 mil linhas); “cobrança” = copiar mensagem (não envia WhatsApp nem registra a tentativa).
- Recuperação de senha depende do SMTP e das Redirect URLs configuradas no Supabase.
- Acessibilidade verificada por inspeção de DOM (rótulos, foco, tabelas com legenda, tabela oculta nos gráficos), não por leitor de tela.
- Sem testes automatizados de interface (E2E); a verificação de telas foi manual no navegador embutido.
