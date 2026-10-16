-- =====================================================================================
-- Teste de aceite automatizado da RLS (seção 2 do SETUP), para staging/local com a semente fictícia.
-- Cada papel roda como "authenticated" com o JWT simulado; qualquer divergência da matriz => ERRO.
-- Uso: psql -v ON_ERROR_STOP=1 -f db/tests/aceite_rls.sql
-- =====================================================================================
\set ON_ERROR_STOP on
drop schema if exists teste_rls cascade;
create schema teste_rls;

create or replace function teste_rls.como(p_email text, p_aal text default 'aal1') returns void language plpgsql as $$
declare v uuid;
begin
  select id into v from auth.users where email = p_email;
  if v is null then raise exception 'usuário de teste % não existe', p_email; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated', 'aal', p_aal)::text, false);
  perform set_config('request.jwt.claim.sub', v::text, false);
end $$;

create or replace function teste_rls.conta(p_sql text) returns bigint language plpgsql as $$
declare n bigint; begin execute 'select count(*) from (' || p_sql || ') x' into n; return n; end $$;

create or replace function teste_rls.negado(p_sql text) returns boolean language plpgsql as $$
begin execute p_sql; return false;
exception when insufficient_privilege then return true; end $$;

create or replace function teste_rls.esperar(p_desc text, p_ok boolean) returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then raise exception 'FALHOU: %', p_desc; end if;
  raise notice 'ok  %', p_desc;
end $$;

grant usage on schema teste_rls to anon, authenticated;
grant execute on all functions in schema teste_rls to anon, authenticated;

-- ----------------------------------------------------------------- anon
set role anon;
select teste_rls.esperar('anon: pacientes negado', teste_rls.negado('select 1 from public.pacientes'));
select teste_rls.esperar('anon: views negadas',   teste_rls.negado('select 1 from public.vw_receita_mensal'));
reset role;

-- ----------------------------------------------------------------- admin
select teste_rls.como('admin@teste.local');
set role authenticated;
select teste_rls.esperar('admin: papel', public.papel_atual() = 'admin');
select teste_rls.esperar('admin: vê lançamentos', teste_rls.conta('select 1 from public.lancamentos') > 0);
select teste_rls.esperar('admin: vê CPF', teste_rls.conta('select 1 from public.pacientes_documentos') > 0);
select teste_rls.esperar('admin: vê metadado do prontuário', teste_rls.conta('select id from public.atendimentos') > 0);
select teste_rls.esperar('admin: texto clínico por SELECT negado', teste_rls.negado('select texto from public.atendimentos limit 1'));
select teste_rls.esperar('admin: lê prontuário por RPC', teste_rls.conta(
  'select * from public.ler_prontuario((select paciente_id from public.atendimentos limit 1), 5, 0, ''teste'')') > 0);
select teste_rls.esperar('admin: leitura auditada', teste_rls.conta('select 1 from public.auditoria where acao = ''leitura''') > 0);
select teste_rls.esperar('admin: auditoria imutável', teste_rls.negado('delete from public.auditoria'));
select teste_rls.esperar('admin: vê auditoria', teste_rls.conta('select 1 from public.auditoria') > 0);
reset role;

-- ----------------------------------------------------------------- médico (só os dele)
-- paciente sem nenhum vínculo com a Dra. Helena (calculado como dono, antes de trocar de papel)
select p.id as pac_outro from public.pacientes p
 where p.medico_responsavel_id is distinct from '00000000-0000-4000-a000-000000000002'
   and not exists (select 1 from public.agendamentos a where a.paciente_id = p.id and a.medico_id = '00000000-0000-4000-a000-000000000002')
   and not exists (select 1 from public.atendimentos a where a.paciente_id = p.id and a.medico_id = '00000000-0000-4000-a000-000000000002')
   and not exists (select 1 from public.orcamentos o where o.paciente_id = p.id and o.medico_id = '00000000-0000-4000-a000-000000000002')
 limit 1 \gset
select teste_rls.como('medico2@teste.local');
set role authenticated;
select teste_rls.esperar('medico: papel', public.papel_atual() = 'medico');
select teste_rls.esperar('medico: não vê lançamentos', teste_rls.conta('select 1 from public.lancamentos') = 0);
select teste_rls.esperar('medico: não vê leads', teste_rls.conta('select 1 from public.leads') = 0);
select teste_rls.esperar('medico: só agenda dele', teste_rls.conta(
  'select 1 from public.agendamentos where medico_id <> ''00000000-0000-4000-a000-000000000002''') = 0);
select teste_rls.esperar('medico: tem agenda', teste_rls.conta('select 1 from public.agendamentos') > 0);
select teste_rls.esperar('medico: só prontuário dele', teste_rls.conta(
  'select id from public.atendimentos where medico_id <> ''00000000-0000-4000-a000-000000000002''') = 0);
select teste_rls.esperar('medico: pacientes só os vinculados', teste_rls.conta('select 1 from public.pacientes') between 1 and 239);
select teste_rls.esperar('medico: RPC nega paciente de outro médico', teste_rls.negado(
  'select * from public.ler_prontuario(''' || :'pac_outro' || ''', 5, 0, null)'));
select teste_rls.esperar('medico: não vê cadastro de paciente de outro médico', teste_rls.conta(
  'select 1 from public.pacientes where id = ''' || :'pac_outro' || '''') = 0);
reset role;

-- ----------------------------------------------------------------- comercial
select teste_rls.como('comercial@teste.local');
set role authenticated;
select teste_rls.esperar('comercial: papel', public.papel_atual() = 'comercial');
select teste_rls.esperar('comercial: vê cadastro', teste_rls.conta('select 1 from public.pacientes') = 240);
select teste_rls.esperar('comercial: não vê CPF', teste_rls.conta('select 1 from public.pacientes_documentos') = 0);
select teste_rls.esperar('comercial: não vê prontuário', teste_rls.conta('select id from public.atendimentos') = 0);
select teste_rls.esperar('comercial: não vê lançamentos', teste_rls.conta('select 1 from public.lancamentos') = 0);
select teste_rls.esperar('comercial: vê orçamentos', teste_rls.conta('select 1 from public.orcamentos') > 0);
select teste_rls.esperar('comercial: vê leads', teste_rls.conta('select 1 from public.leads') > 0);
select teste_rls.esperar('comercial: RPC prontuário negada', teste_rls.negado(
  'select * from public.ler_prontuario(''10000000-0000-4000-a000-000000000001'', 5, 0, null)'));
select teste_rls.esperar('comercial: não se promove a admin', teste_rls.conta(
  'select 1 from public.perfis') = 1);
reset role;

-- ----------------------------------------------------------------- recepção
select teste_rls.como('recepcao@teste.local');
set role authenticated;
select teste_rls.esperar('recepcao: papel', public.papel_atual() = 'recepcao');
select teste_rls.esperar('recepcao: vê cadastro', teste_rls.conta('select 1 from public.pacientes') = 240);
select teste_rls.esperar('recepcao: vê agenda', teste_rls.conta('select 1 from public.agendamentos') > 0);
select teste_rls.esperar('recepcao: não vê CPF', teste_rls.conta('select 1 from public.pacientes_documentos') = 0);
select teste_rls.esperar('recepcao: não vê orçamentos', teste_rls.conta('select 1 from public.orcamentos') = 0);
select teste_rls.esperar('recepcao: não vê lançamentos', teste_rls.conta('select 1 from public.lancamentos') = 0);
select teste_rls.esperar('recepcao: não vê prontuário', teste_rls.conta('select id from public.atendimentos') = 0);
select teste_rls.esperar('recepcao: view financeira vazia', teste_rls.conta('select 1 from public.vw_receita_mensal') = 0);
reset role;

-- ----------------------------------------------------------------- financeiro
select teste_rls.como('financeiro@teste.local');
set role authenticated;
select teste_rls.esperar('financeiro: papel', public.papel_atual() = 'financeiro');
select teste_rls.esperar('financeiro: vê lançamentos', teste_rls.conta('select 1 from public.lancamentos') > 0);
select teste_rls.esperar('financeiro: vê CPF', teste_rls.conta('select 1 from public.pacientes_documentos') > 0);
select teste_rls.esperar('financeiro: não vê agenda', teste_rls.conta('select 1 from public.agendamentos') = 0);
select teste_rls.esperar('financeiro: não vê prontuário', teste_rls.conta('select id from public.atendimentos') = 0);
select teste_rls.esperar('financeiro: orçamento só leitura', teste_rls.negado(
  'update public.orcamentos set titulo = titulo') or teste_rls.conta('select 1 from public.orcamentos') > 0);
reset role;

-- ----------------------------------------------------------------- sem perfil
select teste_rls.como('semperfil@teste.local');
set role authenticated;
select teste_rls.esperar('sem perfil: papel nulo', public.papel_atual() is null);
select teste_rls.esperar('sem perfil: nada', teste_rls.conta('select 1 from public.pacientes') = 0);
reset role;

-- ----------------------------------------------------------------- MFA exigido
update public.config_seguranca set exigir_mfa_admin_medico = true;
select teste_rls.como('admin@teste.local', 'aal1');
set role authenticated;
select teste_rls.esperar('MFA: admin aal1 sem acesso', public.papel_atual() is null);
reset role;
select teste_rls.como('admin@teste.local', 'aal2');
set role authenticated;
select teste_rls.esperar('MFA: admin aal2 com acesso', public.papel_atual() = 'admin');
reset role;
update public.config_seguranca set exigir_mfa_admin_medico = false;

drop schema teste_rls cascade;
\echo 'ACEITE DA RLS: TODOS OS TESTES PASSARAM'
