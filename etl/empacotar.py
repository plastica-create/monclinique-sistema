#!/usr/bin/env python3
"""
Gera os ZIPs do pacote (na pasta do projeto):

  python etl/empacotar.py             -> ZIP OFFLINE sem dado pessoal (pode ser enviado livremente)
  python etl/empacotar.py --completo  -> ZIP COMPLETO com senha AES-256: inclui os 5 CSVs limpos
                                         para o Painel-Operacional-LOCAL. Senha gravada em arquivo à parte.

O ZIP completo NÃO leva: backup original, atendimentos.csv (texto clínico), anexos, nem lançamentos de arquivos.
O ZIP sem dados falha se achar CSV ou nome de paciente dentro do pacote.
"""
import secrets
import string
import sys
import zipfile
from pathlib import Path

import pandas as pd
import pyzipper

RAIZ = Path(__file__).resolve().parent.parent
PROJ = RAIZ.parent
COMPLETO = "--completo" in sys.argv
NOME = "Mon-Clinique-Sistema-COMPLETO-2026-10-06.zip" if COMPLETO else "Mon-Clinique-Sistema-OFFLINE-2026-10-06.zip"
DESTINO = PROJ / NOME
CSVS_LOCAL = ["pacientes.csv", "agendamentos.csv", "orcamentos.csv", "lancamentos.csv", "catalogo.csv"]

arquivos = [PROJ / "MVP-Consolidado-Mon-Clinique-v2.html", PROJ / "GUIA-DE-USO-Mon-Clinique.html",
            PROJ / "RELATORIO-Simples-Mon-Clinique.html", PROJ / "INSTRUCOES-CLAUDE-Mon-Clinique.md",
            PROJ / "INSTALAR-NO-CLAUDE-Mon-Clinique.md",
            RAIZ / "Painel-Operacional-LOCAL.html", RAIZ / "README.md", RAIZ / ".gitignore"]
for sub in ("etl", "db", "docs", "painel"):
    arquivos += [p for p in (RAIZ / sub).rglob("*") if p.is_file() and "__pycache__" not in p.parts]
arquivos += [RAIZ / "out" / n for n in ("dados.json", "dados.js", "qualidade.md")]

LEIA_ME = f"""MON CLINIQUE — PACOTE {'COMPLETO (COM DADOS PESSOAIS — CONFIDENCIAL)' if COMPLETO else 'OFFLINE (SEM DADOS PESSOAIS)'} — 06/10/2026
=================================================================

NADA aqui precisa de internet.

COMECE POR AQUI
  1) Leia GUIA-DE-USO-Mon-Clinique.html (como abrir e usar tudo) e, se quiser um resumo de uma página, RELATORIO-Simples-Mon-Clinique.html
  2) Painel de números (dois cliques, Chrome ou Edge):  MVP-Consolidado-Mon-Clinique-v2.html
     Todo KPI e gráfico tem link direto (aba "Índice de links").
  3) Visita guiada pelo Claude: anexe INSTRUCOES-CLAUDE-Mon-Clinique.md e escreva "Siga as instruções do arquivo e me guie pelo painel."
     Assistente permanente no seu Claude: siga INSTALAR-NO-CLAUDE-Mon-Clinique.md
  4) Mesa de trabalho com nomes e telefones:  sistema/Painel-Operacional-LOCAL.html
{"     Clique em 'Carregar dados' e selecione os 5 CSVs da pasta dados-LOCAL-CONFIDENCIAL/." if COMPLETO else "     Os CSVs não vêm neste ZIP (dado de saúde). O consultor entrega por canal seguro."}
  5) Sistema novo (Supabase + Vercel + Git): sistema/docs/SETUP-VERCEL-SUPABASE-GIT.md  (SQL em sistema/db)

{"CUIDADO (LGPD): a pasta dados-LOCAL-CONFIDENCIAL/ tem CPF, RG, telefones, orçamentos e financeiro por paciente. Não encaminhe este ZIP, não suba em nuvem pública, não anexe os CSVs em conversas. Guarde em local protegido ou apague depois de usar. A senha foi enviada por outro canal." if COMPLETO else "Nenhum dado pessoal de paciente está neste ZIP."}

REFAZER COM UM BACKUP NOVO (Python 3.11+, pandas, numpy):
  cd sistema
  python etl/build_dataset.py "caminho/do/backup"
  python etl/build_painel.py
"""

nomes = []
csv_pac = RAIZ / "out" / "clean" / "pacientes.csv"
if csv_pac.exists():
    nomes = [n.lower() for n in pd.read_csv(csv_pac, dtype=str, keep_default_na=False)["nome"] if len(n) > 8]
EQUIPE = ("adjanara leite de oliveira", "fabrício lucena de almeida")  # equipe também consta no cadastro

senha = None
if COMPLETO:
    arq_senha = PROJ / "SENHA-Mon-Clinique-COMPLETO.txt"
    senha = None
    if arq_senha.exists() and "--nova-senha" not in sys.argv:
        ult = [l.strip() for l in arq_senha.read_text(encoding="utf-8").splitlines() if l.strip()]
        if ult and len(ult[-1]) == 24 and ult[-1].isalnum():
            senha = ult[-1]          # mantém a senha já combinada com a cliente
    if senha is None:
        alfabeto = string.ascii_letters + string.digits
        senha = "".join(secrets.choice(alfabeto) for _ in range(24))
    zf = pyzipper.AESZipFile(DESTINO, "w", compression=pyzipper.ZIP_DEFLATED, encryption=pyzipper.WZ_AES)
    zf.setpassword(senha.encode())
    zf.setencryption(pyzipper.WZ_AES, nbits=256)
else:
    zf = zipfile.ZipFile(DESTINO, "w", zipfile.ZIP_DEFLATED, compresslevel=9)

with zf:
    for p in arquivos:
        assert p.exists(), f"faltando: {p}"
        assert p.suffix.lower() not in (".csv", ".zip", ".pdf"), f"arquivo sensível fora do lugar: {p}"
        rel = p.relative_to(PROJ)
        if not COMPLETO and p.suffix.lower() in (".html", ".js", ".json", ".md", ".sql", ".py", ".txt"):
            txt = p.read_text(encoding="utf-8").lower()
            ach = [n for n in nomes if n in txt and n not in EQUIPE]
            assert not ach, f"nome de paciente em {rel}: {len(ach)} ocorrência(s)"
        zf.write(p, rel.as_posix())
    if COMPLETO:
        for n in CSVS_LOCAL:
            f = RAIZ / "out" / "clean" / n
            assert f.exists(), f"faltando CSV: {f}"
            zf.write(f, f"dados-LOCAL-CONFIDENCIAL/{n}")
    zf.writestr("LEIA-ME.txt", LEIA_ME)

if COMPLETO and "--nova-senha" in sys.argv or (COMPLETO and not (PROJ / "SENHA-Mon-Clinique-COMPLETO.txt").exists()):
    (PROJ / "SENHA-Mon-Clinique-COMPLETO.txt").write_text(
        "Senha do ZIP Mon-Clinique-Sistema-COMPLETO-2026-10-06.zip (AES-256)\n"
        "Envie por OUTRO canal (ex.: ligação ou mensagem), nunca junto do ZIP.\n"
        "Abrir com 7-Zip ou WinRAR (o extrator do Windows não abre AES).\n\n" + senha + "\n", encoding="utf-8")

with pyzipper.AESZipFile(DESTINO) as z:
    if COMPLETO:
        z.setpassword(senha.encode())
    assert z.testzip() is None
    print(f"{DESTINO.name}: {DESTINO.stat().st_size/1024:.0f} KB, {len(z.namelist())} arquivos" + (" · AES-256" if COMPLETO else ""))
    for n in z.namelist():
        print("  ", n)
