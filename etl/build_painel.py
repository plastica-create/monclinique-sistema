#!/usr/bin/env python3
"""
Monta MVP-Consolidado-Mon-Clinique-v2.html a partir do MVP original,
trocando mockups por módulos com dado real do backup (agregados, sem PII).

  python etl/build_painel.py
Pré-requisito: python etl/build_dataset.py  (gera out/dados.js)
"""
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent          # .../sistema
PROJ = RAIZ.parent                                       # .../Mon Clinique
ORIG = PROJ / "MVP-Consolidado-Mon-Clinique.html"
SAIDA = PROJ / "MVP-Consolidado-Mon-Clinique-v2.html"

html = ORIG.read_text(encoding="utf-8")
panes = (RAIZ / "painel" / "panes.html").read_text(encoding="utf-8")
js2 = (RAIZ / "painel" / "painel2.js").read_text(encoding="utf-8")
dados = (RAIZ / "out" / "dados.js").read_text(encoding="utf-8")


def parte(nome: str) -> str:
    m = re.search(rf"<!--@@{nome}-->\n(.*?)(?=<!--@@|\Z)", panes, re.S)
    assert m, f"parte {nome} não encontrada"
    return m.group(1).rstrip() + "\n"


def troca(padrao: str, novo: str, texto: str, flags=re.S, esperado=1) -> str:
    resultado, n = re.subn(padrao, lambda _: novo, texto, count=1, flags=flags)
    assert n == esperado, f"padrão não encontrado: {padrao[:60]}"
    return resultado


# Chart.js embutido: o painel precisa abrir sem internet (CDN removido)
chartjs = (RAIZ / "painel" / "vendor" / "chart.umd.min.js").read_text(encoding="utf-8")
padrao_cdn = (r'<script src="https://cdn\.jsdelivr\.net/npm/chart\.js@[^"]+"></script>\s*'
              r'<script>\s*if\(typeof Chart===.undefined.\)\{.*?\}\s*</script>')
html, n = re.subn(padrao_cdn, lambda _: "<script>\n" + chartjs.replace("</script", "<" + chr(92) + "/script") + "\n</script>", html, count=1, flags=re.S)
assert n == 1, "bloco do Chart.js não encontrado"
# fontes do Google: sem internet cai no fallback do sistema (o CSS já tem fallback)
html = re.sub(r'<link rel="preconnect"[^>]*>\s*', "", html)

# título
html = html.replace("<title>Mon Clinique · Sistema de Gestão (MVP)</title>", "<title>Mon Clinique · Sistema de Gestão (MVP v2)</title>")
html = html.replace('<div class="sbsub">Almeida Medicina · MVP</div>', '<div class="sbsub">Almeida Medicina · MVP v2</div>')

# navegação: do item "Visão Geral" até o último item do grupo "Gestão do projeto"
html = troca(r'    <button class="navitem active" data-tab="geral">.*?data-tab="road">.*?</button>\n', parte("NAV"), html)

# faixa do topo
html = troca(r'  <div class="topbanner">.*?</div>\n', parte("BANNER"), html)

# visão geral
html = troca(r'  <!-- =+ VISÃO GERAL =+ -->.*?(?=  <!-- =+ AGENDA \(mockup\))', parte("GERAL") + "\n", html)

# agenda + prontuário (mockups) -> agenda, pacientes, prontuário reais
html = troca(r'  <!-- =+ AGENDA \(mockup\) =+ -->.*?(?=  <!-- =+ CRM =+ -->)', parte("PANES_CLINICO") + "\n", html)

# orçamentos, caixa, qualidade e sistema próprio (antes de Documentos)
marca = "  <!-- ===================== DOCUMENTOS (mockup) ===================== -->"
assert marca in html
html = html.replace(marca, parte("PANES_COMERCIAL_FIN") + "\n" + marca, 1)

# divergência
html = troca(r'  <!-- =+ DIVERGÊNCIA =+ -->.*?(?=  <!-- =+ ROADMAP & ESCOPO =+ -->)', parte("DIV") + "\n", html)

# roadmap: scopebox novo
html = troca(r'    <div class="scopebox">\n      <h3>Status real de cada item crítico \(28/09\)</h3>.*?(?=\n  </div>\n\n  <footer>)', parte("ROAD").rstrip("\n"), html)

# rodapé
html = html.replace("MVP consolidado sobre plano de implantação + dados reais (Conta Azul, Black CRM, Meta Ads).",
                    "MVP v2 sobre plano de implantação + dados reais (backup Gestão DS 05/10/2026, Conta Azul, Black CRM, Meta Ads).")
html = html.replace("Protótipo interno de demonstração — não confundir com o sistema em produção nem com número financeiro fechado.",
                    "Protótipo interno de demonstração — sem dado pessoal de paciente. Não confundir com o sistema em produção nem com número financeiro fechado.")

# o JS original chamava renderGeralCharts() e selectPaciente(0) (mockups removidos)
html = troca(r"renderFin\(\);\nrenderGeralCharts\(\);\nselectPaciente\(0\);\n</script>", "renderFin();\n</script>", html)

# Atualizar dados: inclui o backup novo como fonte
html = html.replace("{n:'Dropbox (planilhas e documentos)'",
                    "{n:'Backup Gestão DS (05/10/2026)',s:'Real · foto',c:'#0F7A6B',d:'18 tabelas baixadas e tratadas offline (pacientes, agenda, prontuário, orçamentos, financeiro). Alimenta Agenda, Pacientes, Orçamentos e Caixa. Atualizar = novo backup + rodar etl/build_dataset.py.'},\n    {n:'Dropbox (planilhas e documentos)'", 1)

# KPI estreito: rótulo longo não pode colidir com o "Detalhar ↗" (posição absoluta)
CSS_LINKS = (
    ".kpi,.setorcard,.panel,.tablecard{position:relative}\n"
    ".lnk{font:600 10.5px Inter,system-ui,sans-serif;text-transform:uppercase;letter-spacing:.05em;border:1px solid var(--linha);background:var(--bg);color:var(--mu);border-radius:999px;padding:2px 9px;cursor:pointer;line-height:1.5}\n"
    ".kpi>.lnk,.setorcard>.lnk{position:absolute;right:14px;bottom:12px;opacity:0;transition:.15s}\n"
    ".kpi:hover>.lnk,.setorcard:hover>.lnk,.kpi>.lnk:focus-visible,.setorcard>.lnk:focus-visible{opacity:1}\n"
    ".panel>.lnk,.tablecard>.lnk{position:absolute;right:14px;top:14px;opacity:.55}\n"
    ".panel:hover>.lnk,.tablecard:hover>.lnk,.panel>.lnk:focus-visible,.tablecard>.lnk:focus-visible{opacity:1}\n"
    ".lnk:hover{border-color:var(--acento);color:var(--acento-d)}\n"
    ".lnk.static{position:static;opacity:1;margin-left:6px}\n"
    "@media(hover:none){.kpi>.lnk,.setorcard>.lnk{opacity:.7}}\n"
    ".alvo{outline:3px solid var(--gold);outline-offset:3px;border-radius:var(--raio);transition:outline-color .3s}\n"
    "#toastLink{position:fixed;left:50%;bottom:26px;transform:translateX(-50%) translateY(20px);background:#17201E;color:#fff;padding:10px 18px;border-radius:999px;font:600 13px Inter,system-ui,sans-serif;opacity:0;pointer-events:none;transition:.2s;z-index:300}\n"
    "#toastLink.on{opacity:1;transform:translateX(-50%) translateY(0)}\n"
)
CSS_EXTRA = CSS_LINKS + (".kpi .klab{padding-right:92px;line-height:1.35}\n.kpi .kexp{white-space:nowrap}\n"
             ".kgrid{grid-template-columns:repeat(auto-fit,minmax(250px,1fr))}\n"
             ".kgrid.four{grid-template-columns:repeat(auto-fit,minmax(215px,1fr))}\n")
html = html.replace("</style>", CSS_EXTRA + "</style>", 1)

# injeta dados + JS novo antes de </body>
html = html.replace("</body>", f"<script>\n{dados}\n</script>\n<script>\n{js2}\n</script>\n</body>", 1)

SAIDA.write_text(html, encoding="utf-8")
print("gerado:", SAIDA, f"({SAIDA.stat().st_size/1024:.0f} KB)")
