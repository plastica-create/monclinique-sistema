-- =====================================================================================
-- Mon Clinique - 003_views.sql
-- Views de leitura para o dashboard. NENHUMA expõe dado pessoal: só agregados (contagem/soma).
-- Todas com security_invoker = true: a view roda com os privilégios (e a RLS) de QUEM consulta.
--   -> admin vê tudo; médico vê só os números dos seus pacientes/agendas; quem não tem acesso
--      à tabela de origem (ex.: comercial em lancamentos) recebe resultado vazio.
-- Aplicar depois do 001 e do 002. Idempotente (DROP VIEW IF EXISTS + CREATE).
--
-- Reproduz a lógica do ETL (etl/build_dataset.py), mas "hoje" vem de hoje_clinica():
--   * normalmente = data de hoje em America/Cuiaba;
--   * para reproduzir o backup de 05/10/2026:  set app.hoje = '2026-10-05';  (vale na sessão)
-- Fuso: horários do Gestão DS eram "hora de parede" de Cuiabá -> todas as quebras por mês/dia
-- usam  (coluna at time zone 'America/Cuiaba').
-- =====================================================================================

create or replace function public.hoje_clinica()
returns date language sql stable set search_path = ''
as $$ select coalesce(nullif(current_setting('app.hoje', true), '')::date, (now() at time zone 'America/Cuiaba')::date) $$;
comment on function public.hoje_clinica() is 'Hoje em Cuiabá; sobrescrevível com set app.hoje = ''AAAA-MM-DD'' (testes/reprodução do backup).';

-- ------------------------------------------------------------------ 1. agenda por mês
-- ETL: agenda passada (até hoje), sem bloqueios. "sem_baixa" = passou e ficou nao_confirmado/confirmado/em_espera
-- (ou em_atendimento esquecido): ou faltou ou a recepção não deu baixa.
drop view if exists public.vw_agenda_mensal;
create view public.vw_agenda_mensal with (security_invoker = true) as
with base as (
  select (date_trunc('month', a.data_hora at time zone 'America/Cuiaba'))::date as mes,
         a.medico_id, a.tipo, a.status, a.primeiro_atendimento
    from public.agendamentos a
   where a.tipo <> 'bloqueio'
     and (a.data_hora at time zone 'America/Cuiaba')::date <= public.hoje_clinica()
), agg as (
  select mes, medico_id,
         count(*)                                                                      as total,
         count(*) filter (where status = 'finalizado')                                 as finalizados,
         count(*) filter (where status = 'cancelado')                                  as cancelados,
         count(*) filter (where status = 'faltou')                                     as faltas,
         count(*) filter (where status in ('nao_confirmado','confirmado','em_espera','em_atendimento')) as sem_baixa,
         count(*) filter (where tipo = 'consulta')                                     as consultas,
         count(*) filter (where tipo = 'retorno')                                      as retornos,
         count(*) filter (where tipo = 'procedimento')                                 as procedimentos,
         count(*) filter (where tipo = 'cirurgia')                                     as cirurgias,
         count(*) filter (where tipo = 'exame')                                        as exames,
         count(*) filter (where primeiro_atendimento)                                  as primeiros_atendimentos
    from base group by mes, medico_id
)
select agg.*,
       round(100.0 * finalizados / nullif(total, 0), 2) as taxa_realizado_pct,
       round(100.0 * cancelados  / nullif(total, 0), 2) as taxa_cancelado_pct
  from agg;
comment on view public.vw_agenda_mensal is 'Agenda passada por mês/médico: total, finalizados, cancelados, sem baixa, por tipo, primeiros atendimentos. Sem bloqueios.';

-- ------------------------------------------------------------------ 2. funil de orçamentos
-- Coorte por mês de emissão -> situação atual (Ganho / Em aberto / Perda). Dashboard soma/filtra.
-- Atenção (qualidade): taxa de conversão sobre "fechados" fica inflada porque quase nenhum perdido é baixado.
drop view if exists public.vw_orcamentos_funil;
create view public.vw_orcamentos_funil with (security_invoker = true) as
select (date_trunc('month', o.data_emissao))::date as mes_emissao,
       o.medico_id, o.tipo_orcamento, o.status, o.situacao,
       count(*)              as qtd,
       sum(o.valor_bruto)    as valor_bruto,
       sum(o.valor_liquido)  as valor_liquido
  from public.orcamentos o
 group by 1, 2, 3, 4, 5;
comment on view public.vw_orcamentos_funil is 'Orçamentos por mês de emissão x tipo x status x temperatura (qtd, bruto, líquido). Não use data_ganho para medir ritmo de vendas (fechamento em lote de 29/04/26).';

-- ------------------------------------------------------------------ 3. aging dos orçamentos em aberto
-- Faixas do ETL pela idade (hoje - emissão): ate 30 | 31-90 | 91-180 | 181-365 | mais de 1 ano
drop view if exists public.vw_aging_orcamentos;
create view public.vw_aging_orcamentos with (security_invoker = true) as
with ab as (
  select o.*, (public.hoje_clinica() - o.data_emissao) as idade_dias
    from public.orcamentos o
   where o.status = 'em_aberto'
)
select case when idade_dias <= 30  then 1 when idade_dias <= 90  then 2 when idade_dias <= 180 then 3
            when idade_dias <= 365 then 4 else 5 end                                  as ordem,
       case when idade_dias <= 30  then 'até 30 dias' when idade_dias <= 90  then '31–90 dias'
            when idade_dias <= 180 then '91–180 dias' when idade_dias <= 365 then '181–365 dias'
            else 'mais de 1 ano' end                                                  as faixa,
       medico_id, situacao,
       count(*)                                                                       as qtd,
       sum(valor_liquido)                                                             as valor_liquido,
       count(*) filter (where valido_ate < public.hoje_clinica())                     as qtd_validade_vencida,
       coalesce(sum(valor_liquido) filter (where valido_ate < public.hoje_clinica()), 0) as valor_validade_vencida
  from ab
 group by 1, 2, 3, 4;
comment on view public.vw_aging_orcamentos is 'Orçamentos em aberto por faixa de idade e temperatura (quente/morno/frio), com quanto já passou da validade.';

-- ------------------------------------------------------------------ 4. receita mensal
-- receita_recebida  : receitas pagas, por mês de data_pagamento, valor líquido (após taxa de cartão)
-- receita_bruta_rec.: idem, valor bruto
-- receita_lancada   : receitas por mês de data_lancamento, valor bruto (competência de lançamento)
-- despesa_paga      : despesas pagas, valor_liquido.  ATENÇÃO: despesas só existem no Gestão DS até 2025-09;
--                     depois disso 'resultado_caixa' superestima o lucro (usar Conta Azul/contabilidade).
-- a_receber         : receitas NÃO pagas, por mês de vencimento (data_pagamento), valor bruto
drop view if exists public.vw_receita_mensal;
create view public.vw_receita_mensal with (security_invoker = true) as
with r as (
  select (date_trunc('month', l.data_pagamento))::date as mes,
         coalesce(sum(l.valor_liquido) filter (where l.tipo = 'receita' and l.pago), 0) as receita_recebida,
         coalesce(sum(l.valor)         filter (where l.tipo = 'receita' and l.pago), 0) as receita_bruta_recebida,
         coalesce(sum(l.valor_liquido) filter (where l.tipo = 'despesa' and l.pago), 0) as despesa_paga,
         coalesce(sum(l.valor)         filter (where l.tipo = 'receita' and not l.pago), 0) as a_receber
    from public.lancamentos l group by 1
), c as (
  select (date_trunc('month', l.data_lancamento))::date as mes,
         coalesce(sum(l.valor) filter (where l.tipo = 'receita'), 0) as receita_lancada
    from public.lancamentos l group by 1
)
select coalesce(r.mes, c.mes) as mes,
       coalesce(r.receita_recebida, 0)       as receita_recebida,
       coalesce(r.receita_bruta_recebida, 0) as receita_bruta_recebida,
       coalesce(c.receita_lancada, 0)        as receita_lancada,
       coalesce(r.despesa_paga, 0)           as despesa_paga,
       coalesce(r.receita_recebida, 0) - coalesce(r.despesa_paga, 0) as resultado_caixa,
       coalesce(r.a_receber, 0)              as a_receber
  from r full join c on c.mes = r.mes;
comment on view public.vw_receita_mensal is 'Receita/despesa por mês. Despesa incompleta após 2025-09 (limitação da origem).';

-- ------------------------------------------------------------------ 5. a receber (atrasado x a vencer)
-- Receitas não pagas. Atrasado = vencimento < hoje; faixas por dias de atraso: até 30 | 31-90 | 91-365 | mais de 1 ano.
drop view if exists public.vw_a_receber_atrasado;
create view public.vw_a_receber_atrasado with (security_invoker = true) as
with nao_pagas as (
  select l.valor, (public.hoje_clinica() - l.data_pagamento) as dias_atraso
    from public.lancamentos l
   where l.tipo = 'receita' and not l.pago
)
select case when dias_atraso <= 0 then 'a_vencer' else 'atrasado' end as situacao,
       case when dias_atraso <= 0 then 0 when dias_atraso <= 30 then 1 when dias_atraso <= 90 then 2
            when dias_atraso <= 365 then 3 else 4 end                   as ordem,
       case when dias_atraso <= 0 then 'a vencer' when dias_atraso <= 30 then 'até 30 dias'
            when dias_atraso <= 90 then '31–90 dias' when dias_atraso <= 365 then '91–365 dias'
            else 'mais de 1 ano' end                                     as faixa,
       count(*)    as qtd,
       sum(valor)  as valor
  from nao_pagas
 group by 1, 2, 3;
comment on view public.vw_a_receber_atrasado is 'Receitas não pagas por faixa de atraso (agregado, sem nome de paciente). Lista nominal: consulta própria, só admin/financeiro.';

-- ------------------------------------------------------------------ 6. origem dos pacientes
-- "novos_desde_2023": cadastros de 2022 são a carga inicial do Gestão DS (out/22), não captação.
-- Colunas de orçamento ficam zeradas para papéis sem acesso a orcamentos (recepção).
drop view if exists public.vw_origem_pacientes;
create view public.vw_origem_pacientes with (security_invoker = true) as
with ganho as (
  select o.paciente_id, sum(o.valor_liquido) as valor
    from public.orcamentos o where o.status = 'ganho' group by o.paciente_id
)
select coalesce(p.origem, 'Não informado')                                              as origem,
       count(*)                                                                         as total_pacientes,
       round(100.0 * count(*) / sum(count(*)) over (), 2)                               as pct_total,
       count(*) filter (where p.data_cadastro >= date '2023-01-01')                     as novos_desde_2023,
       count(g.paciente_id)                                                             as pacientes_com_orcamento_ganho,
       coalesce(sum(g.valor), 0)                                                        as valor_orcamentos_ganhos
  from public.pacientes p
  left join ganho g on g.paciente_id = p.id
 group by 1;
comment on view public.vw_origem_pacientes is 'Pacientes por origem normalizada (NULL = Não informado, ~69% na carga) e valor de orçamentos ganhos.';

-- ------------------------------------------------------------------ 7. recência dos pacientes
-- Meses desde o último atendimento (dias/30,44), como no ETL; base = pacientes.ultima_visita_atendimento.
-- "reativavel" = 6 a 24 meses sem voltar (alvo de campanha de reativação).
drop view if exists public.vw_recencia_pacientes;
create view public.vw_recencia_pacientes with (security_invoker = true) as
with b as (
  select (public.hoje_clinica() - p.ultima_visita_atendimento)::numeric / 30.44 as meses
    from public.pacientes p where p.ativo
)
select case when meses is null then 6 when meses <= 3 then 1 when meses <= 6 then 2
            when meses <= 12 then 3 when meses <= 24 then 4 else 5 end as ordem,
       case when meses is null then 'sem atendimento desde out/22' when meses <= 3 then 'até 3 meses'
            when meses <= 6 then '3–6 meses' when meses <= 12 then '6–12 meses'
            when meses <= 24 then '12–24 meses' else 'mais de 24 meses' end as faixa,
       (meses > 6 and meses <= 24) as reativavel,
       count(*) as qtd
  from b
 group by 1, 2, 3;
comment on view public.vw_recencia_pacientes is 'Pacientes ativos por tempo desde o último atendimento. Não lê prontuário: usa a data mantida por trigger em pacientes.';

-- ------------------------------------------------------------------ permissões (anon nunca)
revoke all on function public.hoje_clinica() from public, anon;
grant execute on function public.hoje_clinica() to authenticated;
revoke all on public.vw_agenda_mensal, public.vw_orcamentos_funil, public.vw_aging_orcamentos,
  public.vw_receita_mensal, public.vw_a_receber_atrasado, public.vw_origem_pacientes,
  public.vw_recencia_pacientes from public, anon;
grant select on public.vw_agenda_mensal, public.vw_orcamentos_funil, public.vw_aging_orcamentos,
  public.vw_receita_mensal, public.vw_a_receber_atrasado, public.vw_origem_pacientes,
  public.vw_recencia_pacientes to authenticated;
