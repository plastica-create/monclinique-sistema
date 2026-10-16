# Dicionário de dados — Mon Clinique

Banco: Postgres (Supabase), schema `public`. Estrutura em `db/001_schema.sql`; acesso em `db/002_rls.sql`; carga em `db/004_carga.sql`.
Origem: backup CSV do **Gestão DS de 05/10/2026**, tratado por `etl/build_dataset.py` → `out/clean/*.csv` → carga.
Contagens abaixo = linhas carregadas (conferidas pela carga). "—" = sem origem (coluna nova do sistema).
Tipos comuns em todas as tabelas: `id uuid` (PK, `gen_random_uuid()`), `created_at`/`updated_at timestamptz` (trigger).
Qualidade geral dos dados: ver `out/qualidade.md`.

**Enums:** `papel_usuario` (admin, medico, comercial, recepcao, financeiro) · `status_agendamento` (nao_confirmado, confirmado, em_espera, em_atendimento, finalizado, cancelado, faltou) · `tipo_agendamento` (consulta, retorno, procedimento, cirurgia, exame, bloqueio) · `status_orcamento` (em_aberto, ganho, perda) · `temperatura_orcamento` (quente, morno, frio) · `tipo_orcamento` (cirurgico, procedimento, outros) · `tipo_lancamento` (receita, despesa) · `classe_catalogo` (cirurgia, procedimento, exame) · `tipo_consentimento` (tratamento_dados_saude, uso_imagem, gravacao_audio, comunicacao_marketing, compartilhamento_terceiros, termo_cirurgico, outro) · `canal_consentimento` (presencial_papel, assinatura_digital, whatsapp, site_app, telefone, outro) · `classe_anexo` (clinico, administrativo, financeiro) · `status_lead` (aberto, ganho, perdido).

---

## pacientes — 2.191 linhas (fonte: `pacientes.csv`)
Acesso: leitura admin/comercial/recepção/financeiro; médico só os seus. Sem CPF/RG (ver `pacientes_documentos`).

| Coluna | Tipo | Origem Gestão DS | Observações / qualidade |
|---|---|---|---|
| `cod_legado_gestaods` | text, UNIQUE | `Cod Paciente` | Rastreabilidade. Nulo para pacientes novos. Único e sempre preenchido na carga. |
| `nome` | text NOT NULL | `Nome Paciente` | 19 nomes (normalizados) aparecem em 2+ cadastros (39 linhas): **homônimos/duplicatas** — por isso o vínculo do financeiro por nome só vale para nome único. |
| `data_nascimento` | date | `Nascimento` | 570 nulos (26%). Check: entre 1900-01-01 e hoje. |
| `sexo` | text (F/M/O) | `Sexo` | 608 nulos (28%); só F e M existem. |
| `estado_civil`, `ocupacao` | text | `Estado Civil`, `Ocupacao` | Muito vazios (1.604 e 779 nulos). Texto livre. |
| `email` | text | `E-mail` | 988 nulos; sem validação de formato (dados sujos). |
| `telefone`, `celular` | text | `Telefone`, `Celular` | Formato misto (8, 9, 11 dígitos; alguns com máscara). 295 sem celular; 2.064 sem telefone. Normalizar para E.164 antes de integrar WhatsApp. |
| `cep`, `endereco`, `numero`, `complemento`, `bairro` | text | idem | Endereço incompleto em ~27% (849 sem CEP). |
| `cidade` | text | `Cidade` | Normalizada pelo ETL (Cuiabá, Várzea Grande); 595 nulos. |
| `uf` | text (2 letras) | `UF` | 614 nulos; MT = 1.530. |
| `origem` | text | `Indicacao` (normalizada) | **NULL = "Não informado": 1.507 (69%).** Valor "Desativar" no campo original era resíduo de configuração. Categorias: Instagram, Google, Facebook, Internet / site, Rede do Dr. Fabrício, Indicação de médico, Indicação de paciente / amigo, Outros. |
| `indicacao_original` | text | `Indicacao` | Texto livre original (preserva quem indicou). |
| `convenio` | text | `Convenio` | 2.147 nulos (particular); CORTESIA 37, Unimed 7. |
| `instagram` | text | `Instagram` | 2.189 nulos (praticamente não usado). |
| `medico_responsavel_id` | uuid → medicos | — | Não preenchido na carga (decisão: não inventar vínculo); médico enxerga pelo histórico. |
| `data_cadastro` | date | `Data Cadastro` | **1.528 cadastros de 2022 são a carga inicial do Gestão DS (out/22), não captação** — views usam ≥ 2023-01-01 para "novos". |
| `ultima_visita_gestaods` | date | `Ultima Visita` | Vazio em 1.515 (69%): campo não confiável, mantido só como legado. |
| `ultima_visita_atendimento` | date | derivado de `atendimentos` | Último atendimento ≥ 2022-10-01 (regra do ETL). 688 preenchidos; 1.503 "sem atendimento desde out/22". Mantido por trigger. Base de `vw_recencia_pacientes`. |
| `tem_cpf` | boolean | derivado | Espelha `pacientes_documentos` (1.564 true). Permite à recepção saber se há CPF sem ler. |
| `observacao` | text | `Observacao` | 1.482 preenchidos; pode conter informação sensível — não usar para clínica. |
| `ativo`, `arquivado_em` | boolean, timestamptz | — | Arquivamento lógico (não apagar paciente com prontuário). |
| `criado_por` | uuid | — | `auth.uid()` de quem cadastrou (nulo na carga). |
| *(descartados)* | — | `Consultas`, `Cirurgias`, `Exames`, `Procedimentos` | Contadores derivam de `atendimentos`; conferidos: 8.252 / 276 / 268 batem com a tabela de atendimentos. |

## pacientes_documentos — 1.567 linhas
Acesso: leitura admin, financeiro e médico do paciente; recepção/comercial **só inserem**; alteração só admin.

| Coluna | Tipo | Origem | Observações |
|---|---|---|---|
| `paciente_id` | uuid PK/FK → pacientes | — | CASCADE ao apagar o paciente. |
| `cpf` | text (11 dígitos) | `CPF` | 1.564 preenchidos; **todos passam no dígito verificador**; 627 pacientes sem CPF. **14 CPFs repetidos** em pacientes diferentes (15 cadastros excedentes) → provável cadastro duplicado; por isso sem UNIQUE. |
| `rg` | text | `RG` | 1.150 preenchidos; formato livre. |

## medicos — 1 linha na carga
| Coluna | Tipo | Origem | Observações |
|---|---|---|---|
| `usuario_id` | uuid UNIQUE → auth.users | — | Ligar após criar o login. |
| `nome`, `crm`, `uf_crm`, `especialidade` | text | — | Carga cria só o nome; **CRM a preencher**. |
| `cod_legado_gestaods` | text UNIQUE | `cod_medico` 13402 | Único médico do backup. |
| `ativo` | boolean | — | |

## perfis · config_seguranca
- `perfis`: `id` (= `auth.users.id`), `papel`, `nome`, `ativo`. Criado manualmente (sem perfil = sem acesso).
- `config_seguranca`: linha única; `exigir_mfa_admin_medico boolean` (padrão false).

## agendamentos — 3.483 linhas (fonte: `agendamentos.csv`)
| Coluna | Tipo | Origem | Observações |
|---|---|---|---|
| `paciente_id` | uuid → pacientes | `Cod Paciente` | Nulo só em `bloqueio` (5 registros = os 5 bloqueios). Check garante. |
| `medico_id` | uuid → medicos | — | Todos = médico 13402 na carga. |
| `data_hora` | timestamptz | `Data Agendamento` | Interpretado como **America/Cuiaba**. 2022-10-26 → 2026-10-02. |
| `fim` | timestamptz | — | Gestão DS não exportou término. |
| `tipo` | tipo_agendamento | `Tipo` | retorno 2.259 · consulta 635 · procedimento 298 · cirurgia 284 · bloqueio 5 · exame 2. |
| `procedimento` | text | `Tipos` | Texto livre; 2.899 nulos. |
| `convenio` | text | `Convênio` | Particular / Interno (clínica) / CORTESIA. |
| `status` | status_agendamento | `Status` | finalizado 3.257 · cancelado 87 · nao_confirmado 89 · confirmado 30 · em_espera 20 (inclui os 5 bloqueios em nao_confirmado). **134 agendamentos passados sem baixa** (ou faltaram ou a recepção não deu baixa) distorcem a taxa de comparecimento. `faltou` e `em_atendimento` são novos, sem histórico. |
| `primeiro_atendimento` | boolean | `Primeiro Atendimento` | 550 verdadeiros. |
| `observacao` | text | `OBS` | 347 preenchidos (até 783 caracteres); visível à recepção. |
| Sem chave natural | | | 10 linhas repetem (paciente, data/hora, tipo): conferir se são agendamentos duplicados. |

## atendimentos — 8.920 linhas (prontuário; fonte: `atendimentos.csv`)
Acesso: admin e médico (do próprio). **Texto clínico só por RPC auditada**; sem DELETE.

| Coluna | Tipo | Origem | Observações |
|---|---|---|---|
| `cod_atendimento_legado` | text (NÃO único) | `Cod Atendimento` | **122 códigos "repetidos" (116 códigos em 238 linhas).** Verificado: são atendimentos **diferentes** (data/texto distintos) com o mesmo código no Gestão DS — não duplicatas (o aviso do `qualidade.md` diz "mesmo atendimento exportado mais de uma vez": **não é o que os dados mostram**). Decisão: PK uuid própria; código só informativo. |
| `legado_cod_repetido` | boolean | derivado | true nas 238 linhas (para revisão). |
| `paciente_id` | uuid NOT NULL → pacientes | `Cod Paciente` | 0 órfãos. |
| `medico_id` | uuid NOT NULL → medicos | — | Todos = 13402. |
| `agendamento_id` | uuid → agendamentos | — | Sem vínculo no Gestão DS; para uso futuro. |
| `inicio`, `fim` | timestamptz | `Data start`, `Data end` | America/Cuiaba. 2013-07-05 → 2026-10-02. **5.492 registros anteriores a out/2022** = histórico importado de outro sistema. |
| `servico` | text | `Serviço` | Consulta 8.252 · Cirurgia 276 · Procedimento 268 · Observação Consulta/Cirurgia/Procedimento 85/22/15 · Exame 2. |
| `tipo_servico` | text | `Tipo Serviço` | Nome da cirurgia/procedimento (213 valores distintos, sem padronização). |
| `texto_html` | text | `HTML` | Evolução com formatação (até ~16 mil caracteres). 25 vazios. |
| `texto` | text | `Texto Limpo` | Texto puro. 26 vazios; **61 (1%) sem texto clínico útil** (< 20 caracteres). |

## orcamentos — 965 linhas (fonte: `orcamentos.csv`)
| Coluna | Tipo | Origem | Observações |
|---|---|---|---|
| `cod_orcamento_legado` | text UNIQUE | `Cod Orcamento` | |
| `numero` | text (único se não nulo) | `Numero` | |
| `titulo` | text | `Titulo` | 37 variações de texto livre. |
| `tipo_orcamento` | tipo_orcamento | derivado de `Titulo` (ETL) | cirurgico 904 · procedimento 39 · outros 22. |
| `status` | status_orcamento | `Status` | em_aberto 605 · ganho 343 · perda 17. **Só 17 perdas baixadas: a maioria dos 605 "em aberto" é lead morto** (547 têm > 1 ano); a taxa de conversão sobre "fechados" (95%) é inflada. |
| `situacao` | temperatura_orcamento | `Situacao` | frio 715 · quente 245 · morno 5. |
| `paciente_id` | uuid NOT NULL → pacientes | `Cod Paciente` | |
| `medico_id` | uuid → medicos | — | Todos = 13402. |
| `orcado_por_nome` | text | `Orcado Por` | 3 pessoas (equipe comercial e o médico). `orcado_por_usuario_id` fica nulo (vincular aos logins depois). |
| `data_emissao` | date | `Criado Em` | |
| `valido_ate` | date | `Valido Ate` | Check: ≥ emissão (0 violações). |
| `data_ganho`, `data_perda` | date | `Data Ganho`, `Data Perda` | **303 ganhos com data 29/04/2026** (fechamento em lote/limpeza): não usar `data_ganho` para ritmo de vendas. Check: ganho exige data_ganho; perda exige data_perda. |
| `valor_bruto`, `valor_liquido` | numeric(14,2) | `Valor Total`, `Valor Total Com Desconto` | Totais: R$ 24.190.613,50 bruto / R$ 21.755.606,48 líquido; em aberto líquido R$ 14.245.981,52. 502 têm desconto. Check: líquido ≤ bruto. |
| `motivo_perda`, `observacao` | text | — | Novos. |

## orcamento_itens — 0 linhas
O backup não trouxe itens. `orcamento_id`, `catalogo_id`, `descricao`, `quantidade`, `valor_unitario`, `desconto`, `valor_total` (coluna gerada = quantidade × unitário − desconto).

## lancamentos — 2.892 linhas (fonte: `financeirov2.csv`)
Acesso: admin e financeiro.

| Coluna | Tipo | Origem | Observações |
|---|---|---|---|
| `tipo` | tipo_lancamento | `R/D` | receita 1.606 · despesa 1.286. |
| `data_pagamento` | date | `Pagamento` | **Pago: data efetiva; não pago: vencimento.** 1 ano digitado como 2103 (corrigido pelo ETL para o ano do lançamento). 3 receitas com pagamento em 2021 anterior ao lançamento → `data_anomala = true`. |
| `data_lancamento` | date | `Lancamento` | 2022-10-26 → 2026-09-30. |
| `prestador` | text | `Prestador` | Só nas receitas; um único valor constante (não informativo). |
| `paciente_id` | uuid → pacientes | derivado do nome | **O Gestão DS não traz código do paciente.** Vínculo por nome normalizado só quando único: 1.603 receitas vinculadas (100% das que têm nome); risco residual de homônimo. Despesas: nulo. |
| `paciente_nome_original` | text | `Paciente` | Nome como veio (rastreio do vínculo). |
| `orcamento_id` | uuid → orcamentos | — | Não existia no Gestão DS; vincular daqui para frente. |
| `descricao` | text | `Descrição` | |
| `categoria_id` | uuid → categorias_financeiras | `Categoria` | 68 pares (tipo, categoria); 5 nomes existem como receita e despesa. |
| `forma_pagamento` | text | `F. Pagamento` | Pix 1.333 · Boleto 710 · Cartão crédito 384 · Cortesia 124 · Transferência 120 · Cartão débito 89 · outras. |
| `caixa_id` | uuid → caixas | `Caixa` | Almeida Medicina 2.726 · Condomínio Mon'Clinique 158 · Dr Fabrício Almeida 8. |
| `valor` | numeric(14,2) | `Valor` | Bruto. Receita: R$ 8.048.916,90 · despesa: R$ 4.182.390,14. 121 com valor zero (cortesias/permutas). |
| `valor_liquido` | numeric(14,2) | `Valor real` | Após taxa de cartão. Receita: R$ 7.948.389,07. Check: líquido ≤ bruto nas receitas. |
| `pago` | boolean | `Pago` | Receita paga R$ 7.697.014,59; **74 receitas vencidas e não pagas = R$ 218.440,56** (a 05/10/2026). |
| `importado_gestaods` | boolean | — | true na carga. |
| **Limitação** | | | **Despesas só existem até 2025-09**; depois o módulo registra só receita. Resultado/lucro 2026 deve vir do Conta Azul/contabilidade. |

## catalogo_servicos — 440 linhas (fonte: `tipos_cirurgia/procedimento/exame.csv`)
| Coluna | Tipo | Origem | Observações |
|---|---|---|---|
| `cod_legado_gestaods` | text UNIQUE | `Cod Tipo` | Único entre as 3 classes. |
| `classe` | classe_catalogo | arquivo de origem | cirurgia 329 · procedimento 110 · exame 1. |
| `descricao` | text | `Descricao` | |
| `valor` | numeric(14,2) | `Valor` | **NULL = sem preço: 193 de 440 (44%)** (valor 0 na origem). Soma da tabela com preço: R$ 5.702.681,30. |
| `duracao_min` | integer | `Duracao (min)` | **Não confiável:** 372 itens com 30 min padrão (cirurgias de 4 h aparecem como 30). |
| `repasse_pct` | numeric(5,2) | `Porcentagem Repasse` | Quase tudo 0; máx 2,0 (1 item). |
| `ativo` | boolean | `Ativo` | Todos ativos. |

## caixas · categorias_financeiras
- `caixas(nome UNIQUE, ativo)`: 3 linhas, derivadas de `lancamentos.caixa`.
- `categorias_financeiras(tipo, nome, ativo; UNIQUE tipo+nome)`: 68 linhas, derivadas de `lancamentos.categoria`.

## anexos — 8.529 linhas (só metadados)
Fontes: `pacientes_arquivos.csv` (2.591) e `atendimentos_arquivos.csv` (5.938). A **URL assinada do S3 foi descartada de propósito** (expira e dá acesso ao documento).

| Coluna | Tipo | Origem | Observações |
|---|---|---|---|
| `paciente_id` | uuid NOT NULL | `Cod Paciente` | |
| `atendimento_id` | uuid → atendimentos | `Cod Atendimento` | Resolvido por (código + paciente + data); 5.938/5.938 vinculados (só 739 atendimentos distintos: vários arquivos por atendimento). Código legado repetido: escolhe o atendimento do mesmo dia. |
| `classe` | classe_anexo | — | Carga = `clinico` (mais restrita) até reclassificar. Define quem vê (arquivo e Storage). |
| `tipo_documento` | text | — | `arquivo_legado` na carga. |
| `nome_arquivo` | text | `Nome Arquivo` | Só em arquivos de paciente (2.473 PDF, 65 DOCX, 41 JPEG, 8 JPG, 3 DOC, 1 MP4). Anexos de atendimento **não têm nome**. |
| `storage_bucket`, `storage_path` | text | — | Bucket `anexos`. **`storage_path` nulo = arquivo ainda não migrado** (todos, na carga). Check: caminho começa por `{paciente_id}/{classe}/`. |
| `arquivo_disponivel` | boolean (gerada) | — | `storage_path is not null`. |
| `data_documento` | date | `Data Cadastro` / `Data` | |
| `enviado_por`, `enviado_por_nome_legado` | uuid, text | `Cadastrado Por` | Nome textual do funcionário no Gestão DS (4 pessoas). |
| `origem_legado`, `cod_atendimento_legado` | text | — | Rastreio. |
| `mime_type`, `tamanho_bytes`, `sha256`, `orcamento_id` | | — | Novos; preencher ao subir o arquivo. |

## consentimentos — 0 linhas (novo; LGPD)
`paciente_id`, `tipo`, `versao_termo`, `aceito` (false = recusa registrada), `aceito_em`, `canal`, `revogado_em`, `motivo_revogacao`, `anexo_id` (termo assinado), `observacao`, `registrado_por`. Vigente = `aceito and revogado_em is null`. **Nenhum consentimento existe no Gestão DS**: coletar (tratamento, imagem, Plaud, marketing) nos próximos atendimentos.

## leads — 0 linhas (espelho do Black CRM)
`crm_id_externo` UNIQUE, `nome`, `telefone`, `email`, `origem`, `campanha`, `etapa` (texto como no CRM), `status` (aberto/ganho/perdido), `valor`, `responsavel_nome`, `paciente_id` (quando vira paciente), datas de entrada/interação/fechamento, `motivo_perda`. Sincronizar por integração; **não gravar dado clínico**.

## auditoria — append-only
`id` (bigint identity), `ocorrido_em`, `usuario_id`, `papel`, `acao` (update / delete / leitura / exportacao), `tabela`, `registro_id`, `paciente_id`, `campos_alterados`, `dados_antes`/`dados_depois` (só os campos alterados; **CPF/RG mascarados**), `finalidade`, `ip`, `user_agent`. Preenchida por trigger (UPDATE/DELETE de tabelas sensíveis) e pelos RPC `ler_prontuario`, `ler_atendimento`, `registrar_leitura_prontuario`, `registrar_exportacao`. Leitura só admin. Carga inicial gera 0 linhas.

---

## Views do dashboard (`003_views.sql`) — sem dado pessoal, `security_invoker = true`
| View | Conteúdo | Regra do ETL reproduzida |
|---|---|---|
| `vw_agenda_mensal` | por mês/médico: total, finalizados, cancelados, faltas, sem baixa, por tipo, 1º atendimento, taxas | agenda passada (≤ hoje), sem bloqueios; sem baixa = nao_confirmado/confirmado/em_espera/em_atendimento |
| `vw_orcamentos_funil` | mês de emissão × tipo × status × temperatura: qtd, bruto, líquido | coorte por criação |
| `vw_aging_orcamentos` | em aberto por faixa (até 30, 31–90, 91–180, 181–365, > 1 ano) × temperatura; quanto passou da validade | idade = hoje − emissão |
| `vw_receita_mensal` | recebida (líquida e bruta), lançada, despesa paga, resultado de caixa, a receber | recebida = pago por mês de `data_pagamento`; **despesa incompleta após 2025-09** |
| `vw_a_receber_atrasado` | receitas não pagas: a vencer e atrasadas por faixa (≤30, 31–90, 91–365, > 1 ano) | atrasado = vencimento < hoje |
| `vw_origem_pacientes` | pacientes por origem, novos desde 2023, orçamentos ganhos | 2022 = carga inicial, excluído de "novos" |
| `vw_recencia_pacientes` | faixas até 3 / 3–6 / 6–12 / 12–24 / > 24 meses / sem atendimento; `reativavel` (6–24 m) | meses = dias / 30,44 |

"Hoje" = `hoje_clinica()` (data em Cuiabá). Para reproduzir o painel do backup: `set app.hoje = '2026-10-05';` — a carga confere 11 números das views contra o `dados.json` (ex.: 547 orçamentos > 1 ano; 74 receitas atrasadas = R$ 218.440,56; 1.503 pacientes sem atendimento desde out/22).
