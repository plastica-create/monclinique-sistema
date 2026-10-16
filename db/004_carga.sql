-- =====================================================================================
-- Mon Clinique - 004_carga.sql
-- Carga única do backup do Gestão DS (05/10/2026) para as tabelas finais.
-- Pré-requisitos: 001, 002 e 003 aplicados; CSVs gerados por etl/build_dataset.py em out/clean/.
-- ESTES CSVs TÊM DADO PESSOAL SENSÍVEL: rode de um computador seguro, não versione, apague depois.
--
-- ----------------------------------------------------------------- MODO 1 (recomendado): psql
--   1. Abra um terminal na pasta  sistema/  (os caminhos dos \copy são relativos a ela;
--      ou use  \cd 'C:/caminho/para/sistema'  no psql).
--   2. Defina a senha por variável (não deixe no histórico):
--        PowerShell:  $env:PGPASSWORD = "..."          bash:  export PGPASSWORD='...'
--   3. Rode (Supabase > Connect > "Session pooler", porta 5432 — funciona em IPv4; a conexão
--      direta db.<ref>.supabase.co:5432 exige IPv6):
--        psql "host=aws-0-sa-east-1.pooler.supabase.com port=5432 dbname=postgres user=postgres.<ref> sslmode=require" -f db/004_carga.sql
--      (copie host/usuário exatos do painel; a região "sa-east-1" = São Paulo.)
--   Windows: se acentos saírem quebrados, defina antes  $env:PGCLIENTENCODING = "UTF8".
--
-- ----------------------------------------------------------------- MODO 2: sem psql (Table Editor)
--   a. SQL Editor: rode só o trecho "PARTE A" (cria o schema `staging` e as tabelas staging_*).
--   b. Table Editor > schema `staging` > cada tabela > "Insert" > "Import data from CSV" > escolha o
--      arquivo correspondente de out/clean/ (nome da tabela = staging_<nome do csv>; os cabeçalhos
--      já batem com as colunas). Se o arquivo atendimentos.csv (13 MB) falhar, use o MODO 1.
--   c. SQL Editor: rode só o trecho "PARTE B" (transformação + conferência).
--   O schema staging NÃO é exposto pela API, mas guarda dado pessoal: a Parte B o apaga no fim.
--
-- ----------------------------------------------------------------- DECISÕES DE MODELAGEM DA CARGA
--   * pacientes: cod_paciente (legado) -> cod_legado_gestaods (único) + uuid novo. Vazio vira NULL.
--     origem 'Não informado' vira NULL (as views devolvem 'Não informado').
--   * atendimentos: 122 cod_atendimento aparecem em mais de uma linha (116 códigos, 238 linhas). Conferido
--     nos dados: são atendimentos DIFERENTES (datas/textos distintos) que o Gestão DS numerou igual — não são
--     duplicatas. Por isso PK uuid própria; cod_atendimento_legado NÃO é único e as 238 linhas ficam marcadas
--     em legado_cod_repetido = true para revisão. Nada é descartado.
--   * lancamentos: o financeiro não traz código do paciente. O vínculo é pelo NOME normalizado (sem acento,
--     maiúsculo) só quando o nome é único no cadastro; homônimo => paciente_id NULL (nome original preservado).
--     No backup 100% das receitas com nome casam com nome único.
--   * agendamentos/atendimentos: horário interpretado como America/Cuiaba (o export vinha sem fuso).
--   * médico: cria 1 linha em medicos (cod 13402 = Dr. Fabrício) e vincula agenda/prontuário/orçamentos a ela.
--     Depois da carga: preencher CRM e ligar o login (UPDATE public.medicos SET usuario_id = ...), ver docs.
--   * catálogo: valor 0 na origem = "sem preço" => NULL.
--   * anexos: só metadados (URL S3 do Gestão DS foi descartada de propósito). classe = 'clinico' (a mais
--     restrita) até alguém reclassificar; storage_path NULL = arquivo ainda não migrado.
--   * leads (Black CRM): não há CSV; carga por integração própria.
--   * qtd_consultas/cirurgias/procedimentos do cadastro NÃO são carregados (derivam de atendimentos; a
--     conferência confirma que batem).
-- =====================================================================================

-- (linhas de psql; no Modo 2 ignore-as)
\set ON_ERROR_STOP on
\encoding UTF8

-- >>> PARTE A ----------------------------------------------------------------------
create schema if not exists staging;
revoke all on schema staging from public, anon, authenticated;

drop table if exists staging.staging_pacientes, staging.staging_agendamentos, staging.staging_atendimentos,
  staging.staging_orcamentos, staging.staging_lancamentos, staging.staging_catalogo,
  staging.staging_paciente_arquivos, staging.staging_atendimento_arquivos;

-- todas as colunas em text (a conversão e a validação acontecem na PARTE B); ordem = cabeçalho dos CSVs
create unlogged table staging.staging_pacientes (
  cod_paciente text, nome text, nascimento text, sexo text, cpf text, rg text, estado_civil text, ocupacao text,
  email text, telefone text, celular text, cep text, endereco text, numero text, complemento text, bairro text,
  cidade text, uf text, origem text, indicacao_original text, convenio text, instagram text, data_cadastro text,
  ultima_visita text, ultima_visita_atendimento text, qtd_consultas text, qtd_cirurgias text, qtd_procedimentos text,
  observacao text);
create unlogged table staging.staging_agendamentos (
  cod_paciente text, data_hora text, tipo text, procedimento text, convenio text, status text,
  primeiro_atendimento text, observacao text);
create unlogged table staging.staging_atendimentos (
  cod_atendimento text, cod_paciente text, inicio text, fim text, servico text, tipo_servico text,
  texto_html text, texto text);
create unlogged table staging.staging_orcamentos (
  cod_orcamento text, numero text, titulo text, tipo_orcamento text, status text, situacao text, cod_paciente text,
  orcado_por text, criado_em text, valido_ate text, data_ganho text, data_perda text, valor_bruto text, valor_liquido text);
create unlogged table staging.staging_lancamentos (
  tipo text, data_pagamento text, data_lancamento text, prestador text, paciente_nome text, descricao text,
  categoria text, forma_pagamento text, caixa text, valor text, valor_liquido text, pago text, data_anomala text);
create unlogged table staging.staging_catalogo (
  cod_tipo text, classe text, descricao text, valor text, duracao_min text, repasse_pct text, ativo text);
create unlogged table staging.staging_paciente_arquivos (
  cod_paciente text, data_cadastro text, cadastrado_por text, nome_arquivo text);
create unlogged table staging.staging_atendimento_arquivos (
  cod_atendimento text, cod_paciente text, data text);
-- <<< FIM PARTE A ------------------------------------------------------------------

-- >>> PARTE A2 (SOMENTE psql; no Modo 2 importe os CSVs pela Table Editor) -----------
\copy staging.staging_pacientes             from 'out/clean/pacientes.csv'             with (format csv, header true, encoding 'UTF8')
\copy staging.staging_agendamentos          from 'out/clean/agendamentos.csv'          with (format csv, header true, encoding 'UTF8')
\copy staging.staging_atendimentos          from 'out/clean/atendimentos.csv'          with (format csv, header true, encoding 'UTF8')
\copy staging.staging_orcamentos            from 'out/clean/orcamentos.csv'            with (format csv, header true, encoding 'UTF8')
\copy staging.staging_lancamentos           from 'out/clean/lancamentos.csv'           with (format csv, header true, encoding 'UTF8')
\copy staging.staging_catalogo              from 'out/clean/catalogo.csv'              with (format csv, header true, encoding 'UTF8')
\copy staging.staging_paciente_arquivos     from 'out/clean/paciente_arquivos.csv'     with (format csv, header true, encoding 'UTF8')
\copy staging.staging_atendimento_arquivos  from 'out/clean/atendimento_arquivos.csv'  with (format csv, header true, encoding 'UTF8')
-- <<< FIM PARTE A2 -----------------------------------------------------------------

-- >>> PARTE B ----------------------------------------------------------------------
set statement_timeout = 0;
begin;

-- B0. Travas: carga única; staging com o número de linhas esperado dos CSVs.
do $$
begin
  if exists (select 1 from public.pacientes where cod_legado_gestaods is not null) then
    raise exception 'Carga já executada (há pacientes legados). Para refazer, limpe antes: TRUNCATE public.anexos, public.lancamentos, public.orcamento_itens, public.orcamentos, public.atendimentos, public.agendamentos, public.consentimentos, public.pacientes_documentos, public.pacientes, public.catalogo_servicos, public.caixas, public.categorias_financeiras RESTART IDENTITY CASCADE;  (isto também zera leads; a auditoria é preservada).';
  end if;
  if (select count(*) from staging.staging_pacientes) <> 2191
     or (select count(*) from staging.staging_agendamentos) <> 3483
     or (select count(*) from staging.staging_atendimentos) <> 8920
     or (select count(*) from staging.staging_orcamentos) <> 965
     or (select count(*) from staging.staging_lancamentos) <> 2892
     or (select count(*) from staging.staging_catalogo) <> 440
     or (select count(*) from staging.staging_paciente_arquivos) <> 2591
     or (select count(*) from staging.staging_atendimento_arquivos) <> 5938 then
    raise exception 'Staging incompleto: confira se os 8 CSVs foram importados por inteiro (esperado 2191/3483/8920/965/2892/440/2591/5938 linhas).';
  end if;
end $$;

create temp table _aud_antes on commit drop as select count(*) as n from public.auditoria;

-- Triggers de manutenção ficam desligados na carga (os valores são calculados direto no INSERT)
alter table public.pacientes_documentos disable trigger trg_documentos_tem_cpf;
alter table public.atendimentos         disable trigger trg_atendimento_ultima_visita;

-- B1. Médico único do backup
insert into public.medicos (cod_legado_gestaods, nome, ativo)
values ('13402', 'Fabrício Lucena de Almeida', true)
on conflict (cod_legado_gestaods) do nothing;

-- B2. Pacientes (cadastro básico)
insert into public.pacientes (
  cod_legado_gestaods, nome, data_nascimento, sexo, estado_civil, ocupacao, email, telefone, celular, cep,
  endereco, numero, complemento, bairro, cidade, uf, origem, indicacao_original, convenio, instagram,
  data_cadastro, ultima_visita_gestaods, ultima_visita_atendimento, tem_cpf, observacao)
select btrim(s.cod_paciente), btrim(s.nome),
       nullif(btrim(s.nascimento), '')::date,
       nullif(upper(btrim(s.sexo)), ''),
       nullif(btrim(s.estado_civil), ''), nullif(btrim(s.ocupacao), ''), nullif(btrim(s.email), ''),
       nullif(btrim(s.telefone), ''), nullif(btrim(s.celular), ''), nullif(btrim(s.cep), ''),
       nullif(btrim(s.endereco), ''), nullif(btrim(s.numero), ''), nullif(btrim(s.complemento), ''),
       nullif(btrim(s.bairro), ''), nullif(btrim(s.cidade), ''), nullif(upper(btrim(s.uf)), ''),
       case when public.normaliza_texto(s.origem) in ('', 'NAO INFORMADO') then null else btrim(s.origem) end,
       nullif(btrim(s.indicacao_original), ''), nullif(btrim(s.convenio), ''), nullif(btrim(s.instagram), ''),
       nullif(btrim(s.data_cadastro), '')::date, nullif(btrim(s.ultima_visita), '')::date,
       u.ultima, nullif(btrim(s.cpf), '') is not null, nullif(btrim(s.observacao), '')
  from staging.staging_pacientes s
  left join (select btrim(cod_paciente) as cod, max(substr(inicio, 1, 10)::date) as ultima
               from staging.staging_atendimentos
              where substr(inicio, 1, 10) >= '2022-10-01'          -- mesma regra do ETL (recência)
              group by 1) u on u.cod = btrim(s.cod_paciente);

-- B3. CPF / RG
insert into public.pacientes_documentos (paciente_id, cpf, rg)
select p.id, nullif(regexp_replace(s.cpf, '\D', '', 'g'), ''), nullif(btrim(s.rg), '')
  from staging.staging_pacientes s
  join public.pacientes p on p.cod_legado_gestaods = btrim(s.cod_paciente)
 where nullif(btrim(s.cpf), '') is not null or nullif(btrim(s.rg), '') is not null;

-- B4. Agendamentos (tipo/status mapeados pelo texto normalizado; valor desconhecido => erro explícito)
insert into public.agendamentos (paciente_id, medico_id, data_hora, tipo, procedimento, convenio, status, primeiro_atendimento, observacao)
select p.id,
       (select m.id from public.medicos m where m.cod_legado_gestaods = '13402'),
       (s.data_hora::timestamp at time zone 'America/Cuiaba'),
       lower(public.normaliza_texto(s.tipo))::public.tipo_agendamento,
       nullif(btrim(s.procedimento), ''), nullif(btrim(s.convenio), ''),
       replace(lower(public.normaliza_texto(s.status)), ' ', '_')::public.status_agendamento,
       lower(btrim(s.primeiro_atendimento))::boolean,
       nullif(btrim(s.observacao), '')
  from staging.staging_agendamentos s
  left join public.pacientes p on p.cod_legado_gestaods = nullif(btrim(s.cod_paciente), '');

-- B5. Atendimentos (prontuário)
insert into public.atendimentos (cod_atendimento_legado, legado_cod_repetido, paciente_id, medico_id, inicio, fim,
                                 servico, tipo_servico, texto_html, texto)
select btrim(s.cod_atendimento),
       count(*) over (partition by btrim(s.cod_atendimento)) > 1,
       p.id,
       (select m.id from public.medicos m where m.cod_legado_gestaods = '13402'),
       (s.inicio::timestamp at time zone 'America/Cuiaba'),
       (nullif(btrim(s.fim), '')::timestamp at time zone 'America/Cuiaba'),
       btrim(s.servico), nullif(btrim(s.tipo_servico), ''), nullif(s.texto_html, ''), nullif(s.texto, '')
  from staging.staging_atendimentos s
  join public.pacientes p on p.cod_legado_gestaods = btrim(s.cod_paciente);

alter table public.pacientes_documentos enable trigger trg_documentos_tem_cpf;
alter table public.atendimentos         enable trigger trg_atendimento_ultima_visita;

-- B6. Catálogo de serviços
insert into public.catalogo_servicos (cod_legado_gestaods, classe, descricao, valor, duracao_min, repasse_pct, ativo)
select btrim(s.cod_tipo),
       lower(public.normaliza_texto(s.classe))::public.classe_catalogo,
       btrim(s.descricao),
       nullif(nullif(btrim(s.valor), '')::numeric, 0),
       nullif(btrim(s.duracao_min), '')::integer,
       nullif(btrim(s.repasse_pct), '')::numeric,
       lower(btrim(s.ativo))::boolean
  from staging.staging_catalogo s;

-- B7. Caixas e categorias financeiras (derivadas dos lançamentos)
insert into public.caixas (nome)
select distinct btrim(caixa) from staging.staging_lancamentos where nullif(btrim(caixa), '') is not null
on conflict (nome) do nothing;

insert into public.categorias_financeiras (tipo, nome)
select distinct lower(btrim(tipo))::public.tipo_lancamento, btrim(categoria)
  from staging.staging_lancamentos where nullif(btrim(categoria), '') is not null
on conflict (tipo, nome) do nothing;

-- B8. Orçamentos
insert into public.orcamentos (
  cod_orcamento_legado, numero, titulo, tipo_orcamento, status, situacao, paciente_id, medico_id, orcado_por_nome,
  data_emissao, valido_ate, data_ganho, data_perda, valor_bruto, valor_liquido)
select btrim(s.cod_orcamento), nullif(btrim(s.numero), ''), nullif(btrim(s.titulo), ''),
       (case when public.normaliza_texto(s.tipo_orcamento) like 'PLANEJAMENTO%' then 'cirurgico'
             when public.normaliza_texto(s.tipo_orcamento) like 'PROCEDIMENTO%'  then 'procedimento'
             else 'outros' end)::public.tipo_orcamento,
       (case public.normaliza_texto(s.status) when 'EM ABERTO' then 'em_aberto' when 'GANHO' then 'ganho' when 'PERDA' then 'perda' end)::public.status_orcamento,
       nullif(lower(public.normaliza_texto(s.situacao)), '')::public.temperatura_orcamento,
       p.id,
       (select m.id from public.medicos m where m.cod_legado_gestaods = '13402'),
       nullif(btrim(s.orcado_por), ''),
       s.criado_em::date, nullif(btrim(s.valido_ate), '')::date,
       nullif(btrim(s.data_ganho), '')::date, nullif(btrim(s.data_perda), '')::date,
       s.valor_bruto::numeric, s.valor_liquido::numeric
  from staging.staging_orcamentos s
  join public.pacientes p on p.cod_legado_gestaods = btrim(s.cod_paciente);

-- B9. Lançamentos (vínculo com paciente por nome normalizado único)
with nomes as (
  select public.normaliza_texto(nome) as n, count(*) as c, (array_agg(id))[1] as id
    from public.pacientes group by 1
)
insert into public.lancamentos (
  tipo, data_pagamento, data_lancamento, prestador, paciente_id, paciente_nome_original, descricao, categoria_id,
  forma_pagamento, caixa_id, valor, valor_liquido, pago, data_anomala, importado_gestaods)
select lower(btrim(s.tipo))::public.tipo_lancamento,
       s.data_pagamento::date, s.data_lancamento::date,
       nullif(btrim(s.prestador), ''),
       case when n.c = 1 then n.id end,
       nullif(btrim(s.paciente_nome), ''),
       nullif(btrim(s.descricao), ''),
       cat.id, nullif(btrim(s.forma_pagamento), ''), cx.id,
       s.valor::numeric, s.valor_liquido::numeric,
       lower(btrim(s.pago))::boolean, lower(btrim(s.data_anomala))::boolean, true
  from staging.staging_lancamentos s
  left join nomes n on nullif(btrim(s.paciente_nome), '') is not null and n.n = public.normaliza_texto(s.paciente_nome)
  left join public.categorias_financeiras cat
         on cat.tipo = lower(btrim(s.tipo))::public.tipo_lancamento and cat.nome = btrim(s.categoria)
  left join public.caixas cx on cx.nome = btrim(s.caixa);

-- B10. Anexos (só metadados)
insert into public.anexos (paciente_id, classe, tipo_documento, nome_arquivo, data_documento, enviado_por,
                           enviado_por_nome_legado, origem_legado)
select p.id, 'clinico', 'arquivo_legado', btrim(s.nome_arquivo), nullif(btrim(s.data_cadastro), '')::date,
       null, nullif(btrim(s.cadastrado_por), ''), 'paciente_arquivos'
  from staging.staging_paciente_arquivos s
  join public.pacientes p on p.cod_legado_gestaods = btrim(s.cod_paciente);

insert into public.anexos (paciente_id, atendimento_id, classe, tipo_documento, data_documento, enviado_por,
                           origem_legado, cod_atendimento_legado)
select p.id, a.id, 'clinico', 'arquivo_legado', nullif(btrim(s.data), '')::date, null,
       'atendimento_arquivos', btrim(s.cod_atendimento)
  from staging.staging_atendimento_arquivos s
  join public.pacientes p on p.cod_legado_gestaods = btrim(s.cod_paciente)
  left join lateral (               -- código legado repetido: escolhe o atendimento do mesmo dia
        select x.id from public.atendimentos x
         where x.cod_atendimento_legado = btrim(s.cod_atendimento) and x.paciente_id = p.id
         order by ((x.inicio at time zone 'America/Cuiaba')::date = nullif(btrim(s.data), '')::date) desc, x.inicio
         limit 1) a on true;

-- B11. CONFERÊNCIA — esperado = contagens/somas lidas dos CSVs de out/clean (backup 05/10/2026)
create temp table conferencia (ordem serial, item text, esperado numeric, obtido numeric) on commit drop;

insert into conferencia (item, esperado, obtido) values
 ('pacientes',                               2191, (select count(*) from public.pacientes where cod_legado_gestaods is not null)),
 ('pacientes com CPF (documentos)',          1564, (select count(*) from public.pacientes_documentos where cpf is not null)),
 ('pacientes_documentos (cpf ou rg)',        1567, (select count(*) from public.pacientes_documentos)),
 ('pacientes.tem_cpf = true',                1564, (select count(*) from public.pacientes where tem_cpf)),
 ('pacientes sem origem (Não informado)',    1507, (select count(*) from public.pacientes where origem is null)),
 ('pacientes com última visita (atend.)',     688, (select count(*) from public.pacientes where ultima_visita_atendimento is not null)),
 ('última visita diverge do CSV',               0, (select count(*) from public.pacientes p join staging.staging_pacientes s on btrim(s.cod_paciente) = p.cod_legado_gestaods
                                                    where p.ultima_visita_atendimento is distinct from nullif(btrim(s.ultima_visita_atendimento), '')::date)),
 ('agendamentos',                            3483, (select count(*) from public.agendamentos)),
 ('agendamentos tipo bloqueio',                 5, (select count(*) from public.agendamentos where tipo = 'bloqueio')),
 ('agendamentos sem paciente',                  5, (select count(*) from public.agendamentos where paciente_id is null)),
 ('agendamentos finalizados',                3257, (select count(*) from public.agendamentos where status = 'finalizado')),
 ('agendamentos cancelados',                   87, (select count(*) from public.agendamentos where status = 'cancelado')),
 ('atendimentos',                            8920, (select count(*) from public.atendimentos)),
 ('atendimentos com código legado repetido',  238, (select count(*) from public.atendimentos where legado_cod_repetido)),
 ('atendimentos Consulta (= soma qtd_consultas do cadastro)',     8252, (select count(*) from public.atendimentos where servico = 'Consulta')),
 ('qtd_consultas do cadastro (CSV)',         8252, (select sum(nullif(btrim(qtd_consultas), '')::int) from staging.staging_pacientes)),
 ('atendimentos Cirurgia',                    276, (select count(*) from public.atendimentos where servico = 'Cirurgia')),
 ('qtd_cirurgias do cadastro (CSV)',          276, (select sum(nullif(btrim(qtd_cirurgias), '')::int) from staging.staging_pacientes)),
 ('atendimentos Procedimento',                268, (select count(*) from public.atendimentos where servico = 'Procedimento')),
 ('qtd_procedimentos do cadastro (CSV)',      268, (select sum(nullif(btrim(qtd_procedimentos), '')::int) from staging.staging_pacientes)),
 ('orcamentos',                               965, (select count(*) from public.orcamentos)),
 ('orcamentos em_aberto',                     605, (select count(*) from public.orcamentos where status = 'em_aberto')),
 ('orcamentos ganho',                         343, (select count(*) from public.orcamentos where status = 'ganho')),
 ('orcamentos perda',                          17, (select count(*) from public.orcamentos where status = 'perda')),
 ('orcamentos soma valor_bruto',      24190613.50, (select sum(valor_bruto) from public.orcamentos)),
 ('orcamentos soma valor_liquido',    21755606.48, (select sum(valor_liquido) from public.orcamentos)),
 ('orcamentos em aberto: soma líquida', 14245981.52, (select sum(valor_liquido) from public.orcamentos where status = 'em_aberto')),
 ('lancamentos',                             2892, (select count(*) from public.lancamentos)),
 ('lancamentos receita (qtd)',               1606, (select count(*) from public.lancamentos where tipo = 'receita')),
 ('lancamentos despesa (qtd)',               1286, (select count(*) from public.lancamentos where tipo = 'despesa')),
 ('receita soma valor (bruto)',        8048916.90, (select sum(valor) from public.lancamentos where tipo = 'receita')),
 ('receita soma valor_liquido',        7948389.07, (select sum(valor_liquido) from public.lancamentos where tipo = 'receita')),
 ('despesa soma valor',                4182390.14, (select sum(valor) from public.lancamentos where tipo = 'despesa')),
 ('receita paga (líquido)',            7697014.59, (select sum(valor_liquido) from public.lancamentos where tipo = 'receita' and pago)),
 ('despesa paga (líquido)',            4130454.70, (select sum(valor_liquido) from public.lancamentos where tipo = 'despesa' and pago)),
 ('receita recebida 2023',             1562182.18, (select sum(valor_liquido) from public.lancamentos where tipo = 'receita' and pago and extract(year from data_pagamento) = 2023)),
 ('receita recebida 2024',             1745094.21, (select sum(valor_liquido) from public.lancamentos where tipo = 'receita' and pago and extract(year from data_pagamento) = 2024)),
 ('receita recebida 2025',             2228855.04, (select sum(valor_liquido) from public.lancamentos where tipo = 'receita' and pago and extract(year from data_pagamento) = 2025)),
 ('receita recebida 2026',             1778670.14, (select sum(valor_liquido) from public.lancamentos where tipo = 'receita' and pago and extract(year from data_pagamento) = 2026)),
 ('lancamentos vinculados a paciente',       1603, (select count(*) from public.lancamentos where paciente_id is not null)),
 ('receitas com nome SEM vínculo',              0, (select count(*) from public.lancamentos where paciente_nome_original is not null and paciente_id is null)),
 ('lancamentos sem categoria',                  0, (select count(*) from public.lancamentos where categoria_id is null)),
 ('lancamentos sem caixa',                      0, (select count(*) from public.lancamentos where caixa_id is null)),
 ('categorias financeiras',                    68, (select count(*) from public.categorias_financeiras)),
 ('caixas',                                     3, (select count(*) from public.caixas)),
 ('catalogo_servicos',                        440, (select count(*) from public.catalogo_servicos)),
 ('catalogo cirurgia',                        329, (select count(*) from public.catalogo_servicos where classe = 'cirurgia')),
 ('catalogo procedimento',                    110, (select count(*) from public.catalogo_servicos where classe = 'procedimento')),
 ('catalogo exame',                             1, (select count(*) from public.catalogo_servicos where classe = 'exame')),
 ('catalogo sem valor (NULL)',                193, (select count(*) from public.catalogo_servicos where valor is null)),
 ('catalogo soma valor',               5702681.30, (select sum(valor) from public.catalogo_servicos)),
 ('anexos (paciente + atendimento)',         8529, (select count(*) from public.anexos)),
 ('anexos de paciente_arquivos',             2591, (select count(*) from public.anexos where origem_legado = 'paciente_arquivos')),
 ('anexos de atendimento_arquivos',          5938, (select count(*) from public.anexos where origem_legado = 'atendimento_arquivos')),
 ('anexos de atendimento sem atendimento_id',   0, (select count(*) from public.anexos where origem_legado = 'atendimento_arquivos' and atendimento_id is null)),
 ('auditoria gerada pela carga (deve ser 0)',   0, (select count(*) - (select n from _aud_antes) from public.auditoria));

-- Confere se as views reproduzem os números do painel (dados.json) para "hoje" = 05/10/2026.
set local app.hoje = '2026-10-05';
insert into conferencia (item, esperado, obtido)
select * from (values
 ('vw_recencia: até 3 meses',                93, (select coalesce(sum(qtd), 0) from public.vw_recencia_pacientes where faixa = 'até 3 meses')),
 ('vw_recencia: 12–24 meses',               190, (select coalesce(sum(qtd), 0) from public.vw_recencia_pacientes where faixa = '12–24 meses')),
 ('vw_recencia: sem atendimento desde out/22', 1503, (select coalesce(sum(qtd), 0) from public.vw_recencia_pacientes where faixa = 'sem atendimento desde out/22')),
 ('vw_aging_orcamentos: mais de 1 ano (qtd)', 547, (select coalesce(sum(qtd), 0) from public.vw_aging_orcamentos where faixa = 'mais de 1 ano')),
 ('vw_aging_orcamentos: até 30 dias (qtd)',    3, (select coalesce(sum(qtd), 0) from public.vw_aging_orcamentos where faixa = 'até 30 dias')),
 ('vw_a_receber_atrasado: atrasado (qtd)',    74, (select coalesce(sum(qtd), 0) from public.vw_a_receber_atrasado where situacao = 'atrasado')),
 ('vw_a_receber_atrasado: atrasado (R$)', 218440.56, (select coalesce(sum(valor), 0) from public.vw_a_receber_atrasado where situacao = 'atrasado')),
 ('vw_agenda_mensal: finalizados',          3257, (select coalesce(sum(finalizados), 0) from public.vw_agenda_mensal)),
 ('vw_agenda_mensal: sem baixa',             134, (select coalesce(sum(sem_baixa), 0) from public.vw_agenda_mensal)),
 ('vw_origem_pacientes: Não informado',     1507, (select coalesce(sum(total_pacientes), 0) from public.vw_origem_pacientes where origem = 'Não informado')),
 ('vw_origem_pacientes: novos desde 2023 (todas as origens)', 2191 - 1528, (select coalesce(sum(novos_desde_2023), 0) from public.vw_origem_pacientes))
) as v(item, esperado, obtido)
where to_regclass('public.vw_recencia_pacientes') is not null;   -- só se o 003 foi aplicado

-- Resultado legível (cada linha deve ter status OK):
select ordem, item, esperado, obtido, case when abs(esperado - coalesce(obtido, -1)) < 0.005 then 'OK' else '*** DIVERGE ***' end as status
  from conferencia order by ordem;

do $$
declare n integer;
begin
  select count(*) into n from conferencia where abs(esperado - coalesce(obtido, -1)) >= 0.005;
  if n > 0 then
    raise exception 'CONFERÊNCIA FALHOU em % item(ns). Nada foi gravado (rollback). Veja a tabela acima.', n;
  end if;
end $$;

-- B12. Sucesso: remove a cópia dos dados pessoais em staging e confirma.
drop schema staging cascade;
commit;
-- <<< FIM PARTE B ------------------------------------------------------------------

-- Próximos passos (docs/SETUP-VERCEL-SUPABASE-GIT.md): criar usuários e perfis, ligar medicos.usuario_id,
-- preencher o CRM, apagar os CSVs do computador, subir os arquivos legados para o Storage (anexos.storage_path).
