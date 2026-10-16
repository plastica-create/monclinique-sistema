-- =====================================================================================
-- Semente 100% FICTÍCIA para staging/local (nenhum dado real). Pré: 001–003 aplicados e
-- os usuários *@teste.local criados no Auth (ver supabase-local/README.md).
-- Idempotente o bastante para desenvolvimento: apaga a semente anterior antes de inserir.
-- NUNCA rode em produção.
-- =====================================================================================
\set ON_ERROR_STOP on
begin;
set local session_replication_role = replica;   -- sem triggers de auditoria durante a semente
delete from public.auditoria; delete from public.leads; delete from public.consentimentos; delete from public.anexos;
delete from public.lancamentos; delete from public.orcamento_itens; delete from public.orcamentos;
delete from public.atendimentos; delete from public.agendamentos; delete from public.pacientes_documentos;
delete from public.pacientes; delete from public.catalogo_servicos; delete from public.caixas;
delete from public.categorias_financeiras; delete from public.medicos; delete from public.perfis;
set local session_replication_role = origin;

insert into public.perfis (id, papel, nome)
select id, v.papel::public.papel_usuario, v.nome
  from auth.users u join (values ('admin@teste.local','admin','Luciana (teste)'),
    ('medico@teste.local','medico','Dr. Fabrício (teste)'), ('medico2@teste.local','medico','Dra. Helena (teste)'),
    ('comercial@teste.local','comercial','Carla (teste)'), ('recepcao@teste.local','recepcao','Rita (teste)'),
    ('financeiro@teste.local','financeiro','Bruno (teste)')) v(email, papel, nome) on v.email = u.email;

insert into public.medicos (id, usuario_id, nome, crm, uf_crm, especialidade, cod_legado_gestaods)
select '00000000-0000-4000-a000-000000000001'::uuid, (select id from auth.users where email='medico@teste.local'),
       'Dr. Fabrício (teste)', '00000', 'MT', 'Cirurgia plástica', '13402'
union all
select '00000000-0000-4000-a000-000000000002'::uuid, (select id from auth.users where email='medico2@teste.local'),
       'Dra. Helena (teste)', '00001', 'MT', 'Dermatologia', null;

insert into public.caixas (nome) values ('Caixa clínica'), ('Banco');
insert into public.categorias_financeiras (tipo, nome) values
  ('receita','Cirurgia'), ('receita','Procedimento'), ('receita','Consulta'),
  ('despesa','Aluguel'), ('despesa','Materiais'), ('despesa','Folha');

insert into public.catalogo_servicos (classe, descricao, valor, duracao_min)
select (array['cirurgia','procedimento','exame'])[1 + (g % 3)]::public.classe_catalogo,
       (array['Rinoplastia','Toxina botulínica','Ultrassom','Mamoplastia','Preenchimento','Hemograma',
              'Lipoaspiração','Bioestimulador','Eletrocardiograma','Blefaroplastia','Peeling','Raio X'])[1 + (g % 12)] || ' ' || g,
       case when g % 5 = 0 then null else (500 + (g * 137) % 20000)::numeric end, 30 + (g % 6) * 30
  from generate_series(1, 36) g;

-- 240 pacientes fictícios
with nomes as (
  select array['Ana','Bruna','Camila','Daniela','Eduarda','Fernanda','Gabriela','Helena','Isabela','Júlia',
               'Larissa','Mariana','Natália','Olívia','Paula','Rafaela','Sofia','Tatiane','Vanessa','Yasmin',
               'Carlos','João','Marcos','Pedro','Ricardo'] as p,
         array['Teste','Exemplo','Fictícia','Modelo','Simulada','Demonstração','Amostra','Protótipo'] as s
)
insert into public.pacientes (id, nome, data_nascimento, sexo, celular, email, cidade, uf, origem, data_cadastro,
                              medico_responsavel_id, observacao)
select ('10000000-0000-4000-a000-' || lpad(g::text, 12, '0'))::uuid,
       p[1 + (g % 25)] || ' ' || s[1 + (g % 8)] || ' ' || g,
       date '1960-01-01' + (g * 97 % 18000),
       case when g % 25 >= 20 then 'M' else 'F' end,
       '6599' || lpad((1000000 + g * 7919 % 8999999)::text, 7, '0'),
       'paciente' || g || '@exemplo.invalid',
       (array['Cuiabá','Várzea Grande','Rondonópolis','Sinop'])[1 + (g % 4)], 'MT',
       case when g % 3 = 0 then null else (array['Instagram','Google','Indicação de paciente','Indicação de médico','Site'])[1 + (g % 5)] end,
       date '2022-10-01' + (g * 5 % 1460),
       case when g % 4 = 0 then '00000000-0000-4000-a000-000000000002'::uuid else '00000000-0000-4000-a000-000000000001'::uuid end,
       null
  from generate_series(1, 240) g, nomes;

insert into public.pacientes_documentos (paciente_id, cpf, rg)
select id, lpad(((row_number() over ()) * 12345679 % 99999999999)::text, 11, '0'), 'RG' || (row_number() over ())
  from public.pacientes where (substr(id::text, 25)::int % 5) <> 0;

-- agenda: ~6 meses para trás e 1 mês para frente
insert into public.agendamentos (paciente_id, medico_id, data_hora, fim, tipo, procedimento, convenio, status, primeiro_atendimento)
select ('10000000-0000-4000-a000-' || lpad((1 + g % 240)::text, 12, '0'))::uuid,
       case when g % 4 = 0 then '00000000-0000-4000-a000-000000000002'::uuid else '00000000-0000-4000-a000-000000000001'::uuid end,
       d, d + interval '30 minutes',
       (array['consulta','retorno','procedimento','cirurgia','exame'])[1 + (g % 5)]::public.tipo_agendamento,
       null, 'Particular',
       case when d > now() then (array['nao_confirmado','confirmado'])[1 + (g % 2)]
            when g % 11 = 0 then 'cancelado' when g % 13 = 0 then 'faltou' when g % 17 = 0 then 'confirmado'
            else 'finalizado' end::public.status_agendamento,
       g % 6 = 0
  from generate_series(1, 600) g,
       lateral (select (date_trunc('day', now() at time zone 'America/Cuiaba') - interval '180 days'
                        + ((g * 7) % 210) * interval '1 day' + (8 + g % 10) * interval '1 hour')
                       at time zone 'America/Cuiaba' as d) x;

-- prontuário: um atendimento por agendamento finalizado
insert into public.atendimentos (paciente_id, medico_id, agendamento_id, inicio, fim, servico, tipo_servico, texto)
select paciente_id, medico_id, id, data_hora, fim, initcap(tipo::text), procedimento,
       'Evolução fictícia de teste. Paciente sem queixas. Conduta: retorno em 30 dias.'
  from public.agendamentos where status = 'finalizado';

-- orçamentos
insert into public.orcamentos (numero, titulo, tipo_orcamento, status, situacao, paciente_id, medico_id, orcado_por_nome,
                               data_emissao, valido_ate, data_ganho, data_perda, motivo_perda, valor_bruto, valor_liquido)
select 'T-' || lpad(g::text, 5, '0'), (array['Rinoplastia','Mamoplastia','Toxina','Lipoaspiração','Bioestimulador'])[1 + g % 5],
       (array['cirurgico','procedimento','outros'])[1 + g % 3]::public.tipo_orcamento,
       st::public.status_orcamento,
       case when st = 'em_aberto' then (array['quente','morno','frio'])[1 + g % 3]::public.temperatura_orcamento end,
       ('10000000-0000-4000-a000-' || lpad((1 + g * 3 % 240)::text, 12, '0'))::uuid,
       case when g % 4 = 0 then '00000000-0000-4000-a000-000000000002'::uuid else '00000000-0000-4000-a000-000000000001'::uuid end,
       'Carla (teste)', em, em + 30,
       case when st = 'ganho' then em + 10 end, case when st = 'perda' then em + 20 end,
       case when st = 'perda' then 'Preço' end,
       vb, round(vb * 0.92, 2)
  from generate_series(1, 160) g,
       lateral (select (current_date - (g * 11 % 700))::date as em,
                       case when g % 3 = 0 then 'ganho' when g % 7 = 0 then 'perda' else 'em_aberto' end as st,
                       (1500 + (g * 733) % 38000)::numeric as vb) x;

-- financeiro: receitas ligadas aos orçamentos ganhos + algumas em aberto + despesas
insert into public.lancamentos (tipo, data_pagamento, data_lancamento, paciente_id, orcamento_id, descricao, categoria_id,
                                forma_pagamento, caixa_id, valor, valor_liquido, pago)
select 'receita', o.data_ganho + (k * 30), o.data_ganho, o.paciente_id, o.id, o.titulo || ' parcela ' || k,
       (select id from public.categorias_financeiras where tipo='receita' and nome='Cirurgia'),
       (array['Pix','Cartão de crédito','Boleto'])[1 + (k % 3)], (select id from public.caixas where nome='Banco'),
       round(o.valor_liquido / 2, 2), round(o.valor_liquido / 2 * case when k % 3 = 1 then 0.96 else 1 end, 2),
       (o.data_ganho + (k * 30)) < current_date - 5 or k = 0
  from public.orcamentos o, generate_series(0, 1) k where o.status = 'ganho';

insert into public.lancamentos (tipo, data_pagamento, data_lancamento, prestador, descricao, categoria_id, forma_pagamento,
                                caixa_id, valor, valor_liquido, pago)
select 'despesa', d, d, 'Fornecedor fictício ' || (g % 5), (array['Aluguel','Materiais','Folha'])[1 + g % 3],
       (select id from public.categorias_financeiras where tipo='despesa' and nome = (array['Aluguel','Materiais','Folha'])[1 + g % 3]),
       'Transferência', (select id from public.caixas where nome='Banco'),
       (2000 + g * 97 % 9000)::numeric, (2000 + g * 97 % 9000)::numeric, d <= current_date
  from generate_series(1, 72) g, lateral (select (current_date - (g * 10))::date as d) x;

insert into public.leads (crm_id_externo, nome, telefone, origem, campanha, etapa, status, valor, responsavel_nome, data_entrada)
select 'crm-teste-' || g, 'Lead Fictício ' || g, '6598' || lpad((g * 4567 % 9999999)::text, 7, '0'),
       (array['Instagram','Google','Site'])[1 + g % 3], 'Campanha teste', (array['Novo','Contato','Avaliação','Proposta'])[1 + g % 4],
       (array['aberto','aberto','ganho','perdido'])[1 + g % 4]::public.status_lead, (1000 + g * 311 % 20000)::numeric,
       'Carla (teste)', now() - (g * interval '2 days')
  from generate_series(1, 40) g;

insert into public.consentimentos (paciente_id, tipo, versao_termo, canal)
select id, 'tratamento_dados_saude', 'tcle-dados-2026-10-v1', 'presencial_papel' from public.pacientes limit 120;

commit;
select (select count(*) from public.pacientes) pacientes, (select count(*) from public.agendamentos) agendamentos,
       (select count(*) from public.atendimentos) atendimentos, (select count(*) from public.orcamentos) orcamentos,
       (select count(*) from public.lancamentos) lancamentos;
