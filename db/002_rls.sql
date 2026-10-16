-- =====================================================================================
-- Mon Clinique - 002_rls.sql
-- Row Level Security, papéis, auditoria e Storage. Aplicar DEPOIS do 001 e ANTES de qualquer carga.
-- Idempotente (DROP POLICY IF EXISTS / CREATE OR REPLACE).
--
-- ----------------------------------------------------------------- MODELO DE AMEAÇA
-- Dados: saúde, CPF/RG, prontuário, orçamentos e financeiro por paciente (LGPD art. 11).
--
-- Limitação do sistema anterior (Cowork): um único acesso "abre tudo". A secretária, com o
-- mesmo login/painel, enxergava financeiro e prontuário. Aqui cada pessoa tem login próprio
-- (Supabase Auth), com 1 papel em public.perfis, e o BANCO (não o front) decide o que ela lê:
--
--   Ameaça                                   Defesa
--   ---------------------------------------  ------------------------------------------------
--   Internet/anônimo lendo o banco           anon sem privilégio nenhum e sem policy; RLS em TUDO
--   Secretária/comercial lendo prontuário    atendimentos só admin/médico; texto clínico só por RPC
--   Recepção/comercial lendo financeiro      lancamentos/caixas/categorias só admin/financeiro
--   Recepção/comercial vendo CPF/RG          CPF/RG em tabela própria (pacientes_documentos)
--   Médico vendo paciente de outro médico    policy por medico_atende_paciente()/medico_id
--   Usuário promovendo a si mesmo a admin    perfis só escrita por admin
--   Funcionário apagando rastro              auditoria append-only (trigger + sem privilégio)
--   Login/senha vazado de admin ou médico    MFA exigível no banco (config_seguranca)
--   service_role vazada no front             NÃO mitigável aqui: ela ignora RLS. Nunca no front.
--   Admin do Supabase / superuser            fora do escopo (ignoram RLS); proteger a conta e o MFA
--
-- ----------------------------------------------------------------- MATRIZ DE ACESSO
--   S=ver I=criar U=editar D=apagar   (— = nenhum acesso)
--   tabela                  admin   medico        comercial   recepcao    financeiro
--   pacientes (cadastro)    SIUD    SIU (dele)    SIU         SIU         S
--   pacientes_documentos    SIUD    SI  (dele)    I (só grava) I (só grava) S
--   agendamentos            SIUD    SIU (dele)    SIU         SIU         —
--   atendimentos            SIU     SIU (dele)    —           —           —       (ninguém apaga)
--   orcamentos(+itens)      SIUD    SIU (dele)    SIU         —           S
--   lancamentos             SIUD    —             —           —           SIU
--   caixas/categorias       SIUD    —             —           —           SIU
--   catalogo_servicos       SIUD    S             S           S           S
--   consentimentos          SIU     SIU (dele)    SIU         SIU         —
--   anexos (por classe)     tudo    clin.+adm.    adm.        adm.        financeiro
--   leads                   SIUD    —             SIU         —           —
--   medicos                 SIU     S             S           S           S
--   perfis / config / log   admin   próprio perfil (só leitura)  —         —       (log: só admin lê)
--
-- DECISÃO — CPF/RG: a recepção e o comercial NÃO leem CPF/RG (só gravam no cadastro).
--   Eles veem pacientes.tem_cpf (sim/não). Financeiro lê (nota fiscal) e o médico lê dos seus
--   pacientes. Se a clínica quiser que a recepção veja o CPF, basta trocar a policy
--   pacientes_documentos_select (linha marcada "AJUSTE: CPF na recepção").
-- DECISÃO — prontuário: admin lê tudo (Luciana/Dr. Fabrício). Toda leitura do TEXTO clínico
--   passa por RPC (ler_prontuario / ler_atendimento) que grava em auditoria. O acesso direto às
--   colunas texto/texto_html é revogado de propósito.
-- Observação: RLS é por LINHA. agendamentos.observacao e pacientes.observacao são visíveis
--   para quem vê a linha: instruir a equipe a NÃO registrar informação clínica nesses campos.
-- =====================================================================================

-- ------------------------------------------------------------------ 1. limpeza de privilégios
-- Deny-by-default: anon não recebe nada; authenticated recebe só o que for concedido abaixo.
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from anon;
-- (efeito colateral desejado: tabelas novas criadas no futuro exigem GRANT + RLS explícitos.)

-- ------------------------------------------------------------------ 2. funções-ajudantes (SECURITY DEFINER, search_path fixo)
-- Papel do usuário logado. NULL = sem acesso (sem perfil, inativo, ou MFA exigido e ausente).
create or replace function public.papel_atual()
returns public.papel_usuario
language sql stable security definer set search_path = ''
as $$
  select p.papel
    from public.perfis p
   where p.id = (select auth.uid())
     and p.ativo
     and ( p.papel not in ('admin','medico')
           or not coalesce((select c.exigir_mfa_admin_medico from public.config_seguranca c where c.id), false)
           or coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2' )
$$;
comment on function public.papel_atual() is 'Papel do usuário logado (NULL = sem acesso). Se config_seguranca.exigir_mfa_admin_medico, admin/médico só valem com sessão aal2.';

-- Atalho legível para policies: (select public.papel_em('admin','comercial'))
create or replace function public.papel_em(variadic p_papeis public.papel_usuario[])
returns boolean language sql stable set search_path = ''
as $$ select coalesce(public.papel_atual() = any (p_papeis), false) $$;

-- medicos.id do usuário logado (somente admin/médico).
create or replace function public.medico_atual_id()
returns uuid language sql stable security definer set search_path = ''
as $$
  select m.id
    from public.medicos m
   where m.usuario_id = (select auth.uid()) and m.ativo
     and public.papel_atual() in ('admin','medico')
   limit 1
$$;

-- O médico logado "atende" o paciente? (responsável, ou tem agendamento/atendimento/orçamento dele)
create or replace function public.medico_atende_paciente(p_paciente uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  with m as (select public.medico_atual_id() as id)
  select exists (select 1 from public.pacientes   x, m where x.id = p_paciente and x.medico_responsavel_id = m.id)
      or exists (select 1 from public.atendimentos a, m where a.paciente_id = p_paciente and a.medico_id = m.id)
      or exists (select 1 from public.agendamentos a, m where a.paciente_id = p_paciente and a.medico_id = m.id)
      or exists (select 1 from public.orcamentos   o, m where o.paciente_id = p_paciente and o.medico_id = m.id)
$$;

-- Quem pode ver/gravar anexo de determinada classe (usado na tabela anexos E no Storage).
create or replace function public.pode_ver_anexo(p_paciente uuid, p_classe public.classe_anexo)
returns boolean language sql stable security definer set search_path = ''
as $$
  select case public.papel_atual()
    when 'admin'      then true
    when 'medico'     then p_classe in ('clinico','administrativo') and public.medico_atende_paciente(p_paciente)
    when 'comercial'  then p_classe = 'administrativo'
    when 'recepcao'   then p_classe = 'administrativo'
    when 'financeiro' then p_classe = 'financeiro'
    else false end
$$;

-- Caminho no Storage: {paciente_id}/{classe}/{arquivo}
create or replace function public.pode_acessar_anexo_storage(p_name text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select case
    when p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(clinico|administrativo|financeiro)/.+'
      then public.pode_ver_anexo(split_part(p_name, '/', 1)::uuid, split_part(p_name, '/', 2)::public.classe_anexo)
    else false end
$$;

-- ------------------------------------------------------------------ 3. auditoria
-- Gatilho genérico: grava UPDATE (só campos alterados) e DELETE (linha inteira). CPF/RG mascarados.
create or replace function public.tg_auditoria()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_old    jsonb := to_jsonb(old);
  v_new    jsonb;
  v_campos text[];
  v_antes  jsonb;
  v_depois jsonb;
  v_pac    uuid;
  v_hdr    jsonb;
  v_mask   text[] := array['cpf','rg'];
begin
  if tg_op = 'UPDATE' then
    v_new := to_jsonb(new);
    select array_agg(n.key order by n.key),
           jsonb_object_agg(n.key, case when n.key = any (v_mask) then to_jsonb('***'::text) else v_old -> n.key end),
           jsonb_object_agg(n.key, case when n.key = any (v_mask) then to_jsonb('***'::text) else n.value end)
      into v_campos, v_antes, v_depois
      from jsonb_each(v_new) n
     where n.key <> 'updated_at' and (v_old -> n.key) is distinct from n.value;
    if v_campos is null then return null; end if;          -- nada relevante mudou
  else
    select jsonb_object_agg(e.k, case when e.k = any (v_mask) then to_jsonb('***'::text) else e.v end)
      into v_antes from jsonb_each(v_old) as e(k, v);
  end if;

  v_pac := case when tg_table_name = 'pacientes' then (v_old ->> 'id')::uuid else (v_old ->> 'paciente_id')::uuid end;
  begin v_hdr := nullif(current_setting('request.headers', true), '')::jsonb; exception when others then v_hdr := null; end;

  insert into public.auditoria (usuario_id, papel, acao, tabela, registro_id, paciente_id,
                                campos_alterados, dados_antes, dados_depois, ip, user_agent)
  values ((select auth.uid()), public.papel_atual()::text, lower(tg_op), tg_table_name,
          coalesce(v_old ->> 'id', v_old ->> 'paciente_id'), v_pac,
          v_campos, v_antes, v_depois,
          nullif(btrim(split_part(coalesce(v_hdr ->> 'x-forwarded-for', ''), ',', 1)), ''),
          v_hdr ->> 'user-agent');
  return null;
end $$;

do $$ declare t text; begin
  foreach t in array array['perfis','config_seguranca','medicos','pacientes','pacientes_documentos','agendamentos',
    'atendimentos','catalogo_servicos','orcamentos','orcamento_itens','lancamentos','anexos','consentimentos','leads'] loop
    execute format('drop trigger if exists trg_auditoria on public.%I', t);
    execute format('create trigger trg_auditoria after update or delete on public.%I for each row execute function public.tg_auditoria()', t);
  end loop;
end $$;

-- Append-only: nem o dono nem a service_role conseguem alterar/apagar (exceto DROP/superuser).
create or replace function public.tg_auditoria_imutavel()
returns trigger language plpgsql set search_path = ''
as $$ begin raise exception 'auditoria é append-only: % bloqueado', tg_op using errcode = '42501'; end $$;
drop trigger if exists trg_auditoria_imutavel     on public.auditoria;
drop trigger if exists trg_auditoria_imutavel_tr  on public.auditoria;
create trigger trg_auditoria_imutavel    before update or delete on public.auditoria for each row       execute function public.tg_auditoria_imutavel();
create trigger trg_auditoria_imutavel_tr before truncate         on public.auditoria for each statement execute function public.tg_auditoria_imutavel();

-- Registro interno de leitura/exportação (não exposto por API).
create or replace function public._auditar_evento(p_acao text, p_tabela text, p_registro text, p_paciente uuid, p_finalidade text, p_qtd integer)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_hdr jsonb;
begin
  begin v_hdr := nullif(current_setting('request.headers', true), '')::jsonb; exception when others then v_hdr := null; end;
  insert into public.auditoria (usuario_id, papel, acao, tabela, registro_id, paciente_id, finalidade, dados_depois, ip, user_agent)
  values ((select auth.uid()), public.papel_atual()::text, p_acao, p_tabela, p_registro, p_paciente, left(p_finalidade, 300),
          case when p_qtd is not null then jsonb_build_object('qtd_registros', p_qtd) end,
          nullif(btrim(split_part(coalesce(v_hdr ->> 'x-forwarded-for', ''), ',', 1)), ''),
          v_hdr ->> 'user-agent');
end $$;

-- RPC: registrar que o prontuário de um paciente foi aberto (quando o front já tem os dados).
create or replace function public.registrar_leitura_prontuario(
  p_paciente_id uuid, p_atendimento_id uuid default null, p_finalidade text default null)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.papel_em('admin','medico') then raise exception 'sem permissão para o prontuário' using errcode = '42501'; end if;
  if public.papel_atual() = 'medico' and not public.medico_atende_paciente(p_paciente_id) then
    raise exception 'paciente não vinculado ao médico' using errcode = '42501'; end if;
  perform public._auditar_evento('leitura', 'atendimentos', p_atendimento_id::text, p_paciente_id, p_finalidade, null);
end $$;

-- RPC: lê a evolução clínica de um paciente (com texto) E registra a leitura. Use ESTA no front.
create or replace function public.ler_prontuario(
  p_paciente_id uuid, p_limite integer default 50, p_offset integer default 0, p_finalidade text default null)
returns setof public.atendimentos
language plpgsql volatile security definer set search_path = ''
as $$
declare r public.atendimentos; n integer := 0; v_med uuid := public.medico_atual_id(); v_papel public.papel_usuario := public.papel_atual();
begin
  if v_papel is null or v_papel not in ('admin','medico') then raise exception 'sem permissão para o prontuário' using errcode = '42501'; end if;
  if v_papel = 'medico' and not public.medico_atende_paciente(p_paciente_id) then
    raise exception 'paciente não vinculado ao médico' using errcode = '42501'; end if;
  for r in select a.* from public.atendimentos a
            where a.paciente_id = p_paciente_id and (v_papel = 'admin' or a.medico_id = v_med)
            order by a.inicio desc
            limit greatest(least(coalesce(p_limite, 50), 500), 1) offset greatest(coalesce(p_offset, 0), 0)
  loop n := n + 1; return next r; end loop;
  perform public._auditar_evento('leitura', 'atendimentos', null, p_paciente_id, p_finalidade, n);
  return;
end $$;

-- RPC: lê UM atendimento (com texto) e registra a leitura.
create or replace function public.ler_atendimento(p_atendimento_id uuid, p_finalidade text default null)
returns public.atendimentos
language plpgsql volatile security definer set search_path = ''
as $$
declare r public.atendimentos; v_papel public.papel_usuario := public.papel_atual();
begin
  if v_papel is null or v_papel not in ('admin','medico') then raise exception 'sem permissão para o prontuário' using errcode = '42501'; end if;
  select a.* into r from public.atendimentos a
   where a.id = p_atendimento_id and (v_papel = 'admin' or a.medico_id = public.medico_atual_id());
  if not found then raise exception 'atendimento não encontrado ou sem permissão' using errcode = '42501'; end if;
  perform public._auditar_evento('leitura', 'atendimentos', r.id::text, r.paciente_id, p_finalidade, 1);
  return r;
end $$;

-- RPC: registrar exportação (CSV/planilha/relatório com dado pessoal) feita pelo front.
create or replace function public.registrar_exportacao(p_tabela text, p_qtd integer, p_finalidade text default null)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if public.papel_atual() is null then raise exception 'sem permissão' using errcode = '42501'; end if;
  perform public._auditar_evento('exportacao', left(p_tabela, 60), null, null, p_finalidade, p_qtd);
end $$;

-- ------------------------------------------------------------------ 4. ligar RLS em TODAS as tabelas
do $$ declare t text; begin
  foreach t in array array['perfis','config_seguranca','medicos','pacientes','pacientes_documentos','agendamentos',
    'atendimentos','catalogo_servicos','caixas','categorias_financeiras','orcamentos','orcamento_itens',
    'lancamentos','anexos','consentimentos','leads','auditoria'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
-- (NÃO usamos FORCE: o dono "postgres" e a service_role precisam rodar migrações/cargas; ver docs.)

-- ------------------------------------------------------------------ 5. policies (todas TO authenticated; nenhuma para anon)
-- perfis
drop policy if exists perfis_select on public.perfis;
create policy perfis_select on public.perfis for select to authenticated
  using (id = (select auth.uid()) or (select public.papel_em('admin')));
drop policy if exists perfis_insert on public.perfis;
create policy perfis_insert on public.perfis for insert to authenticated with check ((select public.papel_em('admin')));
drop policy if exists perfis_update on public.perfis;
create policy perfis_update on public.perfis for update to authenticated
  using ((select public.papel_em('admin'))) with check ((select public.papel_em('admin')));
drop policy if exists perfis_delete on public.perfis;
create policy perfis_delete on public.perfis for delete to authenticated using ((select public.papel_em('admin')));

-- config_seguranca
drop policy if exists config_select on public.config_seguranca;
create policy config_select on public.config_seguranca for select to authenticated using ((select public.papel_em('admin')));
drop policy if exists config_update on public.config_seguranca;
create policy config_update on public.config_seguranca for update to authenticated
  using ((select public.papel_em('admin'))) with check ((select public.papel_em('admin')));

-- medicos
drop policy if exists medicos_select on public.medicos;
create policy medicos_select on public.medicos for select to authenticated using ((select public.papel_atual()) is not null);
drop policy if exists medicos_insert on public.medicos;
create policy medicos_insert on public.medicos for insert to authenticated with check ((select public.papel_em('admin')));
drop policy if exists medicos_update on public.medicos;
create policy medicos_update on public.medicos for update to authenticated
  using ((select public.papel_em('admin'))) with check ((select public.papel_em('admin')));

-- pacientes (cadastro básico)
drop policy if exists pacientes_select on public.pacientes;
create policy pacientes_select on public.pacientes for select to authenticated using (
  (select public.papel_em('admin','comercial','recepcao','financeiro'))
  or ((select public.papel_em('medico')) and public.medico_atende_paciente(id)));
drop policy if exists pacientes_insert on public.pacientes;
create policy pacientes_insert on public.pacientes for insert to authenticated with check (
  (select public.papel_em('admin','comercial','recepcao'))
  or ((select public.papel_em('medico')) and medico_responsavel_id = (select public.medico_atual_id())));
drop policy if exists pacientes_update on public.pacientes;
create policy pacientes_update on public.pacientes for update to authenticated
  using (
    (select public.papel_em('admin','comercial','recepcao'))
    or ((select public.papel_em('medico')) and public.medico_atende_paciente(id)))
  with check (
    (select public.papel_em('admin','comercial','recepcao'))
    or ((select public.papel_em('medico')) and public.medico_atende_paciente(id)));
drop policy if exists pacientes_delete on public.pacientes;
create policy pacientes_delete on public.pacientes for delete to authenticated using ((select public.papel_em('admin')));

-- pacientes_documentos (CPF/RG)
drop policy if exists pacientes_documentos_select on public.pacientes_documentos;
create policy pacientes_documentos_select on public.pacientes_documentos for select to authenticated using (
  (select public.papel_em('admin','financeiro'))          -- AJUSTE: CPF na recepção -> acrescentar 'recepcao' aqui
  or ((select public.papel_em('medico')) and public.medico_atende_paciente(paciente_id)));
drop policy if exists pacientes_documentos_insert on public.pacientes_documentos;
create policy pacientes_documentos_insert on public.pacientes_documentos for insert to authenticated with check (
  (select public.papel_em('admin','comercial','recepcao'))
  or ((select public.papel_em('medico')) and public.medico_atende_paciente(paciente_id)));
drop policy if exists pacientes_documentos_update on public.pacientes_documentos;
create policy pacientes_documentos_update on public.pacientes_documentos for update to authenticated
  using ((select public.papel_em('admin'))) with check ((select public.papel_em('admin')));
drop policy if exists pacientes_documentos_delete on public.pacientes_documentos;
create policy pacientes_documentos_delete on public.pacientes_documentos for delete to authenticated using ((select public.papel_em('admin')));

-- agendamentos
drop policy if exists agendamentos_select on public.agendamentos;
create policy agendamentos_select on public.agendamentos for select to authenticated using (
  (select public.papel_em('admin','comercial','recepcao'))
  or ((select public.papel_em('medico')) and medico_id = (select public.medico_atual_id())));
drop policy if exists agendamentos_insert on public.agendamentos;
create policy agendamentos_insert on public.agendamentos for insert to authenticated with check (
  (select public.papel_em('admin','comercial','recepcao'))
  or ((select public.papel_em('medico')) and medico_id = (select public.medico_atual_id())));
drop policy if exists agendamentos_update on public.agendamentos;
create policy agendamentos_update on public.agendamentos for update to authenticated
  using (
    (select public.papel_em('admin','comercial','recepcao'))
    or ((select public.papel_em('medico')) and medico_id = (select public.medico_atual_id())))
  with check (
    (select public.papel_em('admin','comercial','recepcao'))
    or ((select public.papel_em('medico')) and medico_id = (select public.medico_atual_id())));
drop policy if exists agendamentos_delete on public.agendamentos;
create policy agendamentos_delete on public.agendamentos for delete to authenticated using ((select public.papel_em('admin')));

-- atendimentos (prontuário) — sem policy de DELETE: ninguém apaga prontuário pela API
drop policy if exists atendimentos_select on public.atendimentos;
create policy atendimentos_select on public.atendimentos for select to authenticated using (
  (select public.papel_em('admin'))
  or ((select public.papel_em('medico')) and medico_id = (select public.medico_atual_id())));
drop policy if exists atendimentos_insert on public.atendimentos;
create policy atendimentos_insert on public.atendimentos for insert to authenticated with check (
  (select public.papel_em('admin'))
  or ((select public.papel_em('medico')) and medico_id = (select public.medico_atual_id())));
drop policy if exists atendimentos_update on public.atendimentos;
create policy atendimentos_update on public.atendimentos for update to authenticated
  using (
    (select public.papel_em('admin'))
    or ((select public.papel_em('medico')) and medico_id = (select public.medico_atual_id())))
  with check (
    (select public.papel_em('admin'))
    or ((select public.papel_em('medico')) and medico_id = (select public.medico_atual_id())));

-- catalogo_servicos
drop policy if exists catalogo_select on public.catalogo_servicos;
create policy catalogo_select on public.catalogo_servicos for select to authenticated using ((select public.papel_atual()) is not null);
drop policy if exists catalogo_insert on public.catalogo_servicos;
create policy catalogo_insert on public.catalogo_servicos for insert to authenticated with check ((select public.papel_em('admin')));
drop policy if exists catalogo_update on public.catalogo_servicos;
create policy catalogo_update on public.catalogo_servicos for update to authenticated
  using ((select public.papel_em('admin'))) with check ((select public.papel_em('admin')));
drop policy if exists catalogo_delete on public.catalogo_servicos;
create policy catalogo_delete on public.catalogo_servicos for delete to authenticated using ((select public.papel_em('admin')));

-- caixas e categorias_financeiras
drop policy if exists caixas_select on public.caixas;
create policy caixas_select on public.caixas for select to authenticated using ((select public.papel_em('admin','financeiro')));
drop policy if exists caixas_insert on public.caixas;
create policy caixas_insert on public.caixas for insert to authenticated with check ((select public.papel_em('admin','financeiro')));
drop policy if exists caixas_update on public.caixas;
create policy caixas_update on public.caixas for update to authenticated
  using ((select public.papel_em('admin','financeiro'))) with check ((select public.papel_em('admin','financeiro')));
drop policy if exists caixas_delete on public.caixas;
create policy caixas_delete on public.caixas for delete to authenticated using ((select public.papel_em('admin')));

drop policy if exists categorias_select on public.categorias_financeiras;
create policy categorias_select on public.categorias_financeiras for select to authenticated using ((select public.papel_em('admin','financeiro')));
drop policy if exists categorias_insert on public.categorias_financeiras;
create policy categorias_insert on public.categorias_financeiras for insert to authenticated with check ((select public.papel_em('admin','financeiro')));
drop policy if exists categorias_update on public.categorias_financeiras;
create policy categorias_update on public.categorias_financeiras for update to authenticated
  using ((select public.papel_em('admin','financeiro'))) with check ((select public.papel_em('admin','financeiro')));
drop policy if exists categorias_delete on public.categorias_financeiras;
create policy categorias_delete on public.categorias_financeiras for delete to authenticated using ((select public.papel_em('admin')));

-- orcamentos
drop policy if exists orcamentos_select on public.orcamentos;
create policy orcamentos_select on public.orcamentos for select to authenticated using (
  (select public.papel_em('admin','comercial','financeiro'))
  or ((select public.papel_em('medico')) and medico_id = (select public.medico_atual_id())));
drop policy if exists orcamentos_insert on public.orcamentos;
create policy orcamentos_insert on public.orcamentos for insert to authenticated with check (
  (select public.papel_em('admin','comercial'))
  or ((select public.papel_em('medico')) and medico_id = (select public.medico_atual_id())));
drop policy if exists orcamentos_update on public.orcamentos;
create policy orcamentos_update on public.orcamentos for update to authenticated
  using (
    (select public.papel_em('admin','comercial'))
    or ((select public.papel_em('medico')) and medico_id = (select public.medico_atual_id())))
  with check (
    (select public.papel_em('admin','comercial'))
    or ((select public.papel_em('medico')) and medico_id = (select public.medico_atual_id())));
drop policy if exists orcamentos_delete on public.orcamentos;
create policy orcamentos_delete on public.orcamentos for delete to authenticated using ((select public.papel_em('admin')));

-- orcamento_itens: seguem o orçamento-pai (a subconsulta já aplica a RLS de orcamentos ao usuário)
drop policy if exists orc_itens_select on public.orcamento_itens;
create policy orc_itens_select on public.orcamento_itens for select to authenticated using (
  (select public.papel_em('admin','comercial','financeiro','medico'))
  and exists (select 1 from public.orcamentos o where o.id = orcamento_itens.orcamento_id));
drop policy if exists orc_itens_insert on public.orcamento_itens;
create policy orc_itens_insert on public.orcamento_itens for insert to authenticated with check (
  (select public.papel_em('admin','comercial','medico'))
  and exists (select 1 from public.orcamentos o where o.id = orcamento_itens.orcamento_id));
drop policy if exists orc_itens_update on public.orcamento_itens;
create policy orc_itens_update on public.orcamento_itens for update to authenticated
  using ((select public.papel_em('admin','comercial','medico'))
         and exists (select 1 from public.orcamentos o where o.id = orcamento_itens.orcamento_id))
  with check ((select public.papel_em('admin','comercial','medico'))
         and exists (select 1 from public.orcamentos o where o.id = orcamento_itens.orcamento_id));
drop policy if exists orc_itens_delete on public.orcamento_itens;
create policy orc_itens_delete on public.orcamento_itens for delete to authenticated using (
  (select public.papel_em('admin','comercial','medico'))
  and exists (select 1 from public.orcamentos o where o.id = orcamento_itens.orcamento_id));

-- lancamentos (financeiro) — só admin e financeiro
drop policy if exists lancamentos_select on public.lancamentos;
create policy lancamentos_select on public.lancamentos for select to authenticated using ((select public.papel_em('admin','financeiro')));
drop policy if exists lancamentos_insert on public.lancamentos;
create policy lancamentos_insert on public.lancamentos for insert to authenticated with check ((select public.papel_em('admin','financeiro')));
drop policy if exists lancamentos_update on public.lancamentos;
create policy lancamentos_update on public.lancamentos for update to authenticated
  using ((select public.papel_em('admin','financeiro'))) with check ((select public.papel_em('admin','financeiro')));
drop policy if exists lancamentos_delete on public.lancamentos;
create policy lancamentos_delete on public.lancamentos for delete to authenticated using ((select public.papel_em('admin')));

-- consentimentos (sem DELETE: revogação é UPDATE de revogado_em)
drop policy if exists consentimentos_select on public.consentimentos;
create policy consentimentos_select on public.consentimentos for select to authenticated using (
  (select public.papel_em('admin','comercial','recepcao'))
  or ((select public.papel_em('medico')) and public.medico_atende_paciente(paciente_id)));
drop policy if exists consentimentos_insert on public.consentimentos;
create policy consentimentos_insert on public.consentimentos for insert to authenticated with check (
  (select public.papel_em('admin','comercial','recepcao'))
  or ((select public.papel_em('medico')) and public.medico_atende_paciente(paciente_id)));
drop policy if exists consentimentos_update on public.consentimentos;
create policy consentimentos_update on public.consentimentos for update to authenticated
  using (
    (select public.papel_em('admin','comercial','recepcao'))
    or ((select public.papel_em('medico')) and public.medico_atende_paciente(paciente_id)))
  with check (
    (select public.papel_em('admin','comercial','recepcao'))
    or ((select public.papel_em('medico')) and public.medico_atende_paciente(paciente_id)));

-- anexos (por classe)
drop policy if exists anexos_select on public.anexos;
create policy anexos_select on public.anexos for select to authenticated using (public.pode_ver_anexo(paciente_id, classe));
drop policy if exists anexos_insert on public.anexos;
create policy anexos_insert on public.anexos for insert to authenticated
  with check (public.pode_ver_anexo(paciente_id, classe) and enviado_por = (select auth.uid()));
drop policy if exists anexos_update on public.anexos;
create policy anexos_update on public.anexos for update to authenticated
  using (public.pode_ver_anexo(paciente_id, classe)) with check (public.pode_ver_anexo(paciente_id, classe));
drop policy if exists anexos_delete on public.anexos;
create policy anexos_delete on public.anexos for delete to authenticated using ((select public.papel_em('admin')));

-- leads
drop policy if exists leads_select on public.leads;
create policy leads_select on public.leads for select to authenticated using ((select public.papel_em('admin','comercial')));
drop policy if exists leads_insert on public.leads;
create policy leads_insert on public.leads for insert to authenticated with check ((select public.papel_em('admin','comercial')));
drop policy if exists leads_update on public.leads;
create policy leads_update on public.leads for update to authenticated
  using ((select public.papel_em('admin','comercial'))) with check ((select public.papel_em('admin','comercial')));
drop policy if exists leads_delete on public.leads;
create policy leads_delete on public.leads for delete to authenticated using ((select public.papel_em('admin')));

-- auditoria: só leitura, só admin. Nenhuma policy de INSERT/UPDATE/DELETE (gravação só via triggers/RPC).
drop policy if exists auditoria_select on public.auditoria;
create policy auditoria_select on public.auditoria for select to authenticated using ((select public.papel_em('admin')));

-- ------------------------------------------------------------------ 6. GRANTs de tabela (a RLS filtra as linhas)
grant select, insert, update, delete on
  public.perfis, public.pacientes, public.pacientes_documentos, public.agendamentos, public.catalogo_servicos,
  public.caixas, public.categorias_financeiras, public.orcamentos, public.orcamento_itens, public.lancamentos,
  public.anexos, public.leads
  to authenticated;
grant select, insert, update on public.medicos, public.consentimentos to authenticated;
grant select, update on public.config_seguranca to authenticated;
grant select on public.auditoria to authenticated;
revoke update, delete, truncate on public.auditoria from public, anon, authenticated, service_role;

-- Prontuário: o texto clínico NÃO é legível por SELECT direto (só por ler_prontuario/ler_atendimento).
-- No front use select explícito de colunas (não use select=* em atendimentos).
revoke all on public.atendimentos from authenticated;
grant select (id, cod_atendimento_legado, legado_cod_repetido, paciente_id, medico_id, agendamento_id,
              inicio, fim, servico, tipo_servico, criado_por, created_at, updated_at)
  on public.atendimentos to authenticated;
grant insert, update on public.atendimentos to authenticated;      -- inclui texto/texto_html (escrita), sem leitura
-- OPCIONAL (menos seguro, mais simples): devolver leitura direta do texto -> auditoria de leitura deixa de ser garantida:
--   grant select (texto_html, texto) on public.atendimentos to authenticated;

-- ------------------------------------------------------------------ 7. EXECUTE das funções (anon nunca)
-- Funções novas nascem com EXECUTE para PUBLIC (inclui anon): tira de todas e concede só as necessárias.
revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.normaliza_texto(text), public.papel_atual(), public.papel_em(public.papel_usuario[]),
  public.medico_atual_id(), public.medico_atende_paciente(uuid),
  public.pode_ver_anexo(uuid, public.classe_anexo), public.pode_acessar_anexo_storage(text),
  public.registrar_leitura_prontuario(uuid, uuid, text), public.ler_prontuario(uuid, integer, integer, text),
  public.ler_atendimento(uuid, text), public.registrar_exportacao(text, integer, text)
  to authenticated;
revoke all on function public.tg_auditoria(), public.tg_auditoria_imutavel(),
  public._auditar_evento(text, text, text, uuid, text, integer) from public, anon, authenticated;

-- ------------------------------------------------------------------ 8. Storage: bucket privado "anexos"
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('anexos', 'anexos', false, 52428800,
        array['application/pdf','image/jpeg','image/png','image/webp','image/heic',
              'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              'audio/mpeg','audio/mp4','audio/x-m4a','audio/wav','audio/webm','audio/ogg','video/mp4'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists anexos_storage_select on storage.objects;
create policy anexos_storage_select on storage.objects for select to authenticated
  using (bucket_id = 'anexos' and public.pode_acessar_anexo_storage(name));
drop policy if exists anexos_storage_insert on storage.objects;
create policy anexos_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'anexos' and public.pode_acessar_anexo_storage(name));
drop policy if exists anexos_storage_delete on storage.objects;
create policy anexos_storage_delete on storage.objects for delete to authenticated
  using (bucket_id = 'anexos' and (select public.papel_em('admin')));
-- (sem policy de UPDATE: arquivo não é sobrescrito; envie novo e apague o antigo como admin.)

-- ------------------------------------------------------------------ 9. verificação final (falha alto se algo ficou aberto)
do $$
declare v_sem_rls text; v_anon text;
begin
  select string_agg(c.relname, ', ') into v_sem_rls
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  if v_sem_rls is not null then
    raise exception 'RLS DESLIGADA nas tabelas: %', v_sem_rls;
  end if;

  select string_agg(schemaname || '.' || tablename || ':' || policyname, ', ') into v_anon
    from pg_policies
   where (schemaname = 'public' or (schemaname = 'storage' and policyname like 'anexos_%'))
     and ('anon' = any (roles) or 'public' = any (roles));
  if v_anon is not null then
    raise exception 'Policy acessível a anon/public: %', v_anon;
  end if;

  if has_table_privilege('anon', 'public.pacientes', 'select') then
    raise exception 'anon ainda tem SELECT em public.pacientes';
  end if;
  raise notice 'OK: RLS ligada em todas as tabelas de public e nenhuma policy para anon.';
end $$;
