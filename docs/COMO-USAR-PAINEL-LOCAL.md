# Painel Operacional LOCAL (Mon Clinique)

Arquivo: `sistema/Painel-Operacional-LOCAL.html` (um único arquivo, funciona offline).

## Como usar
1. Abra o arquivo no Chrome ou Edge (duplo clique).
2. Clique em **Carregar dados** (ou arraste os arquivos para a janela) e selecione, de `sistema/out/clean/`:
   `pacientes.csv`, `agendamentos.csv`, `orcamentos.csv`, `lancamentos.csv` e `catalogo.csv`.
   O `atendimentos.csv` (texto clínico) não é necessário e é ignorado.
3. Ajuste a **data de referência** se precisar (padrão: 05/10/2026, data do backup).

## Privacidade (LGPD)
- Nenhum dado está dentro do HTML. Tudo é lido e processado só na aba aberta; ao fechar, some.
- A página bloqueia conexões de rede (CSP `connect-src 'none'`); só as fontes do Google Fonts são buscadas, com fallback.
- Não salve, envie nem publique este arquivo com dados carregados. Os CSVs exportados pelos botões contêm dados pessoais: guarde em local restrito e apague após o uso.
- Links de WhatsApp contêm só o número (`wa.me/55...`); a mensagem-modelo é copiada para colar manualmente.

## Telas
Hoje/Semana, Follow-up comercial, Reativação, A receber, Paciente 360, Aniversariantes e Qualidade de cadastro. Os modelos de mensagem são editáveis (guardados só neste navegador). "Contatado" vale só para a sessão aberta; exporte antes de fechar.
