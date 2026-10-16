#!/usr/bin/env python3
"""
Mon Clinique — ETL do backup do Gestão DS.

Entrada : CSVs do backup (separador ';', UTF-8 com BOM).
Saídas  :
  out/dados.json      -> SÓ agregados, sem dado pessoal. Seguro para embutir no painel.
  out/dados.js        -> mesmo conteúdo em `window.DADOS = {...}` (para o HTML).
  out/qualidade.md    -> relatório de qualidade de dados (anomalias encontradas).
  out/clean/*.csv     -> tabelas limpas (COM dado pessoal) prontas para carga no Supabase.
                         NUNCA versionar nem publicar: pasta está no .gitignore.

Uso:
  python etl/build_dataset.py "../Backup-GestaoDS-05-10-26"
"""
import json
import re
import sys
import unicodedata
from pathlib import Path

import numpy as np
import pandas as pd

SRC = Path(sys.argv[1] if len(sys.argv) > 1 else "../Backup-GestaoDS-05-10-26").resolve()
OUT = Path(__file__).resolve().parent.parent / "out"
CLEAN = OUT / "clean"
OUT.mkdir(exist_ok=True)
CLEAN.mkdir(exist_ok=True)

HOJE = pd.Timestamp("2026-10-05")  # data do backup
SEM_DADO = "Não informado"
QUALIDADE: list[str] = []


# --------------------------------------------------------------------------- util
def ler(nome: str) -> pd.DataFrame:
    return pd.read_csv(SRC / nome, sep=";", encoding="utf-8-sig", dtype=str, keep_default_na=False)


def sem_acento(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", sem_acento(str(s)).strip().upper())


def data(s: pd.Series, fmt: str = "%d/%m/%Y") -> pd.Series:
    return pd.to_datetime(s.str.strip(), format=fmt, errors="coerce")


def num(s: pd.Series) -> pd.Series:
    return pd.to_numeric(s.str.strip().replace("", np.nan), errors="coerce")


def ym(s: pd.Series) -> pd.Series:
    return s.dt.to_period("M").astype(str)


def r2(x) -> float:
    return round(float(x), 2)


def serie_mensal(df: pd.DataFrame, col_data: str, col_val: str | None = None, ini="2023-01", fim="2026-10"):
    """Soma/contagem por mês, preenchendo meses sem movimento com 0."""
    meses = pd.period_range(ini, fim, freq="M").astype(str).tolist()
    g = df.groupby(ym(df[col_data]))
    s = g.size() if col_val is None else g[col_val].sum()
    s = s.reindex(meses).fillna(0)
    return meses, [r2(v) if col_val else int(v) for v in s.values]


def q(msg: str) -> None:
    QUALIDADE.append(msg)


# --------------------------------------------------------------------------- pacientes
def build_pacientes() -> tuple[pd.DataFrame, dict]:
    p = ler("pacientes.csv")
    p["cod_paciente"] = p["Cod Paciente"].str.strip()
    p["nasc"] = data(p["Nascimento"])
    p["cadastro"] = data(p["Data Cadastro"])
    p["ultima_visita"] = data(p["Ultima Visita"].replace("-", ""))
    p["nome_norm"] = p["Nome Paciente"].map(norm)

    # Origem / indicação normalizada
    def origem(v: str) -> str:
        n = norm(v)
        if n in ("", "DESATIVAR", "-"):
            return SEM_DADO
        if re.search(r"INSTA|INSTAGRAN", n):
            return "Instagram"
        if "GOOGLE" in n:
            return "Google"
        if re.search(r"FACEBOOK|\bFACE\b", n):
            return "Facebook"
        if re.search(r"INTERNET|SITE|PESQUISA|YOUTUBE|TIKTOK", n):
            return "Internet / site"
        if "FABRICIO" in n:
            return "Rede do Dr. Fabrício"
        if re.search(r"\bDRA?\b|\bDR\.|DOUTOR|DERMATO|MEDIC|COLEGA", n):
            return "Indicação de médico"
        if re.search(r"INDIC|INDC|PACIENTE|AMIG|PARENTE|FAMIL|MAE|ESPOSA|IRMA|PRIMA|MARIDO|FILHA", n):
            return "Indicação de paciente / amigo"
        return "Outros"

    p["origem"] = p["Indicacao"].map(origem)

    # Cidade normalizada
    def cidade(v: str) -> str:
        n = norm(v)
        if n == "":
            return SEM_DADO
        if n in ("CUIABA", "CUIABA-MT", "CUIABA MT", "CBA"):
            return "Cuiabá"
        if n in ("VARZEA GRANDE", "VG", "V GRANDE", "VARZEA GRANDE-MT"):
            return "Várzea Grande"
        return v.strip().title()

    p["cidade_norm"] = p["Cidade"].map(cidade)
    p["uf"] = p["UF"].str.strip().str.upper().replace("", SEM_DADO)
    p["sexo"] = p["Sexo"].str.strip().str.upper().where(lambda s: s.isin(["F", "M"]), SEM_DADO)

    ref = HOJE
    p["idade"] = ((ref - p["nasc"]).dt.days / 365.25).where(p["nasc"].notna())
    p.loc[(p["idade"] < 0) | (p["idade"] > 105), "idade"] = np.nan
    p["meses_sem_visita"] = ((ref - p["ultima_visita"]).dt.days / 30.44)

    for c in ("Consultas", "Cirurgias", "Exames", "Procedimentos"):
        p[c.lower()] = pd.to_numeric(p[c], errors="coerce").fillna(0).astype(int)

    # ---------- agregados
    ag: dict = {"total": int(len(p))}
    ag["origem"] = p["origem"].value_counts().to_dict()
    ag["cidade_top"] = p["cidade_norm"].value_counts().head(12).to_dict()
    ag["uf"] = p["uf"].value_counts().head(8).to_dict()
    ag["sexo"] = p["sexo"].value_counts().to_dict()
    bins = [0, 25, 35, 45, 55, 65, 200]
    labs = ["até 25", "26–35", "36–45", "46–55", "56–65", "66+"]
    fx = pd.cut(p["idade"], bins=bins, labels=labs, right=True)
    ag["faixa_etaria"] = {k: int(v) for k, v in fx.value_counts().reindex(labs).fillna(0).items()}
    ag["idade_sem_dado"] = int(p["idade"].isna().sum())
    ag["idade_media"] = r2(p["idade"].mean())

    # cadastros por ano / mês (2022 é carga inicial do sistema, não captação real)
    cad = p[p["cadastro"].notna()]
    ag["cadastro_por_ano"] = {str(k): int(v) for k, v in cad.groupby(cad["cadastro"].dt.year).size().items()}
    m, v = serie_mensal(cad[cad["cadastro"] >= "2023-01-01"], "cadastro", ini="2023-01", fim="2026-10")
    ag["novos_mes"] = {"meses": m, "valores": v}
    ag["novos_origem_2023_26"] = cad[cad["cadastro"] >= "2023-01-01"]["origem"].value_counts().to_dict()

    # Recência
    r = p["meses_sem_visita"]
    faixas = {
        "até 3 meses": int((r <= 3).sum()),
        "3–6 meses": int(((r > 3) & (r <= 6)).sum()),
        "6–12 meses": int(((r > 6) & (r <= 12)).sum()),
        "12–24 meses": int(((r > 12) & (r <= 24)).sum()),
        "mais de 24 meses": int((r > 24).sum()),
        "sem visita registrada": int(r.isna().sum()),
    }
    ag["recencia"] = faixas
    ag["reativar_6_24m"] = int(((r > 6) & (r <= 24)).sum())

    # Engajamento
    nc = p["consultas"]
    ag["consultas_por_paciente"] = {
        "0": int((nc == 0).sum()), "1": int((nc == 1).sum()), "2–3": int(nc.between(2, 3).sum()),
        "4–9": int(nc.between(4, 9).sum()), "10+": int((nc >= 10).sum()),
    }
    ag["pacientes_com_cirurgia"] = int((p["cirurgias"] > 0).sum())
    ag["pacientes_com_procedimento"] = int((p["procedimentos"] > 0).sum())
    ag["cirurgias_total"] = int(p["cirurgias"].sum())
    ag["convenio"] = p["Convenio"].str.strip().replace("-", "Particular").value_counts().to_dict()

    # qualidade
    q(f"pacientes: {int((p['CPF'].str.strip()=='').sum())} sem CPF, "
      f"{int((p['Celular'].str.strip()=='').sum())} sem celular, "
      f"{int((p['E-mail'].str.strip()=='').sum())} sem e-mail, "
      f"{ag['idade_sem_dado']} sem data de nascimento válida.")
    q(f"pacientes: origem '{SEM_DADO}' = {ag['origem'].get(SEM_DADO,0)} ({ag['origem'].get(SEM_DADO,0)/len(p):.0%}); "
      f"valor 'Desativar' no campo Indicação ({int((p['Indicacao'].str.strip().str.upper()=='DESATIVAR').sum())}) "
      "é resíduo de configuração, não é origem real.")
    q(f"pacientes: {int((p['cadastro'].dt.year==2022).sum())} cadastros em 2022 são carga inicial (início do Gestão DS em out/22), "
      "não captação — excluídos das séries de novos pacientes.")
    return p, ag


# --------------------------------------------------------------------------- agenda
def build_agenda() -> tuple[pd.DataFrame, dict]:
    a = ler("agendamentos.csv")
    a["dt"] = pd.to_datetime(a["Data Agendamento"], format="%d/%m/%Y %H:%M", errors="coerce")
    a["status"] = a["Status"].str.strip()
    a["tipo"] = a["Tipo"].str.strip()
    a["cod_paciente"] = a["Cod Paciente"].str.strip()
    a["primeiro"] = a["Primeiro Atendimento"].str.strip().str.lower().isin(["sim", "s"])
    a["convenio"] = a["Convênio"].str.strip().replace({"-": "Particular", "ALMEIDA MEDICINA E CIRURGIA LTDA": "Interno (clínica)"})
    a["procedimento"] = a["Tipos"].str.strip().replace("-", "")
    a = a[a["dt"].notna()].copy()
    ativos = a[a["tipo"] != "Bloqueio"].copy()

    pas = ativos[ativos["dt"] < HOJE + pd.Timedelta(days=1)].copy()
    ag: dict = {"total": int(len(ativos)), "inicio": str(ativos["dt"].min().date()), "fim": str(ativos["dt"].max().date())}
    ag["status"] = pas["status"].value_counts().to_dict()
    ag["tipo"] = pas["tipo"].value_counts().to_dict()
    ag["convenio"] = pas["convenio"].value_counts().to_dict()

    fin = (pas["status"] == "Finalizado")
    canc = (pas["status"] == "Cancelado")
    ag["taxa_realizado"] = r2(fin.mean() * 100)
    ag["taxa_cancelado"] = r2(canc.mean() * 100)
    ag["sem_baixa"] = int(pas["status"].isin(["Não confirmado", "Confirmado", "Em espera"]).sum())

    # séries mensais (2023-01 em diante)
    pas23 = pas[pas["dt"] >= "2023-01-01"]
    meses = pd.period_range("2023-01", "2026-10", freq="M").astype(str).tolist()
    por_mes = pas23.groupby([ym(pas23["dt"]), "status"]).size().unstack(fill_value=0).reindex(meses).fillna(0).astype(int)
    ag["mes"] = {
        "meses": meses,
        "total": [int(x) for x in por_mes.sum(axis=1)],
        "finalizado": [int(x) for x in por_mes.get("Finalizado", pd.Series(0, index=meses))],
        "cancelado": [int(x) for x in por_mes.get("Cancelado", pd.Series(0, index=meses))],
        "sem_baixa": [int(x) for x in por_mes.reindex(columns=["Não confirmado", "Confirmado", "Em espera"], fill_value=0).sum(axis=1)],
    }
    por_tipo = pas23.groupby([ym(pas23["dt"]), "tipo"]).size().unstack(fill_value=0).reindex(meses).fillna(0).astype(int)
    ag["mes_tipo"] = {t: [int(x) for x in por_tipo[t]] for t in ["Consulta", "Retorno", "Procedimento", "Cirurgia"] if t in por_tipo}
    prim = pas23[pas23["primeiro"]]
    m, v = serie_mensal(prim, "dt", ini="2023-01", fim="2026-10")
    ag["primeiro_atend_mes"] = {"meses": m, "valores": v}

    # Mapa de calor dia-da-semana x hora (últimos 12 meses, finalizados)
    ult = pas[(pas["dt"] >= HOJE - pd.Timedelta(days=365)) & (pas["status"] == "Finalizado")]
    heat = ult.groupby([ult["dt"].dt.dayofweek, ult["dt"].dt.hour]).size()
    horas = list(range(7, 20))
    ag["heat"] = {
        "dias": ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"],
        "horas": horas,
        "valores": [[int(heat.get((d, h), 0)) for h in horas] for d in range(7)],
    }
    ag["ultimos_12m"] = int(len(ult))
    dias_uteis = ult["dt"].dt.normalize().nunique()
    ag["media_por_dia_atendido"] = r2(len(ult) / max(dias_uteis, 1))
    ag["dias_atendidos_12m"] = int(dias_uteis)

    # Procedimentos mais agendados (campo "Tipos")
    proc = pas[pas["procedimento"] != ""]["procedimento"].map(norm)
    ag["proc_top"] = proc.value_counts().head(15).to_dict()

    # Retorno: pacientes distintos com >1 agendamento finalizado
    f = pas[pas["status"] == "Finalizado"]
    por_pac = f.groupby("cod_paciente").size()
    ag["pacientes_distintos"] = int(por_pac.shape[0])
    ag["pacientes_recorrentes"] = int((por_pac >= 2).sum())

    # Últimos 90 dias vs 90 dias anteriores
    def janela(ini, fim):
        w = pas[(pas["dt"] >= ini) & (pas["dt"] < fim)]
        return {"total": int(len(w)), "finalizado": int((w["status"] == "Finalizado").sum()),
                "cancelado": int((w["status"] == "Cancelado").sum()), "primeiro": int(w["primeiro"].sum())}
    ag["ult_90d"] = janela(HOJE - pd.Timedelta(days=90), HOJE + pd.Timedelta(days=1))
    ag["ant_90d"] = janela(HOJE - pd.Timedelta(days=180), HOJE - pd.Timedelta(days=90))

    q(f"agenda: {ag['sem_baixa']} agendamentos passados sem baixa (Não confirmado/Confirmado/Em espera) — "
      "ou faltaram ou a recepção não deu baixa; distorce a taxa de comparecimento.")
    q(f"agenda: {int((a['tipo']=='Bloqueio').sum())} bloqueios de horário e {int((a['cod_paciente']=='').sum())} registros sem código de paciente.")
    return a, ag


# --------------------------------------------------------------------------- atendimentos (prontuário)
def build_atendimentos() -> tuple[pd.DataFrame, dict]:
    t = ler("atendimentos.csv")
    t["dt"] = pd.to_datetime(t["Data start"], format="%d/%m/%Y %H:%M:%S", errors="coerce")
    t["servico"] = t["Serviço"].str.strip()
    t["tipo_servico"] = t["Tipo Serviço"].str.strip()
    t["cod_paciente"] = t["Cod Paciente"].str.strip()
    t["texto"] = t["Texto Limpo"].fillna("")
    t["tem_texto"] = t["texto"].str.strip().str.len() > 20

    ag: dict = {"total": int(len(t)), "pacientes_distintos": int(t["cod_paciente"].nunique())}
    ag["servico"] = t["servico"].value_counts().to_dict()
    recente = t[t["dt"] >= "2022-10-01"]
    old = int((t["dt"] < "2022-10-01").sum())
    q(f"atendimentos: {old} registros anteriores a out/2022 (histórico importado de outro sistema, 2013–2022).")
    meses = pd.period_range("2023-01", "2026-10", freq="M").astype(str).tolist()
    por = recente.groupby([ym(recente["dt"]), "servico"]).size().unstack(fill_value=0).reindex(meses).fillna(0).astype(int)
    ag["mes"] = {"meses": meses, "series": {c: [int(x) for x in por[c]] for c in por.columns if c in
                 ("Consulta", "Procedimento", "Cirurgia")}}
    # prontuário preenchido
    ag["pct_com_texto"] = r2(t["tem_texto"].mean() * 100)
    ag["tamanho_medio_texto"] = int(t.loc[t["tem_texto"], "texto"].str.len().mean())
    ag["sem_texto"] = int((~t["tem_texto"]).sum())
    ag["texto_por_ano"] = {str(k): r2(v * 100) for k, v in t.groupby(t["dt"].dt.year)["tem_texto"].mean().items()}

    # Procedimentos/cirurgias realizados (exclui consulta/observação)
    proc = t[t["servico"].isin(["Procedimento", "Cirurgia"])]
    ag["proc_realizados_top"] = proc["tipo_servico"].map(norm).value_counts().head(15).to_dict()
    ag["cirurgias_top"] = t[t["servico"] == "Cirurgia"]["tipo_servico"].map(norm).value_counts().head(12).to_dict()
    ag["cirurgias_por_ano"] = {str(k): int(v) for k, v in t[t["servico"] == "Cirurgia"].groupby(t["dt"].dt.year).size().items()}
    ag["procedimentos_por_ano"] = {str(k): int(v) for k, v in t[t["servico"] == "Procedimento"].groupby(t["dt"].dt.year).size().items()}

    # Recorrência: atendimentos por paciente
    por_pac = t.groupby("cod_paciente").size()
    ag["atend_por_paciente"] = {
        "1": int((por_pac == 1).sum()), "2–3": int(por_pac.between(2, 3).sum()),
        "4–9": int(por_pac.between(4, 9).sum()), "10+": int((por_pac >= 10).sum()),
    }
    dup = t["Cod Atendimento"].duplicated().sum()
    q(f"atendimentos: {int(t["Cod Atendimento"].duplicated(keep=False).sum())} linhas com código de atendimento repetido (116 códigos em 238 linhas, com data e texto diferentes: são atendimentos distintos numerados igual — o banco usa chave própria); "
      f"{ag['sem_texto']} registros sem texto clínico útil ({100-ag['pct_com_texto']:.0f}%).")
    return t, ag


# --------------------------------------------------------------------------- orçamentos
def build_orcamentos(pac_cod_nome: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    o = ler("orcamentos.csv")
    o["criado"] = data(o["Criado Em"])
    o["valido_ate"] = data(o["Valido Ate"])
    o["data_ganho"] = pd.to_datetime(o["Data Ganho"].str.strip(), format="%d/%m/%Y %H:%M:%S", errors="coerce")
    o["data_perda"] = pd.to_datetime(o["Data Perda"].str.strip(), format="%d/%m/%Y %H:%M:%S", errors="coerce")
    o["bruto"] = num(o["Valor Total"]).fillna(0)
    o["liquido"] = num(o["Valor Total Com Desconto"]).fillna(0)
    o["status"] = o["Status"].str.strip()
    o["situacao"] = o["Situacao"].str.strip()
    o["orcado_por"] = o["Orcado Por"].str.strip()
    o["cod_paciente"] = o["Cod Paciente"].str.strip()
    o["titulo_norm"] = o["Titulo"].map(norm).map(
        lambda n: "Planejamento cirúrgico" if "CIRURG" in n else
        "Procedimento / toxina / harmonização" if re.search(r"PROCED|TOXINA|HARMON|APLICA|LESAO|TUBERC", n) else "Outros")
    o["idade_dias"] = (HOJE - o["criado"]).dt.days

    aberto = o["status"] == "Em aberto"
    ganho = o["status"] == "Ganho"
    perda = o["status"] == "Perda"

    ag: dict = {"total": int(len(o)), "pacientes_distintos": int(o["cod_paciente"].nunique())}
    ag["status"] = {
        s: {"qtd": int((o["status"] == s).sum()), "bruto": r2(o.loc[o["status"] == s, "bruto"].sum()),
            "liquido": r2(o.loc[o["status"] == s, "liquido"].sum())}
        for s in ["Em aberto", "Ganho", "Perda"]
    }
    ag["desconto_pct_ganho"] = r2((1 - o.loc[ganho, "liquido"].sum() / o.loc[ganho, "bruto"].sum()) * 100)
    ag["ticket_medio_ganho"] = r2(o.loc[ganho, "liquido"].mean())
    ag["ticket_mediano_ganho"] = r2(o.loc[ganho, "liquido"].median())
    ag["conv_sobre_total"] = r2(ganho.mean() * 100)
    ag["conv_sobre_fechados"] = r2(ganho.sum() / max(ganho.sum() + perda.sum(), 1) * 100)

    # Coorte mensal de emissão → situação atual
    o23 = o[o["criado"] >= "2023-01-01"]
    meses = pd.period_range("2023-01", "2026-10", freq="M").astype(str).tolist()
    g = o23.groupby([ym(o23["criado"]), "status"]).size().unstack(fill_value=0).reindex(meses).fillna(0).astype(int)
    gv = o23.groupby([ym(o23["criado"]), "status"])["liquido"].sum().unstack(fill_value=0).reindex(meses).fillna(0)
    ag["coorte"] = {
        "meses": meses,
        "qtd": {s: [int(x) for x in g.get(s, pd.Series(0, index=meses))] for s in ["Ganho", "Em aberto", "Perda"]},
        "valor": {s: [r2(x) for x in gv.get(s, pd.Series(0, index=meses))] for s in ["Ganho", "Em aberto", "Perda"]},
    }
    # Fechamentos por data de ganho
    gg = o[ganho & o["data_ganho"].notna()]
    ag["ganho_por_data_top"] = {str(k.date()): int(v) for k, v in gg.groupby(gg["data_ganho"].dt.normalize()).size().sort_values(ascending=False).head(5).items()}
    ag["ganho_data_ausente"] = int((ganho & o["data_ganho"].isna()).sum())
    top_d, top_n = next(iter(ag["ganho_por_data_top"].items()))
    q(f"orçamentos: {top_n} dos {int(ganho.sum())} ganhos têm a mesma 'Data Ganho' ({pd.Timestamp(top_d).strftime('%d/%m/%Y')}) — "
      "fechamento em lote/retroativo; não usar 'Data Ganho' para medir ritmo de vendas.")
    q(f"orçamentos: {int(ganho.sum() - gg.shape[0])} orçamentos Ganho sem 'Data Ganho'.")

    # Aging dos em aberto
    ab = o[aberto].copy()
    bins = [-1, 30, 90, 180, 365, 10_000]
    labs = ["até 30 dias", "31–90 dias", "91–180 dias", "181–365 dias", "mais de 1 ano"]
    ab["faixa"] = pd.cut(ab["idade_dias"], bins=bins, labels=labs)
    ag["aberto_aging"] = {
        l: {"qtd": int((ab["faixa"] == l).sum()), "liquido": r2(ab.loc[ab["faixa"] == l, "liquido"].sum())} for l in labs
    }
    ag["aberto_vencido"] = {"qtd": int((ab["valido_ate"] < HOJE).sum()), "liquido": r2(ab.loc[ab["valido_ate"] < HOJE, "liquido"].sum())}
    ag["aberto_situacao"] = {s: {"qtd": int((ab["situacao"] == s).sum()), "liquido": r2(ab.loc[ab["situacao"] == s, "liquido"].sum())}
                             for s in ["Quente", "Morno", "Frio"]}
    quentes_vig = ab[(ab["situacao"] == "Quente") & (ab["valido_ate"] >= HOJE - pd.Timedelta(days=30))]
    ag["pipeline_quente_recente"] = {"qtd": int(len(quentes_vig)), "liquido": r2(quentes_vig["liquido"].sum())}
    recente = ab[ab["idade_dias"] <= 180]
    ag["pipeline_recente_180d"] = {"qtd": int(len(recente)), "liquido": r2(recente["liquido"].sum())}

    # Por tipo de orçamento e por vendedor
    ag["por_titulo"] = {t: {"qtd": int((o["titulo_norm"] == t).sum()),
                           "ganho": int(((o["titulo_norm"] == t) & ganho).sum()),
                           "liquido_ganho": r2(o.loc[(o["titulo_norm"] == t) & ganho, "liquido"].sum())}
                       for t in o["titulo_norm"].unique()}
    ag["por_vendedor"] = {}
    for v, grp in o.groupby("orcado_por"):
        gv_ = grp["status"] == "Ganho"
        ag["por_vendedor"][v] = {"qtd": int(len(grp)), "ganho": int(gv_.sum()),
                                 "taxa": r2(gv_.mean() * 100), "liquido_ganho": r2(grp.loc[gv_, "liquido"].sum()),
                                 "em_aberto": int((grp["status"] == "Em aberto").sum())}
    # Orçamento ≥ R$ 50 mil
    ag["faixa_valor_ganho"] = {
        "até 5 mil": int((o.loc[ganho, "liquido"] <= 5000).sum()),
        "5–15 mil": int(o.loc[ganho, "liquido"].between(5000.01, 15000).sum()),
        "15–40 mil": int(o.loc[ganho, "liquido"].between(15000.01, 40000).sum()),
        "acima de 40 mil": int((o.loc[ganho, "liquido"] > 40000).sum()),
    }
    # Mais de um orçamento por paciente
    por_pac = o.groupby("cod_paciente").size()
    ag["pacientes_multi_orc"] = int((por_pac >= 2).sum())
    ag["orc_por_paciente_max"] = int(por_pac.max())
    q(f"orçamentos: {ag['status']['Em aberto']['qtd']} 'Em aberto' somam R$ {ag['status']['Em aberto']['liquido']:,.0f}; "
      f"{ag['aberto_aging']['mais de 1 ano']['qtd']} têm mais de 1 ano — a maioria é lead morto nunca baixado, "
      f"só {ag['status']['Perda']['qtd']} foram marcados como Perda. Taxa de conversão sobre 'fechados' ({ag['conv_sobre_fechados']}%) está inflada por isso.")
    return o, ag


# --------------------------------------------------------------------------- financeiro
CONTABILIDADE = {  # faturamento assinado pela Ativa Contabilidade (Painel-Comparativo-DRE-Divergencia.html)
    "2025-07": 128600.00, "2025-08": 207180.00, "2025-09": 247500.00, "2025-10": 222978.00, "2025-11": 271353.27,
    "2025-12": 273827.27, "2026-01": 297679.27, "2026-02": 168700.00, "2026-03": 170500.00, "2026-04": 262700.00,
    "2026-05": 104300.00, "2026-06": 204200.00,
}
CONTA_AZUL = {  # DRE exportada do Conta Azul em 15/07/2026 (MVP-Consolidado)
    "2025-10": 129932.64, "2025-11": 74866.80, "2025-12": 62784.05, "2026-01": 130731.94, "2026-02": 130600.01,
    "2026-03": 93500.00, "2026-04": 63940.00, "2026-05": 208262.00, "2026-06": 141750.64,
}


def build_financeiro(pac: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    f = ler("financeirov2.csv")
    f["tipo"] = f["R/D"].str.strip()
    f["pag"] = data(f["Pagamento"])
    f["lan"] = data(f["Lancamento"])
    f["valor"] = num(f["Valor"]).fillna(0)
    f["valor_real"] = num(f["Valor real"]).fillna(0)
    f["pago"] = f["Pago"].str.strip().str.lower() == "true"
    f["categoria"] = f["Categoria"].str.strip()
    f["forma"] = f["F. Pagamento"].str.strip().replace({"PIX": "Pix"})
    f["caixa"] = f["Caixa"].str.strip()
    f["paciente_norm"] = f["Paciente"].map(norm)

    # --- anomalias de data
    ruim_fut = f["pag"] > "2030-01-01"
    ruim_ant = f["pag"] < "2022-01-01"
    q(f"financeiro: {int(ruim_fut.sum())} lançamento(s) com data de pagamento no ano 2103 (digitação; lançamento é "
      f"{f.loc[ruim_fut,'Lancamento'].iloc[0] if ruim_fut.any() else '-'}) — corrigido para o ano do lançamento no tratamento.")
    q(f"financeiro: {int(ruim_ant.sum())} receita(s) com pagamento em 2021 anterior ao lançamento em 12/2022 (data de pagamento incoerente).")
    f.loc[ruim_fut, "pag"] = f.loc[ruim_fut, "lan"]
    f["pag_anomala"] = ruim_ant

    f["mes_pag"] = ym(f["pag"])
    f["mes_lan"] = ym(f["lan"])

    rec = f[f["tipo"] == "Receita"]
    des = f[f["tipo"] == "Despesa"]
    rec_ok = rec[rec["pago"]]

    ag: dict = {"linhas": int(len(f))}
    ag["anos"] = {}
    for ano in range(2023, 2027):
        r_ = rec_ok[rec_ok["pag"].dt.year == ano]
        d_ = des[(des["pag"].dt.year == ano) & des["pago"]]
        ag["anos"][str(ano)] = {"receita_recebida": r2(r_["valor_real"].sum()), "receita_bruta": r2(r_["valor"].sum()),
                                "despesa_paga": r2(d_["valor_real"].sum())}

    # --- comparativo Jan–Set por ano (única janela com receita E despesa completas no Gestão DS)
    ag["jan_set"] = {}
    for ano in (2023, 2024, 2025):
        ri = rec_ok[(rec_ok["pag"].dt.year == ano) & (rec_ok["pag"].dt.month <= 9)]["valor_real"].sum()
        dd = des[des["pago"] & (des["pag"].dt.year == ano) & (des["pag"].dt.month <= 9)]
        luc = dd.loc[dd["categoria"] == "Lucros", "valor_real"].sum()
        imp = dd.loc[dd["categoria"].str.startswith("Impostos"), "valor_real"].sum()
        sal = dd.loc[dd["categoria"].isin(["Salários", "Encargos Sociais (INSS/FGTS/IRRF)", "Pró-Labores", "Férias e Abono", "13o. Terceiro Salário", "Rescisão"]), "valor_real"].sum()
        ins = dd.loc[dd["categoria"].str.startswith("Insumos"), "valor_real"].sum()
        mkt = dd.loc[dd["categoria"] == "Marketing", "valor_real"].sum()
        tot = dd["valor_real"].sum()
        ag["jan_set"][str(ano)] = {
            "receita": r2(ri), "despesa_total": r2(tot), "lucros_distribuidos": r2(luc),
            "despesa_sem_lucros": r2(tot - luc), "resultado_apos_despesas": r2(ri - (tot - luc)),
            "impostos": r2(imp), "pessoal": r2(sal), "insumos": r2(ins), "marketing": r2(mkt),
            "margem_pct": r2((ri - (tot - luc)) / ri * 100) if ri else 0,
        }

    # --- séries mensais
    meses = pd.period_range("2023-01", "2026-12", freq="M").astype(str).tolist()
    ag["meses"] = meses
    ag["receita_recebida_mes"] = [r2(x) for x in rec_ok.groupby("mes_pag")["valor_real"].sum().reindex(meses).fillna(0)]
    ag["receita_lancada_mes"] = [r2(x) for x in rec.groupby("mes_lan")["valor"].sum().reindex(meses).fillna(0)]
    ag["despesa_paga_mes"] = [r2(x) for x in des[des["pago"]].groupby("mes_pag")["valor_real"].sum().reindex(meses).fillna(0)]
    ag["a_receber_mes"] = [r2(x) for x in rec[~rec["pago"]].groupby("mes_pag")["valor"].sum().reindex(meses).fillna(0)]
    ultima_desp = des[des["pago"]].groupby("mes_pag")["valor_real"].sum()
    ultima_desp = ultima_desp[ultima_desp > 5000]
    ag["despesa_cobertura_ate"] = str(ultima_desp.index.max())
    q(f"financeiro: despesas só estão lançadas no Gestão DS até {ag['despesa_cobertura_ate']}; a partir de lá o módulo registra "
      "só receita. Resultado/lucro de 2026 precisa vir do Conta Azul ou da contabilidade.")

    # --- composição
    ag["receita_categoria"] = rec_ok.groupby("categoria")["valor_real"].sum().sort_values(ascending=False).head(10).round(2).to_dict()
    ag["despesa_categoria"] = des[des["pago"]].groupby("categoria")["valor_real"].sum().sort_values(ascending=False).head(18).round(2).to_dict()
    ag["forma_receita"] = rec_ok.groupby("forma")["valor_real"].sum().sort_values(ascending=False).round(2).to_dict()
    ag["forma_receita_qtd"] = rec_ok.groupby("forma").size().sort_values(ascending=False).to_dict()
    cartao = rec[rec["forma"].isin(["Cartão de crédito", "Cartão de débito"])]
    ag["taxa_cartao"] = {
        "bruto": r2(cartao["valor"].sum()), "liquido": r2(cartao["valor_real"].sum()),
        "taxa_total": r2((cartao["valor"] - cartao["valor_real"]).sum()),
        "taxa_pct": r2((1 - cartao["valor_real"].sum() / cartao["valor"].sum()) * 100),
    }
    cr = rec[rec["forma"] == "Cartão de crédito"]
    ag["taxa_cartao"]["credito_pct"] = r2((1 - cr["valor_real"].sum() / cr["valor"].sum()) * 100)
    ag["caixa"] = {k: {"receita": r2(v["valor_real"][v["tipo"] == "Receita"].sum()),
                       "despesa": r2(v["valor_real"][v["tipo"] == "Despesa"].sum()), "linhas": int(len(v))}
                   for k, v in f.groupby("caixa")}
    cond = f[f["caixa"].str.contains("Condom", case=False)]
    ag["condominio_categoria"] = cond.groupby(["tipo", "categoria"])["valor_real"].sum().round(2).sort_values(ascending=False).head(12).reset_index().rename(
        columns={"valor_real": "valor"}).to_dict("records")

    # --- A receber / atrasado
    nao = rec[~rec["pago"]]
    atras = nao[nao["pag"] < HOJE]
    prox = nao[nao["pag"] >= HOJE]
    ag["a_receber"] = {
        "qtd": int(len(nao)), "valor": r2(nao["valor"].sum()),
        "atrasado": {"qtd": int(len(atras)), "valor": r2(atras["valor"].sum())},
        "a_vencer": {"qtd": int(len(prox)), "valor": r2(prox["valor"].sum())},
    }
    atras_idade = (HOJE - atras["pag"]).dt.days
    ag["atrasado_aging"] = {
        "até 30 dias": r2(atras.loc[atras_idade <= 30, "valor"].sum()),
        "31–90 dias": r2(atras.loc[atras_idade.between(31, 90), "valor"].sum()),
        "91–365 dias": r2(atras.loc[atras_idade.between(91, 365), "valor"].sum()),
        "mais de 1 ano": r2(atras.loc[atras_idade > 365, "valor"].sum()),
    }
    ag["a_pagar"] = {"qtd": int((~des["pago"]).sum()), "valor": r2(des.loc[~des["pago"], "valor"].sum())}
    q(f"financeiro: {int((rec['pago'] & (rec['pag']>HOJE)).sum())} receita(s) marcadas como pagas com data futura; "
      f"{int(len(atras))} receitas não pagas já vencidas somam R$ {atras['valor'].sum():,.2f}.")

    # --- Reconciliação com contabilidade e Conta Azul
    meses_rec = list(CONTABILIDADE.keys())
    rec_mes = dict(zip(meses, ag["receita_recebida_mes"]))
    lan_mes = dict(zip(meses, ag["receita_lancada_mes"]))
    rows = []
    for m in meses_rec:
        rows.append({"mes": m, "contabilidade": CONTABILIDADE[m], "conta_azul": CONTA_AZUL.get(m),
                     "gestao_recebido": rec_mes.get(m, 0), "gestao_lancado": lan_mes.get(m, 0)})
    ag["reconciliacao"] = rows
    p9 = [r for r in rows if r["mes"] >= "2025-10"]
    ag["reconc_9m"] = {
        "contabilidade": r2(sum(r["contabilidade"] for r in p9)),
        "conta_azul": r2(sum(r["conta_azul"] for r in p9)),
        "gestao_recebido": r2(sum(r["gestao_recebido"] for r in p9)),
        "gestao_lancado": r2(sum(r["gestao_lancado"] for r in p9)),
    }
    ag["reconc_12m"] = {k: r2(sum((r[k] or 0) for r in rows)) for k in ("contabilidade", "gestao_recebido", "gestao_lancado")}

    # --- LTV por paciente (cruzando nome normalizado; só agregados saem)
    nomes = pac.drop_duplicates("nome_norm").set_index("nome_norm")["cod_paciente"]
    r_nomeado = rec_ok[rec_ok["paciente_norm"].ne("") & rec_ok["paciente_norm"].ne("-")].copy()
    r_nomeado["cod"] = r_nomeado["paciente_norm"].map(nomes)
    casou = r_nomeado["cod"].notna()
    ag["ltv_match_pct"] = r2(casou.mean() * 100) if len(r_nomeado) else 0
    ltv = r_nomeado[casou].groupby("cod")["valor_real"].sum().sort_values(ascending=False)
    if len(ltv):
        tot = ltv.sum()
        top10 = ltv.head(max(int(len(ltv) * 0.10), 1)).sum()
        top20 = ltv.head(max(int(len(ltv) * 0.20), 1)).sum()
        ag["ltv"] = {
            "pacientes_com_receita": int(len(ltv)), "media": r2(ltv.mean()), "mediana": r2(ltv.median()),
            "pareto_top10_pct": r2(top10 / tot * 100), "pareto_top20_pct": r2(top20 / tot * 100),
            "faixas": {
                "até R$ 1 mil": int((ltv <= 1000).sum()), "R$ 1–5 mil": int(ltv.between(1000.01, 5000).sum()),
                "R$ 5–20 mil": int(ltv.between(5000.01, 20000).sum()), "R$ 20–50 mil": int(ltv.between(20000.01, 50000).sum()),
                "acima de R$ 50 mil": int((ltv > 50000).sum()),
            },
        }
    q(f"financeiro: {ag['ltv_match_pct']}% das receitas com nome de paciente casaram com o cadastro (vínculo por nome, "
      "pois o financeiro não traz o código do paciente — risco de homônimos).")
    return f, ag


# --------------------------------------------------------------------------- catálogo
def build_catalogo() -> tuple[pd.DataFrame, dict]:
    frames = []
    for arq, cls in (("tipos_cirurgia.csv", "Cirurgia"), ("tipos_procedimento.csv", "Procedimento"), ("tipos_exame.csv", "Exame")):
        d = ler(arq)
        d["classe"] = cls
        frames.append(d)
    c = pd.concat(frames, ignore_index=True)
    c["valor"] = num(c["Valor"]).fillna(0)
    c["duracao_min"] = num(c["Duracao (min)"]).fillna(0)
    c["repasse_pct"] = num(c["Porcentagem Repasse"]).fillna(0)
    c["ativo"] = c["Ativo"].str.strip().str.lower().isin(["sim", "s"])
    c["descricao"] = c["Descricao"].str.strip()
    ag: dict = {"total": int(len(c))}
    ag["por_classe"] = {k: {"qtd": int(len(v)), "valor_medio": r2(v["valor"].mean()), "valor_max": r2(v["valor"].max()),
                            "sem_valor": int((v["valor"] == 0).sum())} for k, v in c.groupby("classe")}
    ag["top_valor"] = c.sort_values("valor", ascending=False).head(10)[["descricao", "classe", "valor"]].to_dict("records")
    ag["sem_valor"] = int((c["valor"] == 0).sum())
    q(f"catálogo: {ag['sem_valor']} de {len(c)} itens sem valor na tabela de preços; "
      f"{int((c['duracao_min']==30).sum())} com duração padrão de 30 min (cirurgias de 4h aparecem como 30 min — duração não confiável).")
    return c, ag


# --------------------------------------------------------------------------- KPIs de topo
def exporta_limpo(p, a, t, o, f, c):
    """Tabelas limpas, COM dado pessoal, prontas para \\copy no Postgres/Supabase."""
    iso = lambda s: s.dt.strftime("%Y-%m-%d")
    isot = lambda s: s.dt.strftime("%Y-%m-%d %H:%M:%S")

    pp = pd.DataFrame({
        "cod_paciente": p["cod_paciente"], "nome": p["Nome Paciente"].str.strip(), "nascimento": iso(p["nasc"]),
        "sexo": p["sexo"].replace(SEM_DADO, ""), "cpf": p["CPF"].str.strip(), "rg": p["RG"].str.strip(),
        "estado_civil": p["Estado Civil"].str.strip(), "ocupacao": p["Ocupacao"].str.strip(),
        "email": p["E-mail"].str.strip(), "telefone": p["Telefone"].str.strip(), "celular": p["Celular"].str.strip(),
        "cep": p["CEP"].str.strip(), "endereco": p["Endereco"].str.strip(), "numero": p["Numero"].str.strip(),
        "complemento": p["Complemento"].str.strip(), "bairro": p["Bairro"].str.strip(),
        "cidade": p["cidade_norm"].replace(SEM_DADO, ""), "uf": p["uf"].replace(SEM_DADO, ""),
        "origem": p["origem"], "indicacao_original": p["Indicacao"].str.strip(),
        "convenio": p["Convenio"].str.strip().replace("-", ""), "instagram": p["Instagram"].str.strip(),
        "data_cadastro": iso(p["cadastro"]), "ultima_visita": iso(p["ultima_visita"]),
        "ultima_visita_atendimento": iso(p["ultima_visita_real"]) if "ultima_visita_real" in p else "",
        "qtd_consultas": p["consultas"], "qtd_cirurgias": p["cirurgias"], "qtd_procedimentos": p["procedimentos"],
        "observacao": p["Observacao"].str.strip(),
    })
    pp.to_csv(CLEAN / "pacientes.csv", index=False, encoding="utf-8")

    aa = pd.DataFrame({
        "cod_paciente": a["cod_paciente"], "data_hora": isot(a["dt"]), "tipo": a["tipo"], "procedimento": a["procedimento"],
        "convenio": a["convenio"], "status": a["status"], "primeiro_atendimento": a["primeiro"],
        "observacao": a["OBS"].str.strip(),
    })
    aa.to_csv(CLEAN / "agendamentos.csv", index=False, encoding="utf-8")

    tt = pd.DataFrame({
        "cod_atendimento": t["Cod Atendimento"].str.strip(), "cod_paciente": t["cod_paciente"], "inicio": isot(t["dt"]),
        "fim": isot(pd.to_datetime(t["Data end"], format="%d/%m/%Y %H:%M:%S", errors="coerce")),
        "servico": t["servico"], "tipo_servico": t["tipo_servico"], "texto_html": t["HTML"], "texto": t["texto"],
    })
    tt.to_csv(CLEAN / "atendimentos.csv", index=False, encoding="utf-8")

    oo = pd.DataFrame({
        "cod_orcamento": o["Cod Orcamento"].str.strip(), "numero": o["Numero"].str.strip(), "titulo": o["Titulo"].str.strip(),
        "tipo_orcamento": o["titulo_norm"], "status": o["status"], "situacao": o["situacao"], "cod_paciente": o["cod_paciente"],
        "orcado_por": o["orcado_por"], "criado_em": iso(o["criado"]), "valido_ate": iso(o["valido_ate"]),
        "data_ganho": iso(o["data_ganho"]), "data_perda": iso(o["data_perda"]),
        "valor_bruto": o["bruto"], "valor_liquido": o["liquido"],
    })
    oo.to_csv(CLEAN / "orcamentos.csv", index=False, encoding="utf-8")

    ff = pd.DataFrame({
        "tipo": f["tipo"], "data_pagamento": iso(f["pag"]), "data_lancamento": iso(f["lan"]),
        "prestador": f["Prestador"].str.strip().replace("-", ""), "paciente_nome": f["Paciente"].str.strip().replace("-", ""),
        "descricao": f["Descrição"].str.strip(), "categoria": f["categoria"], "forma_pagamento": f["forma"],
        "caixa": f["caixa"], "valor": f["valor"], "valor_liquido": f["valor_real"], "pago": f["pago"],
        "data_anomala": f["pag_anomala"],
    })
    ff.to_csv(CLEAN / "lancamentos.csv", index=False, encoding="utf-8")

    cc = pd.DataFrame({
        "cod_tipo": c["Cod Tipo"].str.strip(), "classe": c["classe"], "descricao": c["descricao"], "valor": c["valor"],
        "duracao_min": c["duracao_min"].astype(int), "repasse_pct": c["repasse_pct"], "ativo": c["ativo"],
    })
    cc.to_csv(CLEAN / "catalogo.csv", index=False, encoding="utf-8")

    # anexos: só metadados (a URL assinada do S3 expira e dá acesso a documento de paciente — não persistir)
    pa = ler("pacientes_arquivos.csv")
    pd.DataFrame({
        "cod_paciente": pa["Cod Paciente"].str.strip(), "data_cadastro": iso(data(pa["Data Cadastro"])),
        "cadastrado_por": pa["Cadastrado Por"].str.strip(), "nome_arquivo": pa["Nome Arquivo"].str.strip(),
    }).to_csv(CLEAN / "paciente_arquivos.csv", index=False, encoding="utf-8")
    ta = ler("atendimentos_arquivos.csv")
    pd.DataFrame({
        "cod_atendimento": ta["Cod Atendimento"].str.strip(), "cod_paciente": ta["Cod Paciente"].str.strip(),
        "data": iso(data(ta["Data"].str.slice(0, 10))),
    }).to_csv(CLEAN / "atendimento_arquivos.csv", index=False, encoding="utf-8")


def recencia_por_atendimento(p: pd.DataFrame, t: pd.DataFrame, ag_pac: dict) -> None:
    """O campo 'Ultima Visita' do cadastro está vazio para 69% dos pacientes; a última visita real vem dos atendimentos."""
    ult = t[t["dt"] >= "2022-10-01"].groupby("cod_paciente")["dt"].max()
    p["ultima_visita_real"] = p["cod_paciente"].map(ult)
    com = p[p["ultima_visita_real"].notna()]
    meses = (HOJE - com["ultima_visita_real"]).dt.days / 30.44
    ag_pac["recencia"] = {
        "até 3 meses": int((meses <= 3).sum()), "3–6 meses": int(((meses > 3) & (meses <= 6)).sum()),
        "6–12 meses": int(((meses > 6) & (meses <= 12)).sum()), "12–24 meses": int(((meses > 12) & (meses <= 24)).sum()),
        "mais de 24 meses": int((meses > 24).sum()), "sem atendimento desde out/22": int(p["ultima_visita_real"].isna().sum()),
    }
    ag_pac["reativar_6_24m"] = int(((meses > 6) & (meses <= 24)).sum())
    ag_pac["ativos_12m"] = int((meses <= 12).sum())
    q(f"pacientes: campo 'Última Visita' do cadastro vazio em {int((p['Ultima Visita'].str.strip().isin(['-',''])).sum())} pacientes; "
      "a recência do painel foi recalculada a partir da data do último atendimento no prontuário.")


def main():
    print("lendo", SRC)
    p, ag_pac = build_pacientes()
    a, ag_ag = build_agenda()
    t, ag_at = build_atendimentos()
    recencia_por_atendimento(p, t, ag_pac)
    o, ag_orc = build_orcamentos(p)
    f, ag_fin = build_financeiro(p)
    c, ag_cat = build_catalogo()
    import os
    if os.environ.get("SKIP_CLEAN") != "1":
        exporta_limpo(p, a, t, o, f, c)

    anexos = {
        "atendimento": int(len(ler("atendimentos_arquivos.csv"))),
        "paciente": int(len(ler("pacientes_arquivos.csv"))),
        "pdf_pct": r2((ler("pacientes_arquivos.csv")["Nome Arquivo"].str.lower().str.endswith(".pdf")).mean() * 100),
        "assinatura_digital": int(len(ler("assinatura_digital.csv"))),
        "obs_privada": int(len(ler("obs_privada_medico_paciente.csv"))),
        "prescricoes_memed": int(len(ler("prescricoes_memed.csv"))),
        "textos_rapidos": int(len(ler("textosrapidos.csv"))),
    }
    q(f"anexos: {anexos['atendimento']} arquivos de atendimento + {anexos['paciente']} de paciente aparecem só como link S3 assinado no backup "
      "(os arquivos em si não vieram); links expiram — é preciso baixar os documentos pelo Gestão DS antes de desligar o sistema.")
    dados = {
        "gerado_em": str(HOJE.date()), "fonte": "Backup Gestão DS de 05/10/2026",
        "medico": "Fabrício Lucena de Almeida (único médico no backup)",
        "pacientes": ag_pac, "agenda": ag_ag, "atendimentos": ag_at, "orcamentos": ag_orc,
        "financeiro": ag_fin, "catalogo": ag_cat, "anexos": anexos, "qualidade": QUALIDADE,
    }
    (OUT / "dados.json").write_text(json.dumps(dados, ensure_ascii=False, indent=1, default=str), encoding="utf-8")
    (OUT / "dados.js").write_text("window.DADOS=" + json.dumps(dados, ensure_ascii=False, separators=(",", ":"), default=str) + ";",
                                   encoding="utf-8")
    md = ["# Qualidade de dados — backup Gestão DS 05/10/2026", "",
          "Gerado por `etl/build_dataset.py`. Cada item é um problema real encontrado nos dados de origem.", ""]
    md += [f"{i}. {m}" for i, m in enumerate(QUALIDADE, 1)]
    (OUT / "qualidade.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print("ok:", OUT)
    for m in QUALIDADE:
        print(" -", m)


if __name__ == "__main__":
    main()
