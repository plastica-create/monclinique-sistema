# Qualidade de dados — backup Gestão DS 05/10/2026

Gerado por `etl/build_dataset.py`. Cada item é um problema real encontrado nos dados de origem.

1. pacientes: 627 sem CPF, 295 sem celular, 988 sem e-mail, 570 sem data de nascimento válida.
2. pacientes: origem 'Não informado' = 1507 (69%); valor 'Desativar' no campo Indicação (794) é resíduo de configuração, não é origem real.
3. pacientes: 1528 cadastros em 2022 são carga inicial (início do Gestão DS em out/22), não captação — excluídos das séries de novos pacientes.
4. agenda: 134 agendamentos passados sem baixa (Não confirmado/Confirmado/Em espera) — ou faltaram ou a recepção não deu baixa; distorce a taxa de comparecimento.
5. agenda: 5 bloqueios de horário e 5 registros sem código de paciente.
6. atendimentos: 5492 registros anteriores a out/2022 (histórico importado de outro sistema, 2013–2022).
7. atendimentos: 238 linhas com código de atendimento repetido (116 códigos em 238 linhas, com data e texto diferentes: são atendimentos distintos numerados igual — o banco usa chave própria); 61 registros sem texto clínico útil (1%).
8. pacientes: campo 'Última Visita' do cadastro vazio em 1515 pacientes; a recência do painel foi recalculada a partir da data do último atendimento no prontuário.
9. orçamentos: 303 dos 343 ganhos têm a mesma 'Data Ganho' (29/04/2026) — fechamento em lote/retroativo; não usar 'Data Ganho' para medir ritmo de vendas.
10. orçamentos: 0 orçamentos Ganho sem 'Data Ganho'.
11. orçamentos: 605 'Em aberto' somam R$ 14,245,982; 547 têm mais de 1 ano — a maioria é lead morto nunca baixado, só 17 foram marcados como Perda. Taxa de conversão sobre 'fechados' (95.28%) está inflada por isso.
12. financeiro: 1 lançamento(s) com data de pagamento no ano 2103 (digitação; lançamento é 10/10/2023) — corrigido para o ano do lançamento no tratamento.
13. financeiro: 3 receita(s) com pagamento em 2021 anterior ao lançamento em 12/2022 (data de pagamento incoerente).
14. financeiro: despesas só estão lançadas no Gestão DS até 2025-09; a partir de lá o módulo registra só receita. Resultado/lucro de 2026 precisa vir do Conta Azul ou da contabilidade.
15. financeiro: 6 receita(s) marcadas como pagas com data futura; 74 receitas não pagas já vencidas somam R$ 218,440.56.
16. financeiro: 100.0% das receitas com nome de paciente casaram com o cadastro (vínculo por nome, pois o financeiro não traz o código do paciente — risco de homônimos).
17. catálogo: 193 de 440 itens sem valor na tabela de preços; 372 com duração padrão de 30 min (cirurgias de 4h aparecem como 30 min — duração não confiável).
18. anexos: 5938 arquivos de atendimento + 2591 de paciente aparecem só como link S3 assinado no backup (os arquivos em si não vieram); links expiram — é preciso baixar os documentos pelo Gestão DS antes de desligar o sistema.
