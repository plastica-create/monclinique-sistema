# Mon Clinique — Setup Supabase + Git + Vercel (passo a passo)

Para: consultor e cliente. Tudo aqui é feito **manualmente nas contas do cliente**; os arquivos SQL estão em `sistema/db/`.
Dados: saúde, CPF/RG, prontuário e financeiro por paciente (**LGPD art. 11 — dado pessoal sensível**). Em dúvida, escolha a opção mais restritiva.

Ordem resumida: **Supabase (projeto → 001/002/003 → 004 carga → usuários) → Git privado → Vercel → domínio → teste de aceite → checklist LGPD.**

> Nomes de menus mudam com o tempo; os valores e as ideias valem, confira o texto na tela.

---

## 0. O que muda em relação ao Cowork

Antes, quem abria o painel via tudo (secretária incluída). Agora cada pessoa tem **login próprio** e o **banco** decide o que ela lê (RLS), não o front:

| Papel | Vê | Não vê |
|---|---|---|
| `admin` (Luciana, Dr. Fabrício) | tudo, inclusive auditoria | — |
| `medico` | pacientes, agenda, prontuário e orçamentos **dele** | financeiro, leads |
| `comercial` | cadastro, agenda, orçamentos, leads | prontuário, financeiro, CPF/RG |
| `recepcao` | cadastro, agenda | prontuário, financeiro, orçamentos, CPF/RG |
| `financeiro` | cadastro, lançamentos, orçamentos (leitura), CPF (nota fiscal) | prontuário, agenda |

Matriz completa e modelo de ameaça: cabeçalho de `db/002_rls.sql`.

---

## 1. Supabase

### 1.1 Criar o projeto
1. Conta do **cliente** (e-mail institucional, **2FA ligado**). Organização: `Mon Clinique`.
2. New project → nome `monclinique-prod` → **Region: South America (São Paulo)** → senha do banco **gerada e guardada em gerenciador de senhas** (nunca em chat/e-mail).
3. Plano: **Pro** (backups diários e sem pausa por inatividade; Free pausa projeto parado e não serve para dado de paciente). PITR (restauração por ponto no tempo) é um add-on pago: recomendado. Confira preços vigentes.
4. Recomendado: segundo projeto `monclinique-staging` com **dados fictícios** para testes e previews do Vercel. **Nunca** copie dado real para staging.

### 1.2 Autenticação (Authentication)
- **Sign In / Providers → desligar "Allow new users to sign up"** (usuários só são criados por um admin).
- E-mail/senha ligado; **Confirm email** ligado; senha mínima 12 caracteres; ligar proteção contra senhas vazadas (Pro).
- **MFA (TOTP) ligado.** Cada admin/médico cadastra o 2º fator no 1º acesso (o front precisa de tela de cadastro/desafio: `supabase.auth.mfa.enroll/challenge/verify`).
- URL Configuration: `Site URL` = domínio final; `Redirect URLs` só os domínios do projeto (sem `*` aberto).
- SMTP próprio (o e-mail padrão tem limite baixo).
- Duração de sessão curta (JWT expiry 3600 s; "Time-box user sessions" e "Inactivity timeout" se o plano permitir).

### 1.3 Rede e API
- Settings → **Data API → Exposed schemas: só `public`** (o schema `staging` da carga nunca é exposto).
- Database → **SSL enforcement ligado**. Se possível, **Network restrictions** só para o IP do consultor durante a carga.
- Chaves (Settings → API Keys): `anon`/`publishable` pode ir no front (RLS protege); **`service_role`/`secret` NUNCA no front, nunca em variável `NEXT_PUBLIC_*`, nunca no Git.**

### 1.4 Aplicar o banco (nesta ordem)
SQL Editor (cole o arquivo inteiro) **ou** `psql`:
1. `db/001_schema.sql` — tabelas, enums, índices, triggers.
2. `db/002_rls.sql` — RLS, papéis, auditoria, bucket `anexos`. Termina com `OK: RLS ligada em todas...`; se falhar, **pare**.
3. `db/003_views.sql` — views do dashboard (sem dado pessoal).
4. **Só depois**: `db/004_carga.sql` (seção 1.6).

Todos são idempotentes. **Se rodar o 002 de novo, rode o 003 de novo** (o 002 zera os grants das views). Mudanças futuras = novos arquivos `005_...sql`, versionados.

### 1.5 Bucket de arquivos
O 002 já cria o bucket **privado** `anexos` (50 MB por arquivo; PDF, imagem, áudio, vídeo, Word). Confirme em Storage: ícone de cadeado, **Public bucket = desligado**.
Convenção de caminho (obrigatória, a policy depende dela): `{paciente_id}/{clinico|administrativo|financeiro}/{uuid}-{nome}`. Acesso por **URL assinada de curta duração** (≤ 60 s), gerada no servidor ou via policies; jamais URL pública.

### 1.6 Carga dos dados do Gestão DS (uma vez)
Pré: 001–003 aplicados; CSVs de `out/clean/` no computador seguro do consultor.
```
cd "C:\...\sistema"
$env:PGPASSWORD = "<senha>"      # não deixar no histórico
psql "host=<pooler-do-painel> port=5432 dbname=postgres user=postgres.<ref> sslmode=require" -f db/004_carga.sql
```
(Painel → **Connect → Session pooler**. Direto `db.<ref>.supabase.co` só funciona com IPv6.) Alternativa sem psql: Modo 2 no cabeçalho do 004 (importar CSV pela Table Editor).
- A carga é **uma transação**: termina com a tabela de **conferência** (67 itens, todos `OK`) ou **desfaz tudo**. Números esperados: pacientes 2.191 · agendamentos 3.483 · atendimentos 8.920 · orçamentos 965 · lançamentos 2.892 · catálogo 440 · anexos 8.529; receita R$ 8.048.916,90 bruta / R$ 7.948.389,07 líquida; despesa R$ 4.182.390,14.
- No fim ela **apaga o schema `staging`** (cópia dos dados pessoais).
- **Depois:** apague os CSVs de `out/clean/` e o `Backup-GestaoDS-*` do computador (ou guarde criptografado, com prazo definido pelo DPO). Não envie por e-mail/WhatsApp.
- Arquivos legados (PDFs etc.): só os **metadados** foram migrados (a URL do S3 foi descartada). `anexos.arquivo_disponivel = false` até alguém subir o arquivo ao bucket e preencher `storage_path`. **Exporte os arquivos do Gestão DS antes de encerrar a assinatura.**
- `atendimentos.legado_cod_repetido = true` (238 linhas) = código do Gestão DS repetido em atendimentos **distintos**; não é duplicata, não apagar.

### 1.7 Usuários e perfis
1. Authentication → Users → **Add user → Create new user** (e-mail do funcionário, senha temporária forte, *Auto Confirm*). Um usuário por pessoa; **sem logins compartilhados**.
2. No SQL Editor, atribua o papel (sem perfil = sem acesso a nada):
```sql
insert into public.perfis (id, papel, nome)
select id, 'admin', 'Luciana'   from auth.users where email = 'luciana@dominio.com.br';  -- admin | medico | comercial | recepcao | financeiro
insert into public.perfis (id, papel, nome)
select id, 'admin', 'Dr. Fabrício' from auth.users where email = 'fabricio@dominio.com.br';
-- liga o login do Dr. Fabrício ao registro de médico criado pela carga e completa o CRM:
update public.medicos
   set usuario_id = (select id from auth.users where email = 'fabricio@dominio.com.br'), crm = '<CRM>', uf_crm = 'MT'
 where cod_legado_gestaods = '13402';
```
3. Desligar um funcionário: `update public.perfis set ativo = false where id = ...` (e remover o usuário depois). Nunca apagar o histórico dele (auditoria mantém o `usuario_id`).
4. **MFA obrigatório no banco:** depois que **todos** os admin/médicos tiverem cadastrado o 2º fator:
```sql
update public.config_seguranca set exigir_mfa_admin_medico = true;   -- sessão sem MFA (aal1) passa a não ter acesso
```
Teste com 1 usuário antes; se travar, desfaça pelo SQL Editor (`= false`).

### 1.8 Regras para o front (importante)
- **Prontuário:** o texto clínico (`atendimentos.texto`, `texto_html`) **não pode ser lido por `select`**. Use os RPC, que gravam a leitura em `auditoria`: `rpc('ler_prontuario', {p_paciente_id, p_limite, p_offset, p_finalidade})` e `rpc('ler_atendimento', {p_atendimento_id, p_finalidade})`. Em `atendimentos` **nunca use `select('*')`**: liste as colunas de metadado. Gravar/editar texto é por `insert/update` normal (use `.select('id')`, não `*`, no retorno).
- CPF/RG: tabela `pacientes_documentos` (só admin, financeiro e o médico do paciente leem; recepção/comercial apenas gravam).
- Exportações de lista com dado pessoal: chame `rpc('registrar_exportacao', {p_tabela, p_qtd, p_finalidade})`.
- Dashboard: consumir **apenas** as `vw_*` (agregados). Para reproduzir os números do backup: `set app.hoje = '2026-10-05'`.
- Não registrar informação clínica em `pacientes.observacao` nem `agendamentos.observacao` (a recepção lê esses campos).

---

## 2. Teste de aceite da segurança (antes de liberar)

No SQL Editor, rode **tudo junto** (um bloco por papel; troque o UUID pelo do usuário em `auth.users`):
```sql
set role authenticated;  set request.jwt.claim.sub = '<uuid-do-usuario>';
select public.papel_atual();
select count(*) from public.lancamentos;            -- recepcao/comercial/medico => 0
select count(*) from public.pacientes_documentos;   -- recepcao/comercial => 0
select count(*) from public.atendimentos;           -- recepcao/comercial/financeiro => 0
select texto from public.atendimentos limit 1;      -- TODOS => "permission denied" (texto só via RPC)
reset role;
```
Esperado: ver a matriz da seção 0. Depois, no site publicado, confirme com `anon`: `curl "https://<ref>.supabase.co/rest/v1/pacientes" -H "apikey: <anon>"` deve falhar com *permission denied* (nunca retornar dados).
Rode também o **Security Advisor** do Supabase (Database → Advisors): zero erros de "RLS disabled" ou "security definer view".

---

## 3. Variáveis de ambiente

`.env.example` (versionado, **sem valores**); o `.env.local` real fica fora do Git:
```
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon ou publishable key>       # pode ir ao navegador
SUPABASE_SERVICE_ROLE_KEY=<secret/service_role>               # SÓ servidor (rotas/cron); nunca NEXT_PUBLIC_
# opcional, só para scripts de backup/migração (nunca no Vercel):
# DATABASE_URL=postgresql://postgres.<ref>:<senha>@<pooler>:5432/postgres
```
Regras: `service_role` ignora RLS — só em código de servidor, com checagem de papel própria; **trocar (rotate) a chave** se aparecer em log, print ou commit.

---

## 4. Git (repositório PRIVADO)

1. Conta do cliente (GitHub/GitLab/Bitbucket), **2FA obrigatório** para todos. Repositório `monclinique-sistema` → **Private**. Nada de fork público.
2. Copiar `sistema/.gitignore` para a raiz do repositório **antes do primeiro commit**. Ele bloqueia `Backup*`, `out/clean/`, `*.csv/xlsx`, PDFs/áudios, `.env*`, zips, dumps e `node_modules`; mantém `out/dados.json`, `out/dados.js` e `out/qualidade.md` (só agregados).
3. Conferir antes do 1º push: `git status` e `git ls-files | findstr /i ".csv .env .zip .xlsx"` → **vazio**.
4. Proteger `main`: PR obrigatório, 1 revisão, checks verdes. Ligar *secret scanning* e *push protection*.
5. Se um CSV/segredo for commitado por engano: tratar como **incidente** (seção 6.7), reescrever histórico e trocar chaves; remover o arquivo no commit seguinte **não basta**.
6. O SQL de migração é código: fica no Git. **Dado de paciente não é.**

---

## 5. Vercel

1. Conta/Team do cliente, plano **Pro** (o Hobby é restrito a uso pessoal/não comercial). 2FA ligado.
2. Add New → Project → importar o repositório privado → framework (ex.: Next.js).
3. **Environment Variables** (Settings): cadastrar as 3 variáveis acima separadas por ambiente:
   - *Production* → projeto Supabase de produção.
   - *Preview/Development* → projeto **staging** (dados fictícios). **Preview nunca aponta para produção.**
   - `SUPABASE_SERVICE_ROLE_KEY` marcada como **Sensitive** e apenas em Production.
4. **Functions Region: `gru1` (São Paulo)** — fica junto do banco (`vercel.json`: `{"regions": ["gru1"]}`).
5. **Deployment Protection:** *Standard Protection* (previews exigem login Vercel) ou *Vercel Authentication* para todos os deployments; o acesso à produção em si é protegido pelo **login Supabase + RLS** (não confie só em "URL secreta"). Desligar *Preview comments/Analytics de terceiros* que enviem dado do paciente.
6. Cabeçalhos de segurança (`vercel.json`):
```json
{ "headers": [{ "source": "/(.*)", "headers": [
  { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains; preload" },
  { "key": "X-Content-Type-Options", "value": "nosniff" },
  { "key": "X-Frame-Options", "value": "DENY" },
  { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
  { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" },
  { "key": "X-Robots-Tag", "value": "noindex, nofollow" } ] }] }
```
Adicione `Content-Security-Policy` conforme as origens usadas (Supabase, fontes).
7. **Domínio:** Settings → Domains → adicionar `app.<dominio>` (ou `sistema.<dominio>`). No DNS do cliente criar o registro que o Vercel mostrar (subdomínio: `CNAME` para o alvo indicado, tipicamente `cname.vercel-dns.com`; apex: `A` indicado). HTTPS é automático. Atualizar `Site URL`/`Redirect URLs` no Supabase para o domínio final.
8. Logs: não gravar nome/CPF/prontuário em `console.log`; logs do Vercel e do Supabase têm retenção curta e não substituem a tabela `auditoria`.

---

## 6. Checklist de segurança e LGPD

### 6.1 Antes de entrar dado real
- [ ] Supabase em **São Paulo**, plano Pro, 2FA nas contas Supabase/Vercel/Git, cadastro de novos usuários desligado.
- [ ] `002_rls.sql` aplicado (mensagem `OK`) e **teste de aceite (seção 2) feito com um usuário de cada papel**.
- [ ] Nenhuma chave `service_role` no front, no Git ou em variável `NEXT_PUBLIC_*`.
- [ ] Bucket `anexos` privado; arquivos só por URL assinada curta.
- [ ] Previews do Vercel e testes **sem dado real** (projeto staging).
- [ ] Repositório privado, `.gitignore` copiado, sem CSV/`.env` versionados.

### 6.2 Base legal (validar com jurídico/DPO)
- **Atendimento e prontuário:** LGPD art. 11, II, "f" (tutela da saúde em procedimento por profissional/serviço de saúde) e art. 11, II, "a" (obrigação legal/regulatória: guarda de prontuário).
- **Financeiro/fiscal:** art. 7º, II e V (obrigação legal; execução de contrato).
- **Consentimento específico e destacado (art. 11, I) — registrar em `consentimentos`:** uso de imagem (fotos antes/depois, redes sociais), **gravação de áudio/IA (Plaud)**, comunicação de marketing/WhatsApp, compartilhamento com terceiros.
- **Atenção:** art. 11, §4º veda comunicar/compartilhar dado de saúde para vantagem econômica (exceto prestação de serviço de saúde). **Não enviar dado clínico ao Black CRM** nem usar prontuário para marketing; `leads` guarda só contato e interesse.

### 6.3 RIPD / DPIA resumido (arquivar assinado)
| Item | Conteúdo |
|---|---|
| Controlador / Encarregado | Clínica (Dr. Fabrício); **nomear encarregado (DPO)** e publicar canal de contato. |
| Dados | Identificação, CPF/RG, contato, saúde (prontuário, imagens, áudio), orçamento e financeiro. |
| Titulares | Pacientes (~2,2 mil), leads, funcionários (logins). |
| Operadores | Supabase (banco/arquivos), Vercel (hospedagem), Black CRM, Plaud, contabilidade/Conta Azul: **contrato/DPA assinado com cada um**. Há **transferência internacional** (art. 33): documentar cláusulas/garantias. |
| Riscos principais | Vazamento por credencial; acesso excessivo interno; chave `service_role`; arquivo/CSV em e-mail ou nuvem pessoal; perda de dados; uso de dado clínico para marketing. |
| Mitigação | RLS por papel, MFA, auditoria append-only, bucket privado, backups, treinamento, política de mesa limpa, revisão trimestral de acessos. |
| Direitos (art. 18) | Procedimento: pedido → identidade → resposta ≤ 15 dias (admin extrai dados; prontuário **não** se elimina dentro do prazo legal — anonimizar só o que for permitido). |

### 6.4 Retenção
- **Prontuário: guardar no mínimo 20 anos a partir do último registro** (Lei 13.787/2018, art. 6º). O sistema impede exclusão: sem `DELETE` em `atendimentos` e FKs `RESTRICT`.
- Documentos médicos eletrônicos (receitas, atestados, laudos): seguir a **Resolução CFM 2.299/2021** (assinatura digital qualificada) e, para o prontuário eletrônico em si, a **CFM 1.821/2007**. Validar com o jurídico antes de eliminar qualquer registro.
- Financeiro/fiscal: no mínimo o prazo legal tributário (em geral 5 anos; confirmar com a contabilidade). Leads sem relacionamento: definir prazo (sugestão: 24 meses) e eliminar.
- Backups e CSVs de migração: definir e cumprir prazo de descarte (sugestão: CSVs apagados após conferência da carga).

### 6.5 Backup e continuidade
- Supabase: backups diários (Pro) + **PITR** recomendado. **Os backups do banco não incluem os arquivos do Storage** → copiar o bucket periodicamente.
- Cópia independente **semanal e criptografada** (`pg_dump` via pooler + `age`/`gpg`), em local diferente do Supabase/Vercel, acesso restrito. **Teste de restauração trimestral** documentado.
- Nunca guardar dump em Git, e-mail ou pasta sincronizada pessoal.

### 6.6 Acessos, MFA e logs
- MFA: admin e médico **obrigatório** (`config_seguranca`); recomendado para todos.
- Revisão trimestral: `select p.nome, p.papel, p.ativo from public.perfis p;` e usuários inativos removidos.
- Auditoria (`select * from public.auditoria order by id desc` — só admin): quem leu prontuário, quem alterou/apagou dado sensível; ela é **append-only** (trigger + sem privilégio). Retenção: **a mesma do prontuário** (nunca apagar). Tentativas de acesso **negadas** não são registradas no banco (ver logs do Supabase).
- Cada pessoa com login próprio; senha nunca compartilhada; desligamento no mesmo dia.

### 6.7 Resposta a incidente
Suspeita de vazamento → (1) trocar chaves e senhas, desativar usuários afetados (`perfis.ativo = false`); (2) preservar logs/auditoria; (3) acionar DPO; (4) avaliar risco e **comunicar ANPD e titulares** em prazo curto (a regulamentação atual prevê 3 dias úteis — confirmar a norma vigente com o jurídico); (5) registrar o incidente.

### 6.8 Gravação Plaud / IA
- Só gravar com **consentimento específico registrado** (`tipo = 'gravacao_audio'`, `versao_termo`, canal e termo assinado em `anexos`). Recusa também é registrada (`aceito = false`).
- Áudio e transcrição = dado de saúde: bucket `anexos`, classe `clinico`. Definir se o áudio bruto é descartado após a transcrição ser validada e incorporada ao prontuário.
- O serviço do dispositivo/IA é **operador**: DPA + avaliação de transferência internacional.

---

## 7. Decisões que o cliente precisa confirmar
1. **Recepção/comercial não veem CPF/RG** (só gravam). Trocar? — 1 linha na policy `pacientes_documentos_select`.
2. **Financeiro lê CPF** (nota fiscal). Manter?
3. **Admin (Luciana) lê prontuário** (sempre auditado). Manter ou restringir a médicos?
4. Dr. Fabrício = papel `admin` **e** vinculado em `medicos` (um único login).
5. Anexos legados entram como classe `clinico` (mais restrita) até alguém reclassificar.
6. Origens "Não informado" (69%) ficam `NULL`; as views mostram "Não informado".
