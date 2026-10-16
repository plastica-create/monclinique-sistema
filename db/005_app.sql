-- =====================================================================================
-- Mon Clinique - 005_app.sql
-- Funções usadas pelo aplicativo web (app/). Aplicar DEPOIS de 001–003 (e 004, se houver carga).
-- Idempotente. Se rodar o 002 de novo, rode o 003 e este 005 de novo (o 002 zera os EXECUTE).
-- =====================================================================================

-- ------------------------------------------------------------------ 1. busca de pacientes
-- SECURITY INVOKER: roda com a RLS de quem busca (médico só encontra os seus).
-- Busca sem acento por trecho do nome, ou por dígitos do celular/telefone.
create or replace function public.buscar_pacientes(p_termo text, p_limite integer default 30)
returns table (id uuid, nome text, data_nascimento date, celular text, origem text,
               ultima_visita_atendimento date, tem_cpf boolean, ativo boolean)
language sql stable security invoker set search_path = ''
as $$
  with t as (
    select public.normaliza_texto(p_termo) as nome_n,
           regexp_replace(coalesce(p_termo, ''), '\D', '', 'g') as dig
  )
  select p.id, p.nome, p.data_nascimento, p.celular, p.origem, p.ultima_visita_atendimento, p.tem_cpf, p.ativo
    from public.pacientes p, t
   where length(btrim(coalesce(p_termo, ''))) >= 2
     and ( public.normaliza_texto(p.nome) like '%' || t.nome_n || '%'
           or (length(t.dig) >= 4 and (p.celular like '%' || t.dig || '%' or p.telefone like '%' || t.dig || '%')) )
   order by p.ativo desc, (public.normaliza_texto(p.nome) like t.nome_n || '%') desc, p.nome
   limit greatest(least(coalesce(p_limite, 30), 100), 1)
$$;
comment on function public.buscar_pacientes(text, integer) is 'Busca por nome (sem acento, trecho) ou dígitos do telefone. Respeita a RLS de quem chama.';

-- ------------------------------------------------------------------ 2. revelar CPF/RG (auditado)
-- Grava a leitura em auditoria ANTES de devolver o valor. Mesma regra de leitura da policy
-- pacientes_documentos_select (admin, financeiro, médico do paciente).
create or replace function public.revelar_documento(p_paciente_id uuid, p_finalidade text default null)
returns table (cpf text, rg text)
language plpgsql volatile security definer set search_path = ''
as $$
declare v_papel public.papel_usuario := public.papel_atual();
begin
  if v_papel is null or not (v_papel in ('admin','financeiro')
                             or (v_papel = 'medico' and public.medico_atende_paciente(p_paciente_id))) then
    raise exception 'sem permissão para ver documentos' using errcode = '42501';
  end if;
  perform public._auditar_evento('leitura', 'pacientes_documentos', p_paciente_id::text, p_paciente_id,
                                 coalesce(p_finalidade, 'revelar CPF/RG'), 1);
  return query select d.cpf, d.rg from public.pacientes_documentos d where d.paciente_id = p_paciente_id;
end $$;
comment on function public.revelar_documento(uuid, text) is 'Devolve CPF/RG de um paciente e registra a leitura em auditoria (por paciente).';

-- ------------------------------------------------------------------ 3. possíveis duplicados no cadastro
-- Mesmo nome normalizado + (mesma data de nascimento ou mesmo celular). Invoker: respeita a RLS.
create or replace function public.possiveis_duplicados(p_nome text, p_nascimento date, p_celular text, p_ignorar uuid default null)
returns table (id uuid, nome text, data_nascimento date)
language sql stable security invoker set search_path = ''
as $$
  select p.id, p.nome, p.data_nascimento
    from public.pacientes p
   where public.normaliza_texto(p.nome) = public.normaliza_texto(p_nome)
     and (p_ignorar is null or p.id <> p_ignorar)
     and ( (p_nascimento is not null and p.data_nascimento = p_nascimento)
           or (nullif(p_celular, '') is not null and p.celular = p_celular)
           or (p_nascimento is null and nullif(p_celular, '') is null) )
   limit 5
$$;

-- ------------------------------------------------------------------ 4. conciliação contábil mensal
-- Valores informados pela contabilidade / Conta Azul, para comparar com o recebido no sistema.
create table if not exists public.conciliacao_mensal (
  mes          date primary key check (mes = date_trunc('month', mes)::date),
  contabilidade numeric(14,2) check (contabilidade >= 0),
  conta_azul    numeric(14,2) check (conta_azul >= 0),
  observacao    text,
  atualizado_por uuid default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table public.conciliacao_mensal is 'Receita mensal segundo a contabilidade e o Conta Azul (digitada), para conciliar com vw_receita_mensal.';
alter table public.conciliacao_mensal enable row level security;
drop trigger if exists trg_set_updated_at on public.conciliacao_mensal;
create trigger trg_set_updated_at before update on public.conciliacao_mensal for each row execute function public.tg_set_updated_at();
drop trigger if exists trg_auditoria on public.conciliacao_mensal;
create trigger trg_auditoria after update or delete on public.conciliacao_mensal for each row execute function public.tg_auditoria();
drop policy if exists conciliacao_select on public.conciliacao_mensal;
create policy conciliacao_select on public.conciliacao_mensal for select to authenticated using ((select public.papel_em('admin','financeiro')));
drop policy if exists conciliacao_insert on public.conciliacao_mensal;
create policy conciliacao_insert on public.conciliacao_mensal for insert to authenticated with check ((select public.papel_em('admin','financeiro')));
drop policy if exists conciliacao_update on public.conciliacao_mensal;
create policy conciliacao_update on public.conciliacao_mensal for update to authenticated
  using ((select public.papel_em('admin','financeiro'))) with check ((select public.papel_em('admin','financeiro')));
grant select, insert, update on public.conciliacao_mensal to authenticated;

-- ------------------------------------------------------------------ 5. EXECUTE (anon nunca)
revoke all on function public.buscar_pacientes(text, integer), public.revelar_documento(uuid, text),
  public.possiveis_duplicados(text, date, text, uuid) from public, anon;
grant execute on function public.buscar_pacientes(text, integer), public.revelar_documento(uuid, text),
  public.possiveis_duplicados(text, date, text, uuid) to authenticated;

do $$ begin
  if has_function_privilege('anon', 'public.revelar_documento(uuid, text)', 'execute') then
    raise exception 'anon não pode executar revelar_documento';
  end if;
  raise notice 'OK: 005_app aplicado.';
end $$;
