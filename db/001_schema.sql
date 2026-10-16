-- =====================================================================================
-- Mon Clinique - 001_schema.sql
-- Schema Postgres/Supabase (PostgreSQL 15+). Português, snake_case.
--
-- COMO APLICAR: Supabase > SQL Editor (cole o arquivo inteiro e rode) ou psql.
-- ORDEM: 001_schema -> 002_rls -> 003_views -> 004_carga.
-- É idempotente: pode ser rodado de novo sem apagar dados (IF NOT EXISTS / OR REPLACE).
-- Alterações futuras de colunas devem virar novos arquivos de migração (005_..., 006_...).
--
-- DADOS PESSOAIS SENSÍVEIS DE SAÚDE (LGPD art. 11): este arquivo só cria estrutura.
-- A proteção (RLS, papéis, auditoria) está em 002_rls.sql — NÃO coloque dados reais
-- no banco antes de aplicar o 002.
--
-- Convenções:
--   * PK uuid (gen_random_uuid) em tudo; o código legado do Gestão DS fica em colunas
--     cod_*_legado / cod_legado_gestaods, para rastreabilidade (não é PK).
--   * Datas/horas do Gestão DS eram "horário de parede" de Cuiabá (America/Cuiaba, UTC-4,
--     sem horário de verão atualmente). Agenda/atendimentos usam timestamptz.
--   * Valores em numeric(14,2), nunca float.
--   * Sem exclusão física de prontuário: FKs de dado clínico/financeiro são ON DELETE RESTRICT.
-- =====================================================================================

-- ------------------------------------------------------------------ 0. tipos enumerados
-- (bloco DO + duplicate_object = "CREATE TYPE IF NOT EXISTS")
do $$ begin create type public.papel_usuario as enum ('admin','medico','comercial','recepcao','financeiro');
exception when duplicate_object then null; end $$;

do $$ begin create type public.status_agendamento as enum
  ('nao_confirmado','confirmado','em_espera','em_atendimento','finalizado','cancelado','faltou');
exception when duplicate_object then null; end $$;

do $$ begin create type public.tipo_agendamento as enum
  ('consulta','retorno','procedimento','cirurgia','exame','bloqueio');
exception when duplicate_object then null; end $$;

do $$ begin create type public.status_orcamento as enum ('em_aberto','ganho','perda');
exception when duplicate_object then null; end $$;

do $$ begin create type public.temperatura_orcamento as enum ('quente','morno','frio');
exception when duplicate_object then null; end $$;

do $$ begin create type public.tipo_orcamento as enum ('cirurgico','procedimento','outros');
exception when duplicate_object then null; end $$;

do $$ begin create type public.tipo_lancamento as enum ('receita','despesa');
exception when duplicate_object then null; end $$;

do $$ begin create type public.classe_catalogo as enum ('cirurgia','procedimento','exame');
exception when duplicate_object then null; end $$;

do $$ begin create type public.tipo_consentimento as enum
  ('tratamento_dados_saude','uso_imagem','gravacao_audio','comunicacao_marketing','compartilhamento_terceiros','termo_cirurgico','outro');
exception when duplicate_object then null; end $$;

do $$ begin create type public.canal_consentimento as enum
  ('presencial_papel','assinatura_digital','whatsapp','site_app','telefone','outro');
exception when duplicate_object then null; end $$;

-- sensibilidade do anexo: define quem pode ver (ver 002_rls.sql). Padrão = clínico (mais restrito).
do $$ begin create type public.classe_anexo as enum ('clinico','administrativo','financeiro');
exception when duplicate_object then null; end $$;

do $$ begin create type public.status_lead as enum ('aberto','ganho','perdido');
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------------ 1. funções utilitárias
-- Normaliza texto para busca/vínculo por nome: sem acento, maiúsculo, espaços colapsados.
-- Equivale ao norm() do ETL (etl/build_dataset.py). Não depende da extensão unaccent.
create or replace function public.normaliza_texto(t text)
returns text language sql immutable parallel safe set search_path = ''
as $$
  select upper(regexp_replace(btrim(translate(coalesce(t, ''),
    'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
    'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN')), '\s+', ' ', 'g'))
$$;

create or replace function public.tg_set_updated_at()
returns trigger language plpgsql set search_path = ''
as $$ begin new.updated_at := now(); return new; end $$;

-- ------------------------------------------------------------------ 2. perfis e médicos
-- perfis: 1 linha por usuário do Supabase Auth, com o papel que define o acesso (RLS).
-- Usuário SEM linha em perfis (ou ativo = false) não enxerga nada.
create table if not exists public.perfis (
  id          uuid primary key references auth.users(id) on delete cascade,
  papel       public.papel_usuario not null,
  nome        text not null check (btrim(nome) <> ''),
  ativo       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.perfis is 'Papel do usuário logado (admin, medico, comercial, recepcao, financeiro). Base de todas as policies RLS.';

-- config_seguranca: linha única com chaves de segurança ajustáveis pelo admin.
create table if not exists public.config_seguranca (
  id                         boolean primary key default true check (id),
  exigir_mfa_admin_medico    boolean not null default false,
  updated_at                 timestamptz not null default now()
);
comment on table public.config_seguranca is 'Linha única. exigir_mfa_admin_medico = true => admin/médico só têm acesso com sessão MFA (aal2). Ligar depois de cadastrar o 2º fator de todos.';
insert into public.config_seguranca (id) values (true) on conflict do nothing;

create table if not exists public.medicos (
  id                    uuid primary key default gen_random_uuid(),
  usuario_id            uuid unique references auth.users(id) on delete set null,
  nome                  text not null check (btrim(nome) <> ''),
  crm                   text,
  uf_crm                text check (uf_crm ~ '^[A-Z]{2}$'),
  especialidade         text,
  cod_legado_gestaods   text unique,
  ativo                 boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
comment on table public.medicos is 'Médicos da clínica (multi-médico). usuario_id liga ao login (auth.users); pode ficar nulo até o médico ter acesso.';

-- ------------------------------------------------------------------ 3. pacientes
create table if not exists public.pacientes (
  id                          uuid primary key default gen_random_uuid(),
  cod_legado_gestaods         text unique,                 -- "Cod Paciente" do Gestão DS
  nome                        text not null check (btrim(nome) <> ''),
  data_nascimento             date check (data_nascimento between date '1900-01-01' and current_date),
  sexo                        text check (sexo in ('F','M','O')),
  estado_civil                text,
  ocupacao                    text,
  email                       text,
  telefone                    text,
  celular                     text,
  cep                         text,
  endereco                    text,
  numero                      text,
  complemento                 text,
  bairro                      text,
  cidade                      text,
  uf                          text check (uf ~ '^[A-Z]{2}$'),
  origem                      text,                        -- origem normalizada (ETL); NULL = não informado
  indicacao_original          text,                        -- texto livre original do campo "Indicação"
  convenio                    text,
  instagram                   text,
  medico_responsavel_id       uuid references public.medicos(id) on delete set null,
  data_cadastro               date,
  ultima_visita_gestaods      date,                        -- campo "Última Visita" do cadastro (vazio em 69%)
  ultima_visita_atendimento   date,                        -- derivada de atendimentos (trigger); base da recência
  tem_cpf                     boolean not null default false, -- espelho de pacientes_documentos (para quem não vê o CPF)
  observacao                  text,
  ativo                       boolean not null default true,
  arquivado_em                timestamptz,
  criado_por                  uuid default auth.uid(),
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);
comment on table  public.pacientes is 'Cadastro básico do paciente. CPF/RG ficam em pacientes_documentos (acesso mais restrito).';
comment on column public.pacientes.origem is 'Origem normalizada pelo ETL (Instagram, Google, Indicação de médico...). NULL = não informado (1507 de 2191 na carga).';
comment on column public.pacientes.ultima_visita_atendimento is 'Data do último atendimento no prontuário (>= 2022-10-01 na carga). Mantida por trigger em atendimentos.';

-- CPF/RG separados: permite negar CPF à recepção/comercial com RLS (que é por linha, não por coluna).
create table if not exists public.pacientes_documentos (
  paciente_id  uuid primary key references public.pacientes(id) on delete cascade,
  cpf          text check (cpf ~ '^\d{11}$'),             -- somente dígitos
  rg           text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table public.pacientes_documentos is 'CPF e RG do paciente. Leitura: admin, financeiro (nota fiscal) e médico do paciente. Recepção/comercial só inserem.';
comment on column public.pacientes_documentos.cpf is 'Somente dígitos (11). Não é UNIQUE: 14 CPFs aparecem em mais de um paciente no backup (15 cadastros excedentes; revisar duplicidade de cadastro).';

-- ------------------------------------------------------------------ 4. agenda
create table if not exists public.agendamentos (
  id                     uuid primary key default gen_random_uuid(),
  paciente_id            uuid references public.pacientes(id) on delete restrict,   -- NULL só em bloqueio de horário
  medico_id              uuid references public.medicos(id) on delete restrict,
  data_hora              timestamptz not null,
  fim                    timestamptz,
  tipo                   public.tipo_agendamento not null,
  procedimento           text,                                  -- campo "Tipos" do Gestão DS (texto livre)
  convenio               text,                                  -- 'Particular', 'Interno (clínica)', 'CORTESIA'...
  status                 public.status_agendamento not null default 'nao_confirmado',
  primeiro_atendimento   boolean not null default false,
  observacao             text,
  criado_por             uuid default auth.uid(),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  check (tipo = 'bloqueio' or paciente_id is not null),
  check (fim is null or fim >= data_hora)
);
comment on table public.agendamentos is 'Agenda. tipo = bloqueio é bloqueio de horário (sem paciente).';

-- ------------------------------------------------------------------ 5. prontuário
create table if not exists public.atendimentos (
  id                     uuid primary key default gen_random_uuid(),
  cod_atendimento_legado text,                                  -- NÃO único: 122 códigos repetidos no backup
  legado_cod_repetido    boolean not null default false,        -- true = código legado aparece em >1 linha (são atendimentos distintos)
  paciente_id            uuid not null references public.pacientes(id) on delete restrict,
  medico_id              uuid not null references public.medicos(id) on delete restrict,
  agendamento_id         uuid references public.agendamentos(id) on delete set null,
  inicio                 timestamptz not null,
  fim                    timestamptz,
  servico                text not null,                         -- Consulta, Cirurgia, Procedimento, Observação ..., Exame
  tipo_servico           text,                                  -- nome do procedimento/cirurgia realizado
  texto_html             text,                                  -- evolução com formatação (CLÍNICO — só via RPC auditada)
  texto                  text,                                  -- evolução em texto puro (CLÍNICO — só via RPC auditada)
  criado_por             uuid default auth.uid(),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  check (fim is null or fim >= inicio)
);
comment on table  public.atendimentos is 'Prontuário (evolução clínica). Texto clínico só é legível via RPC ler_prontuario/ler_atendimento (registra auditoria) — ver 002_rls.sql. Sem DELETE para ninguém.';
comment on column public.atendimentos.cod_atendimento_legado is 'Código do Gestão DS. Não é chave: 116 códigos aparecem em 2+ linhas com datas/textos diferentes (238 linhas).';

-- Evita carga duplicada acidental, sem exigir unicidade do código legado sozinho.
create unique index if not exists ux_atendimentos_legado
  on public.atendimentos (cod_atendimento_legado, paciente_id, inicio) where cod_atendimento_legado is not null;

-- ------------------------------------------------------------------ 6. catálogo, caixas, categorias
create table if not exists public.catalogo_servicos (
  id                    uuid primary key default gen_random_uuid(),
  cod_legado_gestaods   text unique,                            -- "Cod Tipo" (único entre as 3 classes)
  classe                public.classe_catalogo not null,
  descricao             text not null check (btrim(descricao) <> ''),
  valor                 numeric(14,2) check (valor >= 0),       -- NULL = sem preço definido (193 de 440 na carga)
  duracao_min           integer check (duracao_min >= 0),       -- pouco confiável (372 com 30 min padrão)
  repasse_pct           numeric(5,2) check (repasse_pct between 0 and 100),
  ativo                 boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
comment on table public.catalogo_servicos is 'Tipos de cirurgia, procedimento e exame, com preço de tabela.';

create table if not exists public.caixas (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null unique check (btrim(nome) <> ''),
  ativo       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.categorias_financeiras (
  id          uuid primary key default gen_random_uuid(),
  tipo        public.tipo_lancamento not null,
  nome        text not null check (btrim(nome) <> ''),
  ativo       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (tipo, nome)                                           -- 5 nomes existem como receita E despesa
);

-- ------------------------------------------------------------------ 7. orçamentos
create table if not exists public.orcamentos (
  id                     uuid primary key default gen_random_uuid(),
  cod_orcamento_legado   text unique,
  numero                 text,
  titulo                 text,
  tipo_orcamento         public.tipo_orcamento not null default 'outros',
  status                 public.status_orcamento not null default 'em_aberto',
  situacao               public.temperatura_orcamento,          -- quente / morno / frio (só faz sentido em aberto)
  paciente_id            uuid not null references public.pacientes(id) on delete restrict,
  medico_id              uuid references public.medicos(id) on delete restrict,
  orcado_por_nome        text,                                  -- nome do vendedor/orçamentista no Gestão DS
  orcado_por_usuario_id  uuid references public.perfis(id) on delete set null,
  data_emissao           date not null default current_date,    -- "Criado Em"
  valido_ate             date,
  data_ganho             date,
  data_perda             date,
  motivo_perda           text,
  valor_bruto            numeric(14,2) not null default 0 check (valor_bruto >= 0),
  valor_liquido          numeric(14,2) not null default 0 check (valor_liquido >= 0),  -- com desconto
  observacao             text,
  criado_por             uuid default auth.uid(),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  check (valor_liquido <= valor_bruto),
  check (valido_ate is null or valido_ate >= data_emissao),
  check (status <> 'ganho' or data_ganho is not null),
  check (status <> 'perda' or data_perda is not null)
);
comment on table public.orcamentos is 'Orçamentos. 605 dos 965 da carga estão Em aberto; 547 têm mais de 1 ano (leads mortos nunca baixados).';
create unique index if not exists ux_orcamentos_numero on public.orcamentos (numero) where numero is not null;

-- Itens do orçamento: o backup do Gestão DS não trouxe itens (tabela nasce vazia).
create table if not exists public.orcamento_itens (
  id               uuid primary key default gen_random_uuid(),
  orcamento_id     uuid not null references public.orcamentos(id) on delete cascade,
  catalogo_id      uuid references public.catalogo_servicos(id) on delete set null,
  ordem            integer not null default 1,
  descricao        text not null check (btrim(descricao) <> ''),
  quantidade       numeric(10,2) not null default 1 check (quantidade > 0),
  valor_unitario   numeric(14,2) not null default 0 check (valor_unitario >= 0),
  desconto         numeric(14,2) not null default 0 check (desconto >= 0),
  valor_total      numeric(14,2) generated always as (round(quantidade * valor_unitario - desconto, 2)) stored,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (quantidade * valor_unitario - desconto >= 0)
);

-- ------------------------------------------------------------------ 8. financeiro
create table if not exists public.lancamentos (
  id                     uuid primary key default gen_random_uuid(),
  tipo                   public.tipo_lancamento not null,
  data_pagamento         date not null,                         -- pago=true: data efetiva; pago=false: vencimento
  data_lancamento        date not null,
  prestador              text,
  paciente_id            uuid references public.pacientes(id) on delete restrict,   -- só em receitas; vínculo por nome na carga
  paciente_nome_original text,                                  -- nome como veio do Gestão DS (rastreio do vínculo)
  orcamento_id           uuid references public.orcamentos(id) on delete set null,  -- vínculo opcional (não existia no Gestão DS)
  descricao              text,
  categoria_id           uuid references public.categorias_financeiras(id) on delete restrict,
  forma_pagamento        text,
  caixa_id               uuid references public.caixas(id) on delete restrict,
  valor                  numeric(14,2) not null check (valor >= 0),          -- bruto
  valor_liquido          numeric(14,2) not null check (valor_liquido >= 0),  -- após taxas (cartão)
  pago                   boolean not null default false,
  data_anomala           boolean not null default false,        -- data de pagamento incoerente na origem
  importado_gestaods     boolean not null default false,
  criado_por             uuid default auth.uid(),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  check (tipo = 'despesa' or valor_liquido <= valor)
);
comment on table  public.lancamentos is 'Financeiro por paciente (receitas) e despesas. Despesas só existem até 2025-09 na origem.';
comment on column public.lancamentos.paciente_id is 'Vínculo por nome normalizado na carga (o Gestão DS não trazia o código). NULL quando o nome é homônimo/inexistente.';

-- ------------------------------------------------------------------ 9. LGPD: consentimentos e anexos
create table if not exists public.anexos (
  id                      uuid primary key default gen_random_uuid(),
  paciente_id             uuid not null references public.pacientes(id) on delete restrict,
  atendimento_id          uuid references public.atendimentos(id) on delete set null,
  orcamento_id            uuid references public.orcamentos(id) on delete set null,
  classe                  public.classe_anexo not null default 'clinico',
  tipo_documento          text,                                 -- exame, foto, termo, receita, audio_plaud...
  nome_arquivo            text,
  storage_bucket          text not null default 'anexos',
  storage_path            text,                                 -- NULL = arquivo legado ainda não migrado para o Storage
  mime_type               text,
  tamanho_bytes           bigint check (tamanho_bytes >= 0),
  sha256                  text,
  data_documento          date,
  enviado_por             uuid default auth.uid() references auth.users(id) on delete set null,
  enviado_por_nome_legado text,
  origem_legado           text check (origem_legado in ('paciente_arquivos','atendimento_arquivos')),
  cod_atendimento_legado  text,
  arquivo_disponivel      boolean generated always as (storage_path is not null) stored,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  -- o caminho SEMPRE começa com {paciente_id}/{classe}/ (a policy do Storage depende disso)
  check (storage_path is null or storage_path like paciente_id::text || '/' || classe::text || '/%')
);
comment on table public.anexos is 'Metadados dos arquivos; o arquivo fica no bucket privado "anexos" do Supabase Storage em {paciente_id}/{classe}/{uuid}-{nome}. Legado: só metadados (URL S3 do Gestão DS descartada).';
create unique index if not exists ux_anexos_storage on public.anexos (storage_bucket, storage_path) where storage_path is not null;

create table if not exists public.consentimentos (
  id               uuid primary key default gen_random_uuid(),
  paciente_id      uuid not null references public.pacientes(id) on delete restrict,
  tipo             public.tipo_consentimento not null,
  versao_termo     text not null,                               -- ex.: 'tcle-gravacao-2026-10-v1'
  aceito           boolean not null default true,               -- false = recusa registrada
  aceito_em        timestamptz not null default now(),
  canal            public.canal_consentimento not null,
  revogado_em      timestamptz,
  motivo_revogacao text,
  anexo_id         uuid references public.anexos(id) on delete set null,   -- termo assinado (PDF)
  observacao       text,
  registrado_por   uuid default auth.uid() references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (revogado_em is null or revogado_em >= aceito_em)
);
comment on table public.consentimentos is 'Registro de consentimentos LGPD (tratamento, imagem, gravação Plaud, marketing...). Consentimento vigente = aceito AND revogado_em IS NULL.';

-- ------------------------------------------------------------------ 10. leads (espelho do Black CRM)
create table if not exists public.leads (
  id                      uuid primary key default gen_random_uuid(),
  crm_id_externo          text unique,                          -- id do contato/oportunidade no Black CRM
  nome                    text not null check (btrim(nome) <> ''),
  telefone                text,
  email                   text,
  origem                  text,
  campanha                text,
  etapa                   text not null,                        -- etapa do funil como está no CRM
  status                  public.status_lead not null default 'aberto',
  valor                   numeric(14,2) check (valor >= 0),
  responsavel_nome        text,
  paciente_id             uuid references public.pacientes(id) on delete set null,
  data_entrada            timestamptz,
  data_ultima_interacao   timestamptz,
  data_fechamento         timestamptz,
  motivo_perda            text,
  observacao              text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
comment on table public.leads is 'Espelho do funil do Black CRM (sincronizado por integração; o CRM é a fonte). paciente_id preenchido quando o lead vira paciente.';

-- ------------------------------------------------------------------ 11. auditoria (append-only)
create table if not exists public.auditoria (
  id                bigint generated always as identity primary key,
  ocorrido_em       timestamptz not null default now(),
  usuario_id        uuid,                                       -- sem FK: o log sobrevive à exclusão do usuário
  papel             text,
  acao              text not null check (acao in ('update','delete','leitura','exportacao')),
  tabela            text not null,
  registro_id       text,
  paciente_id       uuid,                                       -- sem FK de propósito
  campos_alterados  text[],
  dados_antes       jsonb,
  dados_depois      jsonb,
  finalidade        text,
  ip                text,
  user_agent        text
);
comment on table public.auditoria is 'Log append-only (UPDATE/DELETE em tabelas sensíveis, leituras de prontuário via RPC). UPDATE/DELETE/TRUNCATE bloqueados por trigger e sem privilégio. CPF/RG são mascarados no log.';
create index if not exists ix_auditoria_paciente  on public.auditoria (paciente_id, ocorrido_em desc);
create index if not exists ix_auditoria_usuario   on public.auditoria (usuario_id, ocorrido_em desc);
create index if not exists ix_auditoria_registro  on public.auditoria (tabela, registro_id);
create index if not exists ix_auditoria_data      on public.auditoria (ocorrido_em desc);

-- ------------------------------------------------------------------ 12. índices
create index if not exists ix_pacientes_nome_norm      on public.pacientes (public.normaliza_texto(nome) text_pattern_ops);
create index if not exists ix_pacientes_data_cadastro  on public.pacientes (data_cadastro);
create index if not exists ix_pacientes_ult_visita     on public.pacientes (ultima_visita_atendimento);
create index if not exists ix_pacientes_origem         on public.pacientes (origem);
create index if not exists ix_pacientes_medico         on public.pacientes (medico_responsavel_id) where medico_responsavel_id is not null;
create index if not exists ix_pacientes_celular        on public.pacientes (celular) where celular is not null;
create index if not exists ix_pacientes_docs_cpf       on public.pacientes_documentos (cpf) where cpf is not null;

create index if not exists ix_agend_data               on public.agendamentos (data_hora desc);
create index if not exists ix_agend_paciente           on public.agendamentos (paciente_id, data_hora desc);
create index if not exists ix_agend_medico             on public.agendamentos (medico_id, data_hora);
create index if not exists ix_agend_status             on public.agendamentos (status, data_hora);

create index if not exists ix_atend_paciente           on public.atendimentos (paciente_id, inicio desc);
create index if not exists ix_atend_medico             on public.atendimentos (medico_id, inicio desc);
create index if not exists ix_atend_cod_legado         on public.atendimentos (cod_atendimento_legado);
create index if not exists ix_atend_servico            on public.atendimentos (servico);

create index if not exists ix_orc_paciente             on public.orcamentos (paciente_id);
create index if not exists ix_orc_status_data          on public.orcamentos (status, data_emissao);
create index if not exists ix_orc_medico               on public.orcamentos (medico_id) where medico_id is not null;
create index if not exists ix_orc_itens_orc            on public.orcamento_itens (orcamento_id);

create index if not exists ix_lanc_data_pag            on public.lancamentos (data_pagamento);
create index if not exists ix_lanc_tipo_pago           on public.lancamentos (tipo, pago, data_pagamento);
create index if not exists ix_lanc_paciente            on public.lancamentos (paciente_id) where paciente_id is not null;
create index if not exists ix_lanc_categoria           on public.lancamentos (categoria_id);
create index if not exists ix_lanc_orcamento           on public.lancamentos (orcamento_id) where orcamento_id is not null;

create index if not exists ix_anexos_paciente          on public.anexos (paciente_id);
create index if not exists ix_anexos_atendimento       on public.anexos (atendimento_id) where atendimento_id is not null;
create index if not exists ix_consent_paciente         on public.consentimentos (paciente_id, tipo);
create index if not exists ix_leads_etapa              on public.leads (etapa);
create index if not exists ix_leads_status             on public.leads (status);
create index if not exists ix_leads_paciente           on public.leads (paciente_id) where paciente_id is not null;

-- Busca por parte do nome (trigram) — só se a extensão estiver disponível (no Supabase está).
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_trgm') then
    create extension if not exists pg_trgm with schema extensions;
    execute 'create index if not exists ix_pacientes_nome_trgm on public.pacientes using gin (public.normaliza_texto(nome) extensions.gin_trgm_ops)';
  end if;
exception when others then
  raise notice 'pg_trgm indisponível; busca por trecho do nome ficará sem índice trigram (%).', sqlerrm;
end $$;

-- ------------------------------------------------------------------ 13. triggers de updated_at
do $$ declare t text; begin
  foreach t in array array['perfis','config_seguranca','medicos','pacientes','pacientes_documentos','agendamentos',
    'atendimentos','catalogo_servicos','caixas','categorias_financeiras','orcamentos','orcamento_itens',
    'lancamentos','anexos','consentimentos','leads'] loop
    execute format('drop trigger if exists trg_set_updated_at on public.%I', t);
    execute format('create trigger trg_set_updated_at before update on public.%I for each row execute function public.tg_set_updated_at()', t);
  end loop;
end $$;

-- ------------------------------------------------------------------ 14. triggers de negócio
-- (a) pacientes.tem_cpf acompanha pacientes_documentos
create or replace function public.tg_documentos_tem_cpf()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    update public.pacientes set tem_cpf = false where id = old.paciente_id and tem_cpf;
    return old;
  end if;
  update public.pacientes set tem_cpf = (new.cpf is not null)
   where id = new.paciente_id and tem_cpf is distinct from (new.cpf is not null);
  return new;
end $$;
drop trigger if exists trg_documentos_tem_cpf on public.pacientes_documentos;
create trigger trg_documentos_tem_cpf after insert or update of cpf or delete on public.pacientes_documentos
  for each row execute function public.tg_documentos_tem_cpf();

-- (b) pacientes.ultima_visita_atendimento acompanha atendimentos (recência sem expor o prontuário)
create or replace function public.tg_atendimento_ultima_visita()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v date := (new.inicio at time zone 'America/Cuiaba')::date;
begin
  update public.pacientes
     set ultima_visita_atendimento = v
   where id = new.paciente_id
     and (ultima_visita_atendimento is null or ultima_visita_atendimento < v);
  return new;
end $$;
drop trigger if exists trg_atendimento_ultima_visita on public.atendimentos;
create trigger trg_atendimento_ultima_visita after insert or update of inicio, paciente_id on public.atendimentos
  for each row execute function public.tg_atendimento_ultima_visita();

-- Funções de trigger não devem ser chamáveis por API.
revoke all on function public.tg_documentos_tem_cpf()        from public, anon, authenticated;
revoke all on function public.tg_atendimento_ultima_visita() from public, anon, authenticated;
revoke all on function public.tg_set_updated_at()            from public, anon, authenticated;
