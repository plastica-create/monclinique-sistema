# Sistema Mon Clinique — pacote de migração do Gestão DS

Preparado em 06/10/2026 a partir do backup do Gestão DS de 05/10/2026 (pasta `../Backup-GestaoDS-05-10-26`, 18 CSVs).
**Nada aqui foi aplicado em produção.** Contas Vercel, Git e Supabase estão sendo criadas pelo cliente.

## O que tem

| Pasta / arquivo | O que é | Contém dado pessoal? |
|---|---|---|
| `etl/build_dataset.py` | Lê o backup, limpa e normaliza, gera agregados e tabelas limpas | gera ambos |
| `out/dados.json`, `out/dados.js` | Números agregados (alimentam o painel) | **não** |
| `out/qualidade.md` | Problemas reais encontrados nos dados de origem | não |
| `out/clean/*.csv` | Tabelas limpas prontas para carga no Supabase | **SIM — nunca versionar** |
| `etl/build_painel.py` + `painel/` | Monta `../MVP-Consolidado-Mon-Clinique-v2.html` | não |
| `Painel-Operacional-LOCAL.html` | Mesa de trabalho com nomes e telefones; carrega os CSVs no navegador, offline | só em memória, na sua máquina |
| `db/` | SQL do Supabase: schema, RLS por perfil, views, carga | não |
| `docs/` | Setup Vercel + Supabase + Git, LGPD, dicionário de dados | não |
| `app/` | Sistema web (Next.js + Supabase). Como rodar e publicar: `app/README.md` | não |
| `db/005_app.sql`, `db/tests/` | Funções do app; teste automático da RLS com dados fictícios | não |

## Atualizar tudo quando chegar um novo backup

```bash
cd sistema
python etl/build_dataset.py "../Backup-GestaoDS-DD-MM-AA"   # agregados + tabelas limpas
python etl/build_painel.py                                   # gera o MVP v2 em ../
```

Requisitos: Python 3.11+ com `pandas` e `numpy`. Ajuste a constante `HOJE` em `build_dataset.py` para a data do novo backup.

## Regras de ouro (LGPD)

1. `out/clean/` e a pasta de backup têm dado de saúde (CPF, RG, prontuário). Ficam só na máquina do consultor/da clínica.
2. O arquivo `MVP-Consolidado-Mon-Clinique-v2.html` é seguro para enviar: só números agregados.
3. O `Painel-Operacional-LOCAL.html` **nunca** é publicado com dados carregados.
4. Antes de subir `out/clean/` para o Supabase: RLS ligada, usuários por papel, MFA para admin/médico (ver `docs/`).
5. Os anexos (8.529 arquivos) vieram só como link temporário do S3. Baixar pelo Gestão DS **antes** de desligá-lo.

## Achados principais (detalhe no painel v2)

- **Receita:** Gestão DS recebido Out/25–Jun/26 = R$ 1,91 mi, contabilidade = R$ 1,98 mi, Conta Azul = R$ 1,04 mi. O Conta Azul está incompleto.
- **Orçamentos:** 605 "em aberto" somam R$ 14,2 mi, mas 547 têm mais de 1 ano; pipeline real ≈ 36 orçamentos / R$ 1,5 mi. Só 17 perdas registradas.
- **Agenda:** 14 cancelamentos nos últimos 90 dias contra 1 nos 90 anteriores.
- **Cadastro:** 69% dos pacientes sem origem registrada (campo "Desativar").
- **A receber vencido:** R$ 218 mil (R$ 140 mil com mais de 1 ano).
