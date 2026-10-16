/* ===================================================================
   MVP v2 — módulos com dado real do backup Gestão DS (05/10/2026)
   Depende de: window.DADOS (agregados, sem PII) e das funções/constantes
   do painel original (openModal, charts, killChart, brl, brl2, pct, intf,
   AC, ACD, GOLD, RED, INK(), MU(), GRID(), crmC, tempTot, TEMPCOR, MKT).
   =================================================================== */
const D = window.DADOS;
const BLUE = '#6FA8C7', PURP = '#8C86A0', ORG = '#C87941', SAGE = '#7FB5A6', GREY = '#B9BDB8';
const MESES_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const mesLab = m => MESES_PT[+m.slice(5) - 1] + '/' + m.slice(2, 4);
const brlM = v => 'R$ ' + (v / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' mi';
const brlK = v => 'R$ ' + Math.round(v / 1000).toLocaleString('pt-BR') + ' mil';
const pc1 = v => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
const sumA = a => a.reduce((x, y) => x + y, 0);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- registro de views para os KPIs clicáveis ---------- */
const VIEWS = [];
function kpis(el, cards) {
  document.getElementById(el).innerHTML = cards.map(c => {
    const i = VIEWS.push(c.view) - 1;
    return `<div class="kpi" onclick="openModal(VIEWS[${i}]())"><div class="klab"><span class="kdot" style="background:${c.dot}"></span>${c.lab}</div>
      <div class="kval">${c.val}</div><div class="ksub">${c.sub}</div>${c.chip ? `<span class="chip ${c.chip[0]}">${c.chip[1]}</span>` : ''}<span class="kexp">Detalhar ↗</span></div>`;
  }).join('');
}
const objRows = (o, cor, fmt) => Object.entries(o).map(([k, v]) => ({ l: k, v: +v, c: cor, disp: fmt ? fmt(v) : undefined }));

/* ---------- opções comuns de gráfico ---------- */
function gx() { return { grid: { color: GRID() }, ticks: { color: MU(), font: { family: 'Inter', size: 11 }, maxRotation: 0, autoSkip: true } }; }
function legendOpts() { return { labels: { color: INK(), font: { family: 'Inter', size: 11.5 }, usePointStyle: true, boxWidth: 8 } }; }
function mk(id, cfg) { killChart(id); const el = document.getElementById(id); if (!el) return; charts[id] = new Chart(el, cfg); return charts[id]; }
function barH(id, labels, vals, cor, fmt, onClick) {
  mk(id, { type: 'bar', data: { labels, datasets: [{ data: vals, backgroundColor: cor, borderRadius: 5 }] },
    options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, onClick,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => fmt ? fmt(c.parsed.x) : intf(c.parsed.x) } } },
      scales: { x: { ...gx(), ticks: { ...gx().ticks, callback: v => fmt ? fmt(v) : intf(v) } }, y: { ...gx(), ticks: { ...gx().ticks, font: { family: 'Inter', size: 10.5 } } } } } });
}
function barV(id, labels, vals, cor, fmt, onClick) {
  mk(id, { type: 'bar', data: { labels, datasets: [{ data: vals, backgroundColor: cor, borderRadius: 5, maxBarThickness: 46 }] },
    options: { responsive: true, maintainAspectRatio: false, onClick,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => fmt ? fmt(c.parsed.y) : intf(c.parsed.y) } } },
      scales: { x: gx(), y: { ...gx(), ticks: { ...gx().ticks, callback: v => fmt ? fmt(v) : intf(v) } } } } });
}

/* =================================================================
   VISÃO GERAL
   ================================================================= */
function renderGeral() {
  const A = D.agenda, P = D.pacientes, O = D.orcamentos, F = D.financeiro, T = D.atendimentos;
  const ult = A.ult_90d, ant = A.ant_90d;
  document.getElementById('gAgVal').textContent = intf(ult.total);
  document.getElementById('gAgFoot').innerHTML = `${pc1(ult.finalizado / ult.total * 100)} realizados · <b style="color:var(--err-t)">${ult.cancelado} cancelamentos</b> (era ${ant.cancelado} nos 90 dias anteriores)`;
  document.getElementById('gPacVal').textContent = intf(P.total);
  document.getElementById('gPacFoot').innerHTML = `${pc1(P.origem['Não informado'] / P.total * 100)} sem origem registrada · <b>${intf(P.reativar_6_24m)}</b> para reativar`;
  document.getElementById('gOrcVal').textContent = brlM(O.status.Ganho.liquido);
  const velho = O.aberto_aging['mais de 1 ano'];
  document.getElementById('gOrcFoot').innerHTML = `${O.status.Ganho.qtd} fechados · em aberto ${brlM(O.status['Em aberto'].liquido)}, <b style="color:var(--err-t)">${pc1(velho.liquido / O.status['Em aberto'].liquido * 100)} com mais de 1 ano</b>`;
  const r9 = F.reconc_9m;
  document.getElementById('geralReceita').textContent = brlM(r9.gestao_recebido);
  document.getElementById('gFinLab').textContent = 'recebido Out/25–Jun/26 (Gestão DS)';
  document.getElementById('gFinFoot').innerHTML = `Contabilidade: ${brlM(r9.contabilidade)} · Conta Azul: <b style="color:var(--err-t)">${brlM(r9.conta_azul)}</b>`;
  document.getElementById('gRecVal').textContent = brlK(F.a_receber.atrasado.valor);
  document.getElementById('gRecFoot').innerHTML = `${F.a_receber.atrasado.qtd} lançamentos · <b>${brlK(F.atrasado_aging['mais de 1 ano'])}</b> há mais de 1 ano`;
  document.getElementById('gPrVal').textContent = intf(T.total);
  document.getElementById('gPrFoot').innerHTML = `${T.pacientes_distintos.toLocaleString('pt-BR')} pacientes · ${pc1(T.pct_com_texto)} com texto clínico — pronto pra migrar`;

  const noGrid = { display: false, drawTicks: false };
  const base = { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { display: false } }, scales: { x: { display: false, grid: noGrid }, y: { display: false, grid: noGrid } } };
  const mini = (id, type, labels, vals, cor, fmt) => mk(id, { type, data: { labels, datasets: [{ data: vals, backgroundColor: type === 'line' ? 'rgba(15,122,107,.14)' : cor, borderColor: Array.isArray(cor) ? cor[0] : cor, borderRadius: 3, maxBarThickness: 14, fill: type === 'line', tension: .35, borderWidth: 2, pointRadius: 0 }] },
    options: { ...base, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => c.label + ': ' + (fmt ? fmt(c.parsed.y) : intf(c.parsed.y)) } } } } });

  const m12 = A.mes.meses.slice(-13, -1);
  mini('geralAgChart', 'bar', m12.map(mesLab), A.mes.total.slice(-13, -1), AC);
  const nm = P.novos_mes.meses.slice(-24);
  mini('geralPacChart', 'bar', nm.map(mesLab), P.novos_mes.valores.slice(-24), GOLD);
  const ag = Object.keys(O.aberto_aging);
  mini('geralOrcChart', 'bar', ag, ag.map(k => O.aberto_aging[k].liquido), [GOLD, GOLD, '#C89A4E', ORG, RED], v => brlM(v));
  mini('geralComercialChart', 'bar', ['Quente', 'Morno', 'Frio', 'Convert.', 'Perdidos'],
    ['Quente', 'Morno', 'Frio', 'Convertidos', 'Perdidos'].map(tempTot),
    [TEMPCOR.Quente, TEMPCOR.Morno, TEMPCOR.Frio, TEMPCOR.Convertidos, TEMPCOR.Perdidos]);
  const fm = F.meses.slice(24, 46);
  mini('geralFinChart', 'line', fm.map(mesLab), F.receita_recebida_mes.slice(24, 46), AC, brl);
  const ak = Object.keys(F.atrasado_aging);
  mini('geralRecChart', 'bar', ak, ak.map(k => F.atrasado_aging[k]), [GOLD, '#C89A4E', ORG, RED], brl);
  const anos = Object.keys(T.cirurgias_por_ano).filter(a => +a >= 2023);
  mini('geralProntChart', 'bar', anos, anos.map(a => T.cirurgias_por_ano[a]), PURP);
  const top = [...MKT.cri].sort((a, b) => b.inv - a.inv).slice(0, 4);
  mini('geralMktChart', 'bar', top.map(c => c.n), top.map(c => c.inv), AC, brl2);

  /* achados */
  const g = F.reconc_9m, caPct = g.conta_azul / g.contabilidade * 100, gdPct = g.gestao_recebido / g.contabilidade * 100;
  const achados = [
    { t: 'Conta Azul parece capturar só metade da receita', c: 'r', d: `Out/25–Jun/26: contabilidade ${brlM(g.contabilidade)}, Gestão DS ${brlM(g.gestao_recebido)} (${pc1(gdPct)}), Conta Azul ${brlM(g.conta_azul)} (${pc1(caPct)}). A DRE atual provavelmente subestima o faturamento.`, go: 'div' },
    { t: `${pc1(velho.liquido / O.status['Em aberto'].liquido * 100)} do "em aberto" é lead morto`, c: 'y', d: `${intf(O.status['Em aberto'].qtd)} orçamentos abertos somam ${brlM(O.status['Em aberto'].liquido)}, mas ${velho.qtd} têm mais de 1 ano e só ${O.status.Perda.qtd} foram baixados como perda. Pipeline real: ${intf(O.pipeline_recente_180d.qtd)} orçamentos, ${brlM(O.pipeline_recente_180d.liquido)}.`, go: 'orc' },
    { t: 'Cancelamentos dispararam no trimestre', c: 'r', d: `${ult.cancelado} cancelamentos nos últimos 90 dias contra ${ant.cancelado} nos 90 anteriores (ago e set/26: ${A.mes.cancelado.slice(-3, -1).join(' e ')}). Vale entender o motivo antes que vire padrão.`, go: 'agenda' },
    { t: 'Dois em cada três pacientes sem origem', c: 'y', d: `${pc1(P.origem['Não informado'] / P.total * 100)} dos cadastros não têm origem registrada; "Desativar" foi usado como resposta padrão. Sem origem não há como medir retorno de marketing por paciente.`, go: 'pacientes' },
    { t: `${pc1(F.ltv.pareto_top20_pct)} da receita vem de 20% dos pacientes`, c: 'b', d: `Dos ${F.ltv.pacientes_com_receita} pacientes com receita, a mediana é ${brl(F.ltv.mediana)} e a média ${brl(F.ltv.media)}: poucos pacientes cirúrgicos sustentam o caixa. Reativar quem já operou vale mais que captar lead frio.`, go: 'pacientes' },
    { t: `${brlK(F.a_receber.atrasado.valor)} a receber já vencidos`, c: 'y', d: `${F.a_receber.atrasado.qtd} lançamentos de receita não pagos; ${brlK(F.atrasado_aging['mais de 1 ano'])} têm mais de 1 ano (provável baixa pendente). Taxa de cartão no período: ${brlK(F.taxa_cartao.taxa_total)} (${pc1(F.taxa_cartao.taxa_pct)}).`, go: 'caixa' },
  ];
  document.getElementById('achados').style.gridTemplateColumns = 'repeat(3,1fr)';
  document.getElementById('achados').innerHTML = achados.map(a => `<div class="panel" style="cursor:pointer" onclick="goTab('${a.go}')">
      <span class="chip ${a.c}" style="margin:0 0 8px">${a.c === 'r' ? 'Atenção' : a.c === 'y' ? 'Verificar' : 'Insight'}</span>
      <h3 style="margin-bottom:6px">${a.t}</h3><p style="font-size:12.5px;color:var(--ink-2);line-height:1.6">${a.d}</p></div>`).join('');
}

/* =================================================================
   AGENDA
   ================================================================= */
function renderAgenda() {
  const A = D.agenda, u = A.ult_90d, a = A.ant_90d;
  const dlt = (x, y) => y ? ((x / y - 1) * 100) : 0;
  const tot = sumA(Object.values(A.tipo));
  kpis('ag-kpi', [
    { lab: 'Agendamentos · 90 dias', dot: AC, val: intf(u.total), sub: `vs ${a.total} nos 90 dias anteriores`, chip: [dlt(u.total, a.total) >= 0 ? 'g' : 'y', (dlt(u.total, a.total) >= 0 ? '+' : '') + pc1(dlt(u.total, a.total))],
      view: () => ({ eye: 'Composição · Últimos 90 dias', title: 'Como terminaram os agendamentos', tot: intf(u.total), totColor: AC, pctBase: u.total, note: 'Janela de 07/jul a 05/out/2026, sem bloqueios de horário.',
        rows: [{ l: 'Finalizados', v: u.finalizado, c: AC, disp: intf(u.finalizado) }, { l: 'Cancelados', v: u.cancelado, c: RED, disp: intf(u.cancelado) }, { l: 'Outros (sem baixa, em espera)', v: u.total - u.finalizado - u.cancelado, c: GOLD, disp: intf(u.total - u.finalizado - u.cancelado) }] }) },
    { lab: 'Taxa de realização', dot: ACD, val: pc1(A.taxa_realizado), sub: 'Finalizados ÷ agendados (histórico)', chip: ['g', intf(A.status.Finalizado) + ' finalizados'],
      view: () => ({ eye: 'Composição · Status', title: 'Desfecho de todos os agendamentos passados', tot: intf(sumA(Object.values(A.status))), totColor: ACD, pctBase: sumA(Object.values(A.status)), note: 'Desde out/2022, sem bloqueios.', rows: objRows(A.status, ACD, intf) }) },
    { lab: 'Cancelamentos · 90 dias', dot: RED, val: intf(u.cancelado), sub: `era ${a.cancelado} nos 90 dias anteriores`, chip: [u.cancelado > a.cancelado * 3 ? 'r' : 'y', u.cancelado > a.cancelado ? '↑ subiu' : 'estável'],
      view: () => { const m = A.mes.meses.slice(-13, -1); return { eye: 'Composição · Cancelamentos', title: 'Cancelados por mês (últimos 12 meses)', tot: intf(sumA(A.mes.cancelado.slice(-13, -1))), totColor: RED, note: 'Ago e set/2026 concentram o pico. O backup não registra o motivo do cancelamento.', rows: m.map((x, i) => ({ l: mesLab(x), v: A.mes.cancelado.slice(-13, -1)[i], c: RED, disp: intf(A.mes.cancelado.slice(-13, -1)[i]) })) }; } },
    { lab: 'Novos pacientes · 90 dias', dot: GOLD, val: intf(u.primeiro), sub: `vs ${a.primeiro} nos 90 dias anteriores`, chip: ['b', '1º atendimento'],
      view: () => ({ eye: 'Composição · Novos pacientes', title: '"Primeiro atendimento" por mês', tot: intf(sumA(A.primeiro_atend_mes.valores.slice(-12))), totColor: GOLD, note: 'Últimos 12 meses (inclui outubro parcial).', rows: A.primeiro_atend_mes.meses.slice(-12).map((m, i) => ({ l: mesLab(m), v: A.primeiro_atend_mes.valores.slice(-12)[i], c: GOLD, disp: intf(A.primeiro_atend_mes.valores.slice(-12)[i]) })) }) },
    { lab: 'Sem baixa na agenda', dot: '#C89A4E', val: intf(A.sem_baixa), sub: 'passados "não confirmado/confirmado/em espera"', chip: ['y', pc1(A.sem_baixa / tot * 100) + ' do total'],
      view: () => ({ eye: 'Qualidade · Agenda', title: 'Agendamentos passados sem desfecho', tot: intf(A.sem_baixa), totColor: GOLD, note: 'Ou o paciente faltou, ou a recepção não deu baixa. O sistema novo deve obrigar o desfecho (compareceu/faltou/cancelou).', rows: ['Não confirmado', 'Confirmado', 'Em espera'].map(k => ({ l: k, v: A.status[k] || 0, c: GOLD, disp: intf(A.status[k] || 0) })) }) },
    { lab: 'Atendimentos por dia', dot: SAGE, val: A.media_por_dia_atendido.toLocaleString('pt-BR'), sub: `${A.dias_atendidos_12m} dias com atendimento em 12 meses`, chip: ['b', '≈ ' + (A.dias_atendidos_12m / 52).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' dias/semana'],
      view: () => ({ eye: 'Capacidade', title: 'Ritmo de atendimento (12 meses)', note: 'Média de atendimentos finalizados nos dias em que houve atendimento. Capacidade ociosa só dá pra medir quando o sistema novo tiver grade de horários.', rows: [{ l: 'Atendimentos finalizados (12m)', v: A.ultimos_12m, c: AC, disp: intf(A.ultimos_12m), showPct: false }, { l: 'Dias com atendimento', v: A.dias_atendidos_12m, c: GOLD, disp: intf(A.dias_atendidos_12m), showPct: false }] }) },
    { lab: 'Pacientes que voltam', dot: ACD, val: pc1(A.pacientes_recorrentes / A.pacientes_distintos * 100), sub: `${A.pacientes_recorrentes} de ${A.pacientes_distintos} com 2+ atendimentos`, chip: ['g', 'recorrência'],
      view: () => ({ eye: 'Retenção', title: 'Pacientes distintos na agenda', tot: intf(A.pacientes_distintos), totColor: ACD, pctBase: A.pacientes_distintos, rows: [{ l: 'Com 2 ou mais atendimentos', v: A.pacientes_recorrentes, c: ACD, disp: intf(A.pacientes_recorrentes) }, { l: 'Com 1 atendimento', v: A.pacientes_distintos - A.pacientes_recorrentes, c: GOLD, disp: intf(A.pacientes_distintos - A.pacientes_recorrentes) }] }) },
    { lab: 'Retornos', dot: PURP, val: pc1((A.tipo.Retorno || 0) / tot * 100), sub: `${intf(A.tipo.Retorno || 0)} de ${intf(tot)} agendamentos`, chip: ['b', 'pós-op e acompanhamento'],
      view: () => ({ eye: 'Composição · Tipo', title: 'Agendamentos por tipo', tot: intf(tot), totColor: PURP, pctBase: tot, rows: objRows(A.tipo, PURP, intf) }) },
  ]);

  const ms = A.mes.meses, lab = ms.map(mesLab);
  mk('agMesChart', { type: 'bar', data: { labels: lab, datasets: [
      { label: 'Finalizados', data: A.mes.finalizado, backgroundColor: AC, stack: 's' },
      { label: 'Cancelados', data: A.mes.cancelado, backgroundColor: RED, stack: 's' },
      { label: 'Sem baixa', data: A.mes.sem_baixa, backgroundColor: GOLD, stack: 's' }] },
    options: { responsive: true, maintainAspectRatio: false, onClick: (e, els) => { if (!els.length) return; const i = els[0].index;
        openModal({ eye: 'Composição · ' + lab[i], title: 'Agendamentos do mês', tot: intf(A.mes.total[i]), totColor: AC, pctBase: A.mes.total[i], rows: [
          { l: 'Finalizados', v: A.mes.finalizado[i], c: AC, disp: intf(A.mes.finalizado[i]) }, { l: 'Cancelados', v: A.mes.cancelado[i], c: RED, disp: intf(A.mes.cancelado[i]) }, { l: 'Sem baixa', v: A.mes.sem_baixa[i], c: GOLD, disp: intf(A.mes.sem_baixa[i]) }] }); },
      plugins: { legend: legendOpts() }, scales: { x: { ...gx(), stacked: true, ticks: { ...gx().ticks, maxTicksLimit: 12 } }, y: { ...gx(), stacked: true } } } });
  const cores = { Consulta: AC, Retorno: GOLD, Procedimento: BLUE, Cirurgia: PURP };
  mk('agTipoChart', { type: 'line', data: { labels: lab, datasets: Object.keys(A.mes_tipo).map(k => ({ label: k, data: A.mes_tipo[k], borderColor: cores[k], backgroundColor: cores[k], tension: .3, borderWidth: 2, pointRadius: 0 })) },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: legendOpts() }, scales: { x: { ...gx(), ticks: { ...gx().ticks, maxTicksLimit: 12 } }, y: gx() } } });
  barV('agPrimChart', A.primeiro_atend_mes.meses.map(mesLab), A.primeiro_atend_mes.valores, GOLD);
  const pt = Object.entries(A.proc_top);
  barH('agProcChart', pt.map(x => x[0].length > 30 ? x[0].slice(0, 29) + '…' : x[0]), pt.map(x => x[1]), AC);

  const H = A.heat, mx = Math.max(...H.valores.flat(), 1);
  document.getElementById('agHeat').innerHTML = '<thead><tr><th>Hora</th>' + H.dias.map(d => `<th>${d}</th>`).join('') + '</tr></thead><tbody>' +
    H.horas.map((h, hi) => `<tr><td>${String(h).padStart(2, '0')}h</td>` + H.valores.map(row => { const v = row[hi]; const al = v / mx;
      return `<td style="text-align:center;background:rgba(15,122,107,${(al * .85).toFixed(2)});color:${al > .5 ? '#fff' : 'inherit'}">${v || ''}</td>`; }).join('') + '</tr>').join('') + '</tbody>';
}

/* =================================================================
   PACIENTES
   ================================================================= */
function renderPacientes() {
  const P = D.pacientes, F = D.financeiro, L = F.ltv, T = D.atendimentos;
  const sx = P.sexo, fem = sx.F / (sx.F + sx.M) * 100;
  const novosOrg = P.novos_origem_2023_26, totNovos = sumA(Object.values(novosOrg));
  kpis('pac-kpi', [
    { lab: 'Pacientes cadastrados', dot: AC, val: intf(P.total), sub: 'desde out/2022 (inclui carga inicial)', chip: ['b', intf(P.cadastro_por_ano['2022']) + ' são carga de 2022'],
      view: () => ({ eye: 'Composição · Cadastros', title: 'Cadastros por ano', tot: intf(P.total), totColor: AC, pctBase: P.total, note: '2022 não é captação: é a carga inicial do Gestão DS em out/2022. Captação real: ~150–210 novos pacientes por ano.', rows: objRows(P.cadastro_por_ano, AC, intf) }) },
    { lab: 'Atendidos nos últimos 12 meses', dot: ACD, val: intf(P.ativos_12m), sub: pc1(P.ativos_12m / P.total * 100) + ' da base', chip: ['g', 'base ativa'],
      view: () => ({ eye: 'Recência', title: 'Última visita (pelo prontuário)', tot: intf(P.total), totColor: ACD, pctBase: P.total, rows: objRows(P.recencia, ACD, intf) }) },
    { lab: 'Para reativar (6–24 meses)', dot: GOLD, val: intf(P.reativar_6_24m), sub: 'sem atendimento entre 6 e 24 meses', chip: ['y', 'oportunidade'],
      view: () => ({ eye: 'Oportunidade', title: 'Pacientes parados', tot: intf(P.reativar_6_24m), totColor: GOLD, note: 'A lista nominal (com telefone e histórico) está no Painel-Operacional-LOCAL, aba Reativação.', rows: ['6–12 meses', '12–24 meses'].map(k => ({ l: k, v: P.recencia[k], c: GOLD, disp: intf(P.recencia[k]) })) }) },
    { lab: 'Sem origem registrada', dot: RED, val: pc1(P.origem['Não informado'] / P.total * 100), sub: intf(P.origem['Não informado']) + ' cadastros', chip: ['r', 'campo "Desativar"'],
      view: () => ({ eye: 'Qualidade · Origem', title: 'Origem dos cadastros', tot: intf(P.total), totColor: RED, pctBase: P.total, note: 'O campo Indicação foi preenchido com "Desativar" em 794 cadastros — resíduo de configuração, não é origem real.', rows: objRows(P.origem, AC, intf) }) },
    { lab: 'Perfil', dot: PURP, val: pc1(fem) + ' mulheres', sub: `idade média ${P.idade_media.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} anos`, chip: ['b', intf(P.idade_sem_dado) + ' sem nascimento'],
      view: () => ({ eye: 'Perfil', title: 'Faixa etária', tot: intf(sumA(Object.values(P.faixa_etaria))), totColor: PURP, pctBase: sumA(Object.values(P.faixa_etaria)), note: 'Só pacientes com data de nascimento válida.', rows: objRows(P.faixa_etaria, PURP, intf) }) },
    { lab: 'Já operaram', dot: ACD, val: intf(P.pacientes_com_cirurgia), sub: pc1(P.pacientes_com_cirurgia / P.total * 100) + ' da base · ' + intf(P.cirurgias_total) + ' cirurgias', chip: ['g', intf(P.pacientes_com_procedimento) + ' fizeram procedimento'],
      view: () => ({ eye: 'Valor clínico', title: 'Pacientes por tipo de serviço', rows: [{ l: 'Com cirurgia', v: P.pacientes_com_cirurgia, c: ACD, disp: intf(P.pacientes_com_cirurgia), showPct: false }, { l: 'Com procedimento', v: P.pacientes_com_procedimento, c: GOLD, disp: intf(P.pacientes_com_procedimento), showPct: false }] }) },
    { lab: 'Gasto mediano × médio', dot: GOLD, val: brl(L.mediana) + ' / ' + brl(L.media), sub: `${intf(L.pacientes_com_receita)} pacientes com receita paga`, chip: ['y', 'cauda longa'],
      view: () => ({ eye: 'Valor do paciente', title: 'Receita acumulada por paciente', tot: intf(L.pacientes_com_receita), pctBase: L.pacientes_com_receita, note: 'A mediana é baixa porque muitos pacientes só fizeram consulta; poucos pacientes cirúrgicos puxam a média. Vínculo por nome (o financeiro não traz código de paciente).', rows: objRows(L.faixas, GOLD, intf) }) },
    { lab: 'Concentração (Pareto)', dot: RED, val: pc1(L.pareto_top20_pct), sub: 'da receita vem de 20% dos pacientes', chip: ['r', 'top 10% = ' + pc1(L.pareto_top10_pct)],
      view: () => ({ eye: 'Concentração', title: 'Quanto os melhores pacientes pesam', note: 'Receita paga acumulada por paciente, ordenada do maior para o menor.', rows: [{ l: 'Top 10% dos pacientes', v: L.pareto_top10_pct, c: ACD, disp: pc1(L.pareto_top10_pct), showPct: false }, { l: 'Top 20% dos pacientes', v: L.pareto_top20_pct, c: GOLD, disp: pc1(L.pareto_top20_pct), showPct: false }] }) },
  ]);

  const or = Object.entries(novosOrg).sort((a, b) => b[1] - a[1]);
  mk('pacOrigemChart', { type: 'bar', data: { labels: or.map(x => x[0]), datasets: [{ data: or.map(x => x[1]), backgroundColor: or.map(x => x[0] === 'Não informado' ? GREY : AC), borderRadius: 5 }] },
    options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, onClick: () => openModal({ eye: 'Origem · cadastros 2023–2026', title: 'Origem dos pacientes novos', tot: intf(totNovos), pctBase: totNovos, rows: or.map(x => ({ l: x[0], v: x[1], c: x[0] === 'Não informado' ? GREY : AC, disp: intf(x[1]) })) }),
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => intf(c.parsed.x) + ' (' + pc1(c.parsed.x / totNovos * 100) + ')' } } }, scales: { x: gx(), y: { ...gx(), ticks: { ...gx().ticks, font: { family: 'Inter', size: 10.5 } } } } } });
  barV('pacNovosChart', P.novos_mes.meses.map(mesLab), P.novos_mes.valores, GOLD);
  const rc = Object.entries(P.recencia);
  barV('pacRecChart', rc.map(x => x[0]), rc.map(x => x[1]), rc.map(x => x[0] === '6–12 meses' || x[0] === '12–24 meses' ? GOLD : x[0].startsWith('sem') ? GREY : AC));
  const lf = Object.entries(L.faixas);
  barV('pacLtvChart', lf.map(x => x[0]), lf.map(x => x[1]), ACD);
  const cd = Object.entries(P.cidade_top).filter(x => x[0] !== 'Não informado');
  barH('pacCidadeChart', cd.map(x => x[0]), cd.map(x => x[1]), AC);
  const fe = Object.entries(P.faixa_etaria);
  document.getElementById('pacIdadeSub').textContent = `${intf(sumA(fe.map(x => x[1])))} pacientes com nascimento válido (${intf(P.idade_sem_dado)} sem data)`;
  barV('pacIdadeChart', fe.map(x => x[0]), fe.map(x => x[1]), PURP);
  const ap = Object.entries(T.atend_por_paciente);
  barV('pacRecorChart', ap.map(x => x[0] + ' atend.'), ap.map(x => x[1]), SAGE);
}

/* =================================================================
   PRONTUÁRIO
   ================================================================= */
function renderProntuario() {
  const T = D.atendimentos, X = D.anexos, P = D.pacientes;
  kpis('pr-kpi', [
    { lab: 'Atendimentos registrados', dot: AC, val: intf(T.total), sub: '2013 a 2026 · inclui histórico importado', chip: ['b', '238 linhas com código repetido'],
      view: () => ({ eye: 'Composição · Serviço', title: 'Atendimentos por tipo de serviço', tot: intf(T.total), totColor: AC, pctBase: T.total, rows: objRows(T.servico, AC, intf) }) },
    { lab: 'Pacientes com prontuário', dot: ACD, val: intf(T.pacientes_distintos), sub: pc1(T.pacientes_distintos / P.total * 100) + ' dos cadastros', chip: ['g', 'recorrência'],
      view: () => ({ eye: 'Retenção', title: 'Atendimentos por paciente', tot: intf(T.pacientes_distintos), pctBase: T.pacientes_distintos, rows: objRows(T.atend_por_paciente, ACD, intf) }) },
    { lab: 'Prontuário preenchido', dot: GOLD, val: pc1(T.pct_com_texto), sub: `texto médio de ${intf(T.tamanho_medio_texto)} caracteres`, chip: ['g', 'migrável'],
      view: () => ({ eye: 'Qualidade clínica', title: '% de atendimentos com texto, por ano', note: 'O texto em si não é exibido neste painel.', rows: Object.entries(T.texto_por_ano).map(([k, v]) => ({ l: k, v: v, c: GOLD, disp: pc1(v), showPct: false })) }) },
    { lab: 'Cirurgias registradas', dot: PURP, val: intf(T.servico.Cirurgia), sub: `${intf(T.servico.Procedimento)} procedimentos`, chip: ['b', 'no prontuário'],
      view: () => ({ eye: 'Produção clínica', title: 'Cirurgias e procedimentos por ano', rows: Object.keys(T.cirurgias_por_ano).map(a => ({ l: a, v: T.cirurgias_por_ano[a] + (T.procedimentos_por_ano[a] || 0), c: PURP, disp: `${T.cirurgias_por_ano[a]} cir. · ${T.procedimentos_por_ano[a] || 0} proc.`, showPct: false })) }) },
    { lab: 'Anexos de atendimento', dot: BLUE, val: intf(X.atendimento), sub: 'exames, laudos, documentos', chip: ['r', 'só link temporário'],
      view: () => ({ eye: 'Risco de migração', title: 'Anexos no backup', note: 'No backup, cada anexo é um link assinado do S3 que expira. Os arquivos precisam ser baixados pelo Gestão DS antes de desligar o sistema.', rows: [{ l: 'Anexos de atendimentos', v: X.atendimento, c: BLUE, disp: intf(X.atendimento), showPct: false }, { l: 'Anexos de cadastro de paciente', v: X.paciente, c: BLUE, disp: intf(X.paciente), showPct: false }] }) },
    { lab: 'Anexos de cadastro', dot: BLUE, val: intf(X.paciente), sub: pc1(X.pdf_pct) + ' em PDF', chip: ['r', 'só link temporário'],
      view: () => ({ eye: 'Risco de migração', title: 'Anexos no cadastro', note: 'Mesmo caso: links temporários.', rows: [{ l: 'PDF', v: X.pdf_pct, c: BLUE, disp: pc1(X.pdf_pct), showPct: false }] }) },
    { lab: 'Termos de consentimento', dot: RED, val: intf(X.assinatura_digital), sub: 'assinaturas digitais no backup', chip: ['r', 'LGPD'],
      view: () => ({ eye: 'LGPD', title: 'Consentimentos', note: 'A tabela de assinatura digital veio vazia. Nenhum termo de consentimento (inclusive de gravação Plaud) pode ser migrado: eles precisam nascer no sistema novo.', rows: [{ l: 'Assinaturas digitais', v: X.assinatura_digital, c: RED, disp: '0', showPct: false }, { l: 'Observações privadas do médico', v: X.obs_privada, c: GOLD, disp: intf(X.obs_privada), showPct: false }] }) },
    { lab: 'Prescrições Memed', dot: SAGE, val: intf(X.prescricoes_memed), sub: `${X.prescricoes_memed + 4} prescrições no total`, chip: ['b', 'uso baixo'],
      view: () => ({ eye: 'Receituário', title: 'Prescrições', rows: [{ l: 'Memed', v: X.prescricoes_memed, c: SAGE, disp: intf(X.prescricoes_memed), showPct: false }, { l: 'Texto livre', v: 4, c: SAGE, disp: '4', showPct: false }, { l: 'Textos rápidos do médico', v: X.textos_rapidos, c: GOLD, disp: intf(X.textos_rapidos), showPct: false }] }) },
  ]);
  const ms = T.mes.meses.map(mesLab), s = T.mes.series;
  mk('prMesChart', { type: 'bar', data: { labels: ms, datasets: [{ label: 'Consulta', data: s.Consulta, backgroundColor: AC, stack: 's' }, { label: 'Procedimento', data: s.Procedimento, backgroundColor: BLUE, stack: 's' }, { label: 'Cirurgia', data: s.Cirurgia, backgroundColor: PURP, stack: 's' }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: legendOpts() }, scales: { x: { ...gx(), stacked: true, ticks: { ...gx().ticks, maxTicksLimit: 12 } }, y: { ...gx(), stacked: true } } } });
  const anos = Object.keys(T.cirurgias_por_ano);
  mk('prAnoChart', { type: 'bar', data: { labels: anos, datasets: [{ label: 'Cirurgias', data: anos.map(a => T.cirurgias_por_ano[a]), backgroundColor: PURP, borderRadius: 5 }, { label: 'Procedimentos', data: anos.map(a => T.procedimentos_por_ano[a] || 0), backgroundColor: BLUE, borderRadius: 5 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: legendOpts() }, scales: { x: gx(), y: gx() } } });
  const cir = Object.entries(T.cirurgias_top), prc = Object.entries(T.proc_realizados_top);
  barH('prCirChart', cir.map(x => x[0].length > 32 ? x[0].slice(0, 31) + '…' : x[0]), cir.map(x => x[1]), PURP);
  barH('prProcChart', prc.map(x => x[0].length > 32 ? x[0].slice(0, 31) + '…' : x[0]), prc.map(x => x[1]), BLUE);
  const rows = [
    ['Texto de cada atendimento (HTML + texto limpo)', 'Vem no backup', 'ok', '8.920 registros · 99% preenchidos'],
    ['Vínculo atendimento ↔ paciente', 'Vem no backup', 'ok', 'por código do paciente'],
    ['Anexos (exames, laudos, PDFs)', 'Link temporário', 'off', 'baixar pelo Gestão DS antes de desligar'],
    ['Prescrições', 'Vem no backup', 'ok', '28 Memed + 4 texto livre'],
    ['Observação privada do médico', 'Vem no backup', 'pend', 'só 1 registro — avaliar se o recurso é usado'],
    ['Consentimento LGPD / assinatura digital', 'Não vem', 'off', 'tabela vazia — criar no sistema novo'],
    ['Tela de prontuário com acesso por perfil', 'A construir', 'off', 'RLS já desenhada em sistema/db'],
    ['Auditoria de leitura de prontuário', 'A construir', 'off', 'tabela e função prontas em sistema/db'],
    ['Plaud → Claude → rascunho de evolução', 'A construir', 'pend', 'leitura via MCP provada; arquivamento depende da tela'],
  ];
  document.getElementById('prChecklist').innerHTML = '<thead><tr><th style="text-align:left">Item</th><th>Situação</th><th style="text-align:left">Detalhe</th></tr></thead><tbody>' +
    rows.map(r => `<tr><td>${r[0]}</td><td><span class="statuspill ${r[2]}">${r[1]}</span></td><td style="text-align:left;white-space:normal" class="mut">${r[3]}</td></tr>`).join('') + '</tbody>';
}

/* =================================================================
   ORÇAMENTOS
   ================================================================= */
function renderOrcamentos() {
  const O = D.orcamentos, S = O.status, ab = O.aberto_aging, velho = ab['mais de 1 ano'];
  document.getElementById('orc-aviso').innerHTML = `<b>Leia o "em aberto" com cuidado.</b> ${intf(S['Em aberto'].qtd)} orçamentos estão em aberto (${brlM(S['Em aberto'].liquido)}), mas <b>${velho.qtd} têm mais de 1 ano</b> e só ${S.Perda.qtd} foram baixados como "Perda". Isso é histórico nunca encerrado, não pipeline. Além disso, ${intf(O.ganho_por_data_top['2026-04-29'] || 0)} ganhos têm a mesma data (29/04/2026): foi fechamento em lote, então "Data Ganho" não mede ritmo de vendas.`;
  const coorte = O.coorte, cm = coorte.meses;
  const rec12 = cm.map((m, i) => i).filter(i => cm[i] >= '2025-04' && cm[i] <= '2026-03');
  const qG = sumA(rec12.map(i => coorte.qtd.Ganho[i])), qT = sumA(rec12.map(i => coorte.qtd.Ganho[i] + coorte.qtd['Em aberto'][i] + coorte.qtd.Perda[i]));
  const vG = sumA(rec12.map(i => coorte.valor.Ganho[i]));
  kpis('orc-kpi', [
    { lab: 'Vendas fechadas (ganhos)', dot: ACD, val: brlM(S.Ganho.liquido), sub: `${S.Ganho.qtd} orçamentos · ticket médio ${brl(O.ticket_medio_ganho)}`, chip: ['g', 'desconto médio ' + pc1(O.desconto_pct_ganho)],
      view: () => ({ eye: 'Composição · Ganhos', title: 'Orçamentos ganhos', tot: brlM(S.Ganho.liquido), totColor: ACD, note: 'Valor líquido, depois do desconto. Bruto: ' + brlM(S.Ganho.bruto) + '.', rows: Object.entries(O.faixa_valor_ganho).map(([k, v]) => ({ l: k, v, c: ACD, disp: intf(v) + ' orçamentos', showPct: false })) }) },
    { lab: 'Conversão (coorte 12 meses)', dot: GOLD, val: pc1(qG / qT * 100), sub: `${qG} ganhos de ${qT} emitidos entre abr/25 e mar/26`, chip: ['y', brlM(vG) + ' fechados'],
      view: () => ({ eye: 'Conversão', title: 'Coorte abr/25–mar/26', note: 'Percentual de orçamentos emitidos na janela que já viraram venda. É a taxa honesta: não mistura histórico morto. Histórico total: ' + pc1(O.conv_sobre_total) + '.', rows: rec12.map(i => ({ l: mesLab(cm[i]), v: coorte.qtd.Ganho[i] + coorte.qtd['Em aberto'][i] + coorte.qtd.Perda[i], c: GOLD, disp: `${coorte.qtd.Ganho[i]} ganhos de ${coorte.qtd.Ganho[i] + coorte.qtd['Em aberto'][i] + coorte.qtd.Perda[i]}`, showPct: false })) }) },
    { lab: 'Pipeline real (até 180 dias)', dot: AC, val: brlM(O.pipeline_recente_180d.liquido), sub: `${O.pipeline_recente_180d.qtd} orçamentos em aberto`, chip: ['g', 'acionável'],
      view: () => ({ eye: 'Pipeline', title: 'Em aberto por idade', tot: brlM(S['Em aberto'].liquido), pctBase: S['Em aberto'].liquido, note: 'Só as 3 primeiras faixas (até 180 dias) são pipeline de verdade. A lista nominal para follow-up está no Painel-Operacional-LOCAL.', rows: Object.entries(ab).map(([k, v]) => ({ l: k, v: v.liquido, c: k === 'mais de 1 ano' ? RED : GOLD, disp: `${intf(v.qtd)} · ${brlK(v.liquido)}` })) }) },
    { lab: 'Em aberto com mais de 1 ano', dot: RED, val: intf(velho.qtd), sub: brlM(velho.liquido) + ' parados', chip: ['r', pc1(velho.qtd / S['Em aberto'].qtd * 100) + ' do em aberto'],
      view: () => ({ eye: 'Higiene da base', title: 'Candidatos a baixa como perda', tot: brlM(velho.liquido), totColor: RED, note: 'Baixar como perda limpa o funil e mostra a taxa de conversão real. Decisão é comercial — o painel local lista os candidatos para revisão.', rows: [{ l: 'Orçamentos em aberto > 1 ano', v: velho.qtd, c: RED, disp: intf(velho.qtd), showPct: false }, { l: 'Dos quais já vencidos (validade)', v: O.aberto_vencido.qtd, c: GOLD, disp: intf(O.aberto_vencido.qtd), showPct: false }] }) },
    { lab: 'Marcados como "Quente"', dot: ORG, val: intf(O.aberto_situacao.Quente.qtd), sub: brlK(O.aberto_situacao.Quente.liquido) + ' em aberto', chip: ['y', 'prioridade de contato'],
      view: () => ({ eye: 'Temperatura', title: 'Em aberto por situação', tot: intf(S['Em aberto'].qtd), pctBase: S['Em aberto'].qtd, rows: Object.entries(O.aberto_situacao).map(([k, v]) => ({ l: k, v: v.qtd, c: k === 'Quente' ? ORG : k === 'Morno' ? GOLD : BLUE, disp: `${intf(v.qtd)} · ${brlK(v.liquido)}` })) }) },
    { lab: 'Perdas registradas', dot: RED, val: intf(S.Perda.qtd), sub: brlK(S.Perda.liquido) + ' · o motivo não é registrado', chip: ['r', 'subnotificado'],
      view: () => ({ eye: 'Perdas', title: 'Por que a perda quase não aparece', note: 'Só ' + S.Perda.qtd + ' de ' + O.total + ' orçamentos viraram "Perda" (16 em um único dia). O sistema novo precisa exigir motivo ao encerrar.', rows: [{ l: 'Perda', v: S.Perda.qtd, c: RED, disp: intf(S.Perda.qtd), showPct: false }, { l: 'Em aberto > 1 ano', v: velho.qtd, c: GOLD, disp: intf(velho.qtd), showPct: false }] }) },
    { lab: 'Pacientes com 2+ orçamentos', dot: PURP, val: intf(O.pacientes_multi_orc), sub: `de ${intf(O.pacientes_distintos)} pacientes orçados`, chip: ['b', 'máx ' + O.orc_por_paciente_max + ' por paciente'],
      view: () => ({ eye: 'Retenção comercial', title: 'Pacientes orçados', tot: intf(O.pacientes_distintos), rows: [{ l: 'Com 2 ou mais orçamentos', v: O.pacientes_multi_orc, c: PURP, disp: intf(O.pacientes_multi_orc), showPct: false }] }) },
    { lab: 'Planejamento cirúrgico', dot: AC, val: pc1(O.por_titulo['Planejamento cirúrgico'].qtd / O.total * 100), sub: brlM(O.por_titulo['Planejamento cirúrgico'].liquido_ganho) + ' fechados', chip: ['g', pc1(O.por_titulo['Planejamento cirúrgico'].liquido_ganho / S.Ganho.liquido * 100) + ' das vendas'],
      view: () => ({ eye: 'Composição · Tipo', title: 'Por tipo de orçamento', rows: Object.entries(O.por_titulo).map(([k, v]) => ({ l: k, v: v.liquido_ganho, c: AC, disp: `${v.ganho} de ${v.qtd} · ${brlK(v.liquido_ganho)}` })) }) },
  ]);

  mk('orcCoorteChart', { type: 'bar', data: { labels: cm.map(mesLab), datasets: [
      { label: 'Ganho', data: coorte.qtd.Ganho, backgroundColor: ACD, stack: 's' }, { label: 'Em aberto', data: coorte.qtd['Em aberto'], backgroundColor: GOLD, stack: 's' }, { label: 'Perda', data: coorte.qtd.Perda, backgroundColor: RED, stack: 's' }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: legendOpts() }, scales: { x: { ...gx(), stacked: true, ticks: { ...gx().ticks, maxTicksLimit: 12 } }, y: { ...gx(), stacked: true } } } });
  const ak = Object.keys(ab);
  barV('orcAgingChart', ak, ak.map(k => ab[k].liquido), [GOLD, GOLD, '#C89A4E', ORG, RED], v => 'R$' + (v / 1e6).toFixed(1) + ' mi',
    (e, els) => { if (els.length) { const k = ak[els[0].index]; openModal({ eye: 'Em aberto · ' + k, title: 'Orçamentos nesta faixa', tot: brlM(ab[k].liquido), totColor: RED, rows: [{ l: 'Quantidade', v: ab[k].qtd, c: GOLD, disp: intf(ab[k].qtd), showPct: false }, { l: 'Valor líquido', v: ab[k].liquido, c: RED, disp: brl(ab[k].liquido), showPct: false }] }); } });
  const vend = Object.entries(O.por_vendedor).sort((a, b) => b[1].liquido_ganho - a[1].liquido_ganho);
  document.getElementById('orcVend').innerHTML = '<thead><tr><th>Quem orçou</th><th>Emitidos</th><th>Ganhos</th><th>Taxa de ganho</th><th>Valor ganho</th><th>Em aberto</th></tr></thead><tbody>' +
    vend.map(([n, v]) => `<tr><td>${esc(n)}</td><td>${intf(v.qtd)}</td><td>${intf(v.ganho)}</td><td>${pc1(v.taxa)}</td><td>${brl(v.liquido_ganho)}</td><td class="mut">${intf(v.em_aberto)}</td></tr>`).join('') + '</tbody>';
  const fv = Object.entries(O.faixa_valor_ganho);
  barV('orcFaixaChart', fv.map(x => x[0]), fv.map(x => x[1]), ACD);
  const sit = Object.entries(O.aberto_situacao);
  mk('orcTempChart', { type: 'doughnut', data: { labels: sit.map(x => x[0]), datasets: [{ data: sit.map(x => x[1].qtd), backgroundColor: [ORG, GOLD, BLUE], borderWidth: 2, borderColor: '#fff' }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: '60%', plugins: { legend: { position: 'bottom', labels: legendOpts().labels }, tooltip: { callbacks: { label: c => c.label + ': ' + intf(c.parsed) + ' · ' + brlK(sit[c.dataIndex][1].liquido) } } } } });
}

/* =================================================================
   CAIXA & RECEBÍVEIS
   ================================================================= */
function renderCaixa() {
  const F = D.financeiro, an = F.anos, tc = F.taxa_cartao, ar = F.a_receber;
  document.getElementById('cx-aviso').innerHTML = `<b>Receita completa até out/2026; despesa só até ${mesLab(F.despesa_cobertura_ate)}.</b> O Gestão DS deixou de receber lançamentos de despesa em ${mesLab(F.despesa_cobertura_ate)} (hoje elas vão para o Conta Azul), então resultado e lucro de 2026 não saem daqui. "Recebido" usa o valor líquido de taxa de cartão. Dados de data inconsistentes (ex.: pagamento em 2103) foram corrigidos no tratamento — ver Qualidade dos dados.`;
  const y25 = an['2025'], y24 = an['2024'], y26 = an['2026'];
  kpis('cx-kpi', [
    { lab: 'Recebido em 2025', dot: AC, val: brlM(y25.receita_recebida), sub: `+${pc1((y25.receita_recebida / y24.receita_recebida - 1) * 100)} vs 2024 (${brlM(y24.receita_recebida)})`, chip: ['g', 'ano fechado'],
      view: () => ({ eye: 'Composição · Receita recebida', title: 'Receita recebida por ano', rows: Object.entries(an).map(([a, v]) => ({ l: a + (a === '2026' ? ' (até out)' : ''), v: v.receita_recebida, c: AC, disp: brl(v.receita_recebida), showPct: false })) }) },
    { lab: 'Recebido em 2026 (até out)', dot: ACD, val: brlM(y26.receita_recebida), sub: 'inclui parcelas futuras já lançadas como pagas', chip: ['b', 'parcial'],
      view: () => ({ eye: 'Composição · 2026', title: 'Receita recebida por mês, 2026', rows: F.meses.map((m, i) => ({ m, i })).filter(x => x.m.startsWith('2026')).map(x => ({ l: mesLab(x.m), v: F.receita_recebida_mes[x.i], c: ACD, disp: brl(F.receita_recebida_mes[x.i]), showPct: false })) }) },
    { lab: 'A receber atrasado', dot: RED, val: brlK(ar.atrasado.valor), sub: `${ar.atrasado.qtd} lançamentos vencidos e não pagos`, chip: ['r', brlK(F.atrasado_aging['mais de 1 ano']) + ' > 1 ano'],
      view: () => ({ eye: 'Composição · Atrasado', title: 'Carteira atrasada por idade', tot: brl(ar.atrasado.valor), totColor: RED, pctBase: ar.atrasado.valor, note: 'A lista nominal para cobrança está no Painel-Operacional-LOCAL, aba A receber. O que tem mais de 1 ano provavelmente é baixa não registrada.', rows: Object.entries(F.atrasado_aging).map(([k, v]) => ({ l: k, v, c: k.startsWith('mais') ? RED : GOLD, disp: brl(v) })) }) },
    { lab: 'Taxa de cartão paga', dot: GOLD, val: brlK(tc.taxa_total), sub: `${pc1(tc.taxa_pct)} do bruto no cartão · crédito ${pc1(tc.credito_pct)}`, chip: ['y', 'custo evitável?'],
      view: () => ({ eye: 'Custo financeiro', title: 'Cartão: bruto × líquido', rows: [{ l: 'Bruto vendido no cartão', v: tc.bruto, c: AC, disp: brl(tc.bruto), showPct: false }, { l: '(−) Taxa retida', v: -tc.taxa_total, c: RED, disp: brl(tc.taxa_total), showPct: false }, { l: 'Líquido recebido', v: tc.liquido, c: ACD, disp: brl(tc.liquido), bold: true, showPct: false }] }) },
    { lab: 'Pix é a forma dominante', dot: ACD, val: pc1(F.forma_receita.Pix / sumA(Object.values(F.forma_receita)) * 100), sub: 'da receita recebida', chip: ['g', 'cartão ' + pc1(F.forma_receita['Cartão de crédito'] / sumA(Object.values(F.forma_receita)) * 100)],
      view: () => ({ eye: 'Composição · Forma', title: 'Receita por forma de pagamento', tot: brl(sumA(Object.values(F.forma_receita))), pctBase: sumA(Object.values(F.forma_receita)), rows: objRows(F.forma_receita, AC, brl) }) },
    { lab: 'Categoria "Orçamento"', dot: GOLD, val: pc1(F.receita_categoria['Orçamento'] / sumA(Object.values(F.receita_categoria)) * 100), sub: 'da receita: cirurgias e planejamentos vêm lançados assim', chip: ['y', 'categoria pouco granular'],
      view: () => ({ eye: 'Composição · Categoria', title: 'Receita por categoria', pctBase: sumA(Object.values(F.receita_categoria)), note: 'A categoria "Orçamento" mistura cirurgia e procedimento. Para separar produto no sistema novo é preciso vincular o lançamento ao item do orçamento.', rows: objRows(F.receita_categoria, GOLD, brl) }) },
    { lab: 'A vencer', dot: BLUE, val: brlK(ar.a_vencer.valor), sub: `${ar.a_vencer.qtd} lançamentos futuros não pagos`, chip: ['b', 'carteira saudável'],
      view: () => ({ eye: 'Fluxo', title: 'Carteira de recebíveis', rows: [{ l: 'Atrasado', v: ar.atrasado.valor, c: RED, disp: brl(ar.atrasado.valor), showPct: false }, { l: 'A vencer', v: ar.a_vencer.valor, c: BLUE, disp: brl(ar.a_vencer.valor), showPct: false }] }) },
    { lab: 'Despesas a pagar lançadas', dot: PURP, val: brlK(F.a_pagar.valor), sub: `${F.a_pagar.qtd} lançamentos de despesa em aberto`, chip: ['y', 'conferir no Conta Azul'],
      view: () => ({ eye: 'Fluxo', title: 'Despesas não pagas no Gestão DS', note: 'Provavelmente resíduo antigo: despesas deixaram de ser lançadas neste sistema.', rows: [{ l: 'Despesas a pagar', v: F.a_pagar.valor, c: PURP, disp: brl(F.a_pagar.valor), showPct: false }] }) },
  ]);

  const ms = F.meses.slice(0, 46), lab = ms.map(mesLab);
  mk('cxMesChart', { type: 'bar', data: { labels: lab, datasets: [
      { label: 'Recebido', data: F.receita_recebida_mes.slice(0, 46), backgroundColor: AC, borderRadius: 3 },
      { label: 'Lançado (bruto)', data: F.receita_lancada_mes.slice(0, 46), type: 'line', borderColor: GOLD, backgroundColor: GOLD, tension: .3, borderWidth: 2.5, pointRadius: 0 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: legendOpts(), tooltip: { callbacks: { label: c => c.dataset.label + ': ' + brl(c.parsed.y) } } }, scales: { x: { ...gx(), ticks: { ...gx().ticks, maxTicksLimit: 12 } }, y: { ...gx(), ticks: { ...gx().ticks, callback: v => 'R$' + (v / 1000) + 'k' } } } } });
  const fo = Object.entries(F.forma_receita).filter(x => x[1] > 20000);
  mk('cxFormaChart', { type: 'doughnut', data: { labels: fo.map(x => x[0]), datasets: [{ data: fo.map(x => x[1]), backgroundColor: [AC, GOLD, BLUE, PURP, ORG, SAGE, GREY, RED], borderWidth: 2, borderColor: '#fff' }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: '58%', plugins: { legend: { position: 'bottom', labels: legendOpts().labels }, tooltip: { callbacks: { label: c => c.label + ': ' + brl(c.parsed) } } } } });
  const ct = Object.entries(F.receita_categoria).slice(0, 6);
  barH('cxCatChart', ct.map(x => x[0].length > 28 ? x[0].slice(0, 27) + '…' : x[0]), ct.map(x => x[1]), AC, v => 'R$' + (v / 1e6).toFixed(1) + ' mi');
  const ag = Object.entries(F.atrasado_aging);
  barV('cxAgingChart', ag.map(x => x[0]), ag.map(x => x[1]), [GOLD, '#C89A4E', ORG, RED], brl);
  const js = F.jan_set, anos = Object.keys(js);
  const linhas = [
    ['Receita recebida', 'receita', 'pos'], ['(−) Despesa total paga', 'despesa_total', 'neg'], ['    dos quais lucros distribuídos', 'lucros_distribuidos', 'mut'],
    ['    dos quais pessoal e encargos', 'pessoal', 'mut'], ['    dos quais impostos', 'impostos', 'mut'], ['    dos quais insumos', 'insumos', 'mut'], ['    dos quais marketing', 'marketing', 'mut'],
    ['(=) Resultado depois de despesas (sem lucros)', 'resultado_apos_despesas', 'pos'], ['Pessoal + lucros distribuídos', null, 'mut'],
  ];
  document.getElementById('cxJanSet').innerHTML = '<thead><tr><th>Jan–Set</th>' + anos.map(a => `<th>${a}</th>`).join('') + '</tr></thead><tbody>' +
    linhas.map(([l, k, cls]) => `<tr class="${k === 'resultado_apos_despesas' ? 'tot' : ''}"><td style="white-space:pre">${l}</td>` + anos.map(a => {
      const v = k ? js[a][k] : js[a].pessoal + js[a].lucros_distribuidos; return `<td class="${cls}">${brl(k === 'despesa_total' ? -v : v)}</td>`; }).join('') + '</tr>').join('') +
    `<tr><td>Margem depois de despesas</td>${anos.map(a => `<td class="mut">${pc1(js[a].margem_pct)}</td>`).join('')}</tr></tbody>`;
  const dc = Object.entries(F.despesa_categoria).slice(0, 12);
  barH('cxDespChart', dc.map(x => x[0].length > 30 ? x[0].slice(0, 29) + '…' : x[0]), dc.map(x => x[1]), RED, v => 'R$' + (v / 1e6).toFixed(1) + ' mi');
  const cd = F.caixa["Condominio Mon'Clinique"], cr = F.condominio_categoria;
  document.getElementById('cxCondo').innerHTML = `<div class="crow" style="grid-template-columns:1fr auto"><div class="cl">Receita (aluguel e rateio)</div><div class="cv pos">${brl(cd.receita)}</div></div>
    <div class="crow" style="grid-template-columns:1fr auto"><div class="cl">Despesa do prédio paga</div><div class="cv neg">${brl(cd.despesa)}</div></div>
    <div class="crow bold" style="grid-template-columns:1fr auto"><div class="cl">Saldo (a clínica cobriu a diferença)</div><div class="cv neg">${brl(cd.receita - cd.despesa)}</div></div>
    <p style="margin-top:12px;color:var(--mu)">Maiores linhas do caixa: ${cr.slice(0, 5).map(x => `${x.categoria} (${x.tipo.toLowerCase()}, ${brlK(x.valor)})`).join('; ')}. O módulo de rateio e aluguel de salas (P2) nasce desses ${cd.linhas} lançamentos.</p>`;
}

/* =================================================================
   DIVERGÊNCIA — 4 medidas
   ================================================================= */
function renderDiv() {
  const F = D.financeiro, R = F.reconciliacao, g = F.reconc_9m, g12 = F.reconc_12m;
  const difG = g.contabilidade - g.gestao_recebido;
  document.getElementById('div-box').innerHTML = `<h3>Conta Azul registra ${pc1(g.conta_azul / g.contabilidade * 100)} da receita; Gestão DS fica a ${pc1(Math.abs(difG) / g.contabilidade * 100)} da contabilidade</h3>
    <p>Para Out/25–Jun/26 a contabilidade assinada aponta <b>${brl(g.contabilidade)}</b>. O Gestão DS (dinheiro efetivamente recebido, líquido de taxa) soma <b>${brl(g.gestao_recebido)}</b> e o valor bruto lançado soma <b>${brl(g.gestao_lancado)}</b>. O Conta Azul usado na DRE mostra só <b>${brl(g.conta_azul)}</b>. Em 12 meses (Jul/25–Jun/26): contabilidade ${brl(g12.contabilidade)} × Gestão DS ${brl(g12.gestao_recebido)}.</p>
    <ul class="checklist"><li>Reexportar o Conta Azul com todas as contas, incluindo Pix e maquininha</li><li>Pedir à Ativa o faturamento por forma de recebimento (para casar com o caixa)</li><li>Só travar a DRE como número oficial depois dessa conferência</li></ul>`;
  kpis('div-kpi', [
    { lab: 'Contabilidade (faturamento)', dot: AC, val: brlM(g.contabilidade), sub: 'Out/25–Jun/26 · Ativa Contabilidade', chip: ['g', 'documento assinado'], view: () => ({ eye: 'Fonte B', title: 'Faturamento assinado, mês a mês', tot: brl(g.contabilidade), rows: R.filter(r => r.mes >= '2025-10').map(r => ({ l: mesLab(r.mes), v: r.contabilidade, c: AC, disp: brl(r.contabilidade) })) }) },
    { lab: 'Gestão DS · recebido', dot: ACD, val: brlM(g.gestao_recebido), sub: pc1(g.gestao_recebido / g.contabilidade * 100) + ' da contabilidade', chip: ['g', 'caixa real'], view: () => ({ eye: 'Fonte C · novo', title: 'Recebido (pago, valor líquido)', tot: brl(g.gestao_recebido), rows: R.filter(r => r.mes >= '2025-10').map(r => ({ l: mesLab(r.mes), v: r.gestao_recebido, c: ACD, disp: brl(r.gestao_recebido) })) }) },
    { lab: 'Gestão DS · lançado bruto', dot: GOLD, val: brlM(g.gestao_lancado), sub: pc1(g.gestao_lancado / g.contabilidade * 100) + ' da contabilidade', chip: ['b', 'competência'], view: () => ({ eye: 'Fonte C · novo', title: 'Lançado (valor bruto, por data de lançamento)', tot: brl(g.gestao_lancado), rows: R.filter(r => r.mes >= '2025-10').map(r => ({ l: mesLab(r.mes), v: r.gestao_lancado, c: GOLD, disp: brl(r.gestao_lancado) })) }) },
    { lab: 'Conta Azul (DRE atual)', dot: RED, val: brlM(g.conta_azul), sub: pc1(g.conta_azul / g.contabilidade * 100) + ' da contabilidade', chip: ['r', 'incompleto'], view: () => ({ eye: 'Fonte A', title: 'Receita bruta do Conta Azul', tot: brl(g.conta_azul), rows: R.filter(r => r.conta_azul).map(r => ({ l: mesLab(r.mes), v: r.conta_azul, c: RED, disp: brl(r.conta_azul) })) }) },
  ]);
  const lab = R.map(r => mesLab(r.mes));
  mk('divChart', { type: 'line', data: { labels: lab, datasets: [
      { label: 'Contabilidade', data: R.map(r => r.contabilidade), borderColor: AC, backgroundColor: AC, borderWidth: 3, tension: .25 },
      { label: 'Gestão DS recebido', data: R.map(r => r.gestao_recebido), borderColor: ACD, backgroundColor: ACD, borderDash: [6, 4], borderWidth: 2.5, tension: .25 },
      { label: 'Gestão DS lançado', data: R.map(r => r.gestao_lancado), borderColor: GOLD, backgroundColor: GOLD, borderWidth: 2, tension: .25 },
      { label: 'Conta Azul', data: R.map(r => r.conta_azul), borderColor: RED, backgroundColor: RED, borderWidth: 3, tension: .25, spanGaps: false }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: legendOpts(), tooltip: { callbacks: { label: c => c.parsed.y == null ? null : c.dataset.label + ': ' + brl(c.parsed.y) } } }, scales: { x: gx(), y: { ...gx(), ticks: { ...gx().ticks, callback: v => 'R$' + (v / 1000) + 'k' } } } } });
  const p = [['Contabilidade', 100, AC], ['Gestão DS recebido', g.gestao_recebido / g.contabilidade * 100, ACD], ['Gestão DS lançado', g.gestao_lancado / g.contabilidade * 100, GOLD], ['Conta Azul', g.conta_azul / g.contabilidade * 100, RED]];
  barH('divPctChart', p.map(x => x[0]), p.map(x => +x[1].toFixed(1)), p.map(x => x[2]), v => v.toFixed(0) + '%');
  document.getElementById('divTable').innerHTML = '<thead><tr><th>Mês</th><th>Contabilidade</th><th>Gestão DS recebido</th><th>Gestão DS lançado</th><th>Conta Azul</th><th>Recebido − Contab.</th></tr></thead><tbody>' +
    R.map(r => `<tr><td>${mesLab(r.mes)}</td><td>${brl2(r.contabilidade)}</td><td>${brl2(r.gestao_recebido)}</td><td>${brl2(r.gestao_lancado)}</td><td>${r.conta_azul ? brl2(r.conta_azul) : '—'}</td><td class="${r.gestao_recebido - r.contabilidade < 0 ? 'neg' : 'pos'}">${brl2(r.gestao_recebido - r.contabilidade)}</td></tr>`).join('') +
    `<tr class="tot"><td>Total 12 meses</td><td>${brl2(g12.contabilidade)}</td><td>${brl2(g12.gestao_recebido)}</td><td>${brl2(g12.gestao_lancado)}</td><td>—</td><td>${brl2(g12.gestao_recebido - g12.contabilidade)}</td></tr>
     <tr class="tot"><td>Total Out/25–Jun/26</td><td>${brl2(g.contabilidade)}</td><td>${brl2(g.gestao_recebido)}</td><td>${brl2(g.gestao_lancado)}</td><td>${brl2(g.conta_azul)}</td><td>${brl2(g.gestao_recebido - g.contabilidade)}</td></tr></tbody>`;
}

/* =================================================================
   QUALIDADE
   ================================================================= */
function renderQualidade() {
  const Q = D.qualidade, areas = {};
  Q.forEach(t => { const a = t.split(':')[0]; areas[a] = (areas[a] || 0) + 1; });
  kpis('qual-kpi', [
    { lab: 'Problemas encontrados', dot: RED, val: Q.length, sub: 'no backup, antes de migrar', chip: ['r', 'tratar antes do go-live'], view: () => ({ eye: 'Qualidade', title: 'Por área', tot: String(Q.length), rows: Object.entries(areas).map(([k, v]) => ({ l: k, v, c: RED, disp: String(v), showPct: false })) }) },
    { lab: 'Sem origem no cadastro', dot: GOLD, val: pc1(D.pacientes.origem['Não informado'] / D.pacientes.total * 100), sub: 'dos pacientes', chip: ['y', 'marketing sem rastro'], view: () => ({ eye: 'Qualidade', title: 'Origem', rows: objRows(D.pacientes.origem, AC, intf) }) },
    { lab: 'Datas inconsistentes', dot: ORG, val: '4', sub: 'lançamentos financeiros com data impossível', chip: ['y', 'corrigidos no ETL'], view: () => ({ eye: 'Qualidade', title: 'Datas financeiras', note: '1 pagamento no ano 2103; 3 receitas pagas em 2021 antes de existirem lançamentos (dez/2022).', rows: [] }) },
  ]);
  const cor = a => ({ pacientes: BLUE, agenda: GOLD, atendimentos: PURP, 'orçamentos': ORG, financeiro: AC, 'catálogo': SAGE, anexos: RED }[a] || GREY);
  document.getElementById('qual-lista').innerHTML = Q.map((t, i) => { const [a, ...r] = t.split(':'); const txt = r.join(':').trim();
    return `<div class="scopebox" style="padding:14px 18px;margin-bottom:10px;border-left:4px solid ${cor(a)}"><div style="display:flex;gap:12px;align-items:flex-start"><span class="statuspill info" style="flex:none;text-transform:uppercase;font-size:10px;letter-spacing:.05em">${esc(a)}</span><div style="font-size:12.5px;line-height:1.6;color:var(--ink-2)">${esc(txt)}</div></div></div>`; }).join('');
}

/* =================================================================
   LINKS — todo KPI, gráfico e tabela tem endereço próprio
   formato:  arquivo.html#<aba>            abre a aba
             arquivo.html#<aba>/k/<item>   abre o detalhe do KPI
             arquivo.html#<aba>/g/<item>   leva ao gráfico (destacado)
             arquivo.html#<aba>/t/<item>   leva à tabela (destacada)
   ================================================================= */
const TAB_NOMES = { geral: 'Visão Geral', agenda: 'Agenda', pacientes: 'Pacientes', prontuario: 'Prontuário', orc: 'Orçamentos', crm: 'CRM · Funil', mkt: 'Marketing', caixa: 'Caixa & recebíveis', fin: 'DRE (Conta Azul)', docs: 'Documentos', div: 'Divergência', qual: 'Qualidade dos dados', migr: 'Sistema próprio', links: 'Índice de links', road: 'Roadmap & Escopo' };
const slugify = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const baseUrl = () => location.href.split('#')[0];
const linkDe = (tab, kind, id) => baseUrl() + '#' + tab + (kind ? '/' + kind + '/' + id : '');
const setHash = h => { try { history.replaceState(null, '', '#' + h); } catch (e) { /* file:// restrito */ } };
let _toast;
function toast(msg) {
  let t = document.getElementById('toastLink');
  if (!t) { t = document.createElement('div'); t.id = 'toastLink'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('on'); clearTimeout(_toast); _toast = setTimeout(() => t.classList.remove('on'), 2200);
}
async function copiar(texto, msg) {
  try { await navigator.clipboard.writeText(texto); }
  catch (e) { const ta = document.createElement('textarea'); ta.value = texto; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (_) { } ta.remove(); }
  toast(msg || 'Link copiado');
}
function botaoLink(el, tab, kind) {
  if (el.querySelector(':scope > .lnk')) return;
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'lnk'; b.textContent = 'link';
  b.title = 'Copiar link direto para este item'; b.setAttribute('aria-label', 'Copiar link direto para ' + (el.dataset.titulo || 'este item'));
  b.addEventListener('click', e => { e.stopPropagation(); copiar(linkDe(tab, kind, el.dataset.slug)); });
  el.appendChild(b);
}
/* dá um endereço estável a cada KPI, gráfico e tabela da aba */
function decorar(tab) {
  if (tab === 'links') return;
  const pane = document.getElementById('pane-' + tab); if (!pane) return;
  const usados = new Set([...pane.querySelectorAll('[data-slug]')].map(e => e.dataset.slug));
  const unico = base => { let s = base || 'item', n = 2; while (usados.has(s)) s = base + '-' + (n++); usados.add(s); return s; };
  pane.querySelectorAll('.kpi:not(.ghost), .setorcard').forEach(el => {
    if (!el.dataset.slug) {
      const lab = el.querySelector('.klab') || el.querySelector('h4');
      el.dataset.titulo = (lab ? lab.textContent : 'item').replace(/\s+/g, ' ').trim();
      el.dataset.slug = unico(slugify(el.dataset.titulo)); el.dataset.kind = 'k';
    }
    botaoLink(el, tab, 'k');
  });
  pane.querySelectorAll('#achados .panel').forEach(el => {
    if (!el.dataset.slug) { const h = el.querySelector('h3'); el.dataset.titulo = h ? h.textContent.trim() : 'achado'; el.dataset.slug = unico(slugify(el.dataset.titulo)); el.dataset.kind = 'k'; }
    botaoLink(el, tab, 'k');
  });
  pane.querySelectorAll('.panel').forEach(el => {
    if (el.closest('#achados')) return;
    const cv = el.querySelector('canvas'), h = el.querySelector('h3');
    if (!cv && !h) return;
    if (!el.dataset.slug) { el.dataset.titulo = h ? h.textContent.trim() : (cv ? cv.id : 'gráfico'); el.dataset.slug = cv ? cv.id : unico(slugify(el.dataset.titulo)); el.dataset.kind = 'g'; }
    botaoLink(el, tab, 'g');
  });
  pane.querySelectorAll('.tablecard').forEach(el => {
    const tb = el.querySelector('table'), h = el.querySelector('h3');
    if (!el.dataset.slug) { el.dataset.titulo = h ? h.textContent.trim() : 'tabela'; el.dataset.slug = (tb && tb.id) ? tb.id : unico(slugify(el.dataset.titulo)); el.dataset.kind = 't'; }
    botaoLink(el, tab, 't');
  });
}
function focar(tab, kind, id) {
  const pane = document.getElementById('pane-' + tab); if (!pane) return false;
  const el = [...pane.querySelectorAll('[data-slug]')].find(e => e.dataset.slug === id); if (!el) return false;
  el.scrollIntoView({ block: 'center', behavior: 'auto' });
  el.classList.add('alvo'); setTimeout(() => el.classList.remove('alvo'), 2600);
  if (kind === 'k' && el.classList.contains('kpi')) el.click();   // abre o detalhe
  return true;
}
function aplicarHash() {
  const [tab0, kind, ...rest] = decodeURIComponent(location.hash.replace(/^#/, '')).split('/');
  const tab = TAB_NOMES[tab0] ? tab0 : 'geral';
  goTab(tab, { semHash: true });
  if (kind && rest.length) {
    const id = rest.join('/');
    if (!focar(tab, kind, id)) toast('Item do link não encontrado: ' + id);
  }
}
window.addEventListener('hashchange', aplicarHash);
/* clicar num KPI à mão também atualiza o endereço (para copiar da barra) */
document.addEventListener('click', e => {
  if (e.target.closest('.lnk')) return;
  const k = e.target.closest('.kpi[data-slug]');
  if (k) setHash(TAB_ATUAL + '/k/' + k.dataset.slug);
}, true);
const _closeModalOrig = closeModal;
closeModal = function () { _closeModalOrig(); if (TAB_ATUAL) setHash(TAB_ATUAL); };

/* =================================================================
   ÍNDICE DE LINKS
   ================================================================= */
function renderLinks() {
  Object.keys(RENDER).forEach(k => { if (k !== 'links' && !BUILT[k]) { RENDER[k](); BUILT[k] = true; } });
  if (!built.crm) { renderCRM(); built.crm = true; }
  if (!built.mkt) { renderMKT(); built.mkt = true; }
  Object.keys(TAB_NOMES).forEach(t => { if (t !== 'links') decorar(t); });
  const tipos = { k: 'KPI', g: 'Gráfico', t: 'Tabela' }, itens = [];
  Object.keys(TAB_NOMES).forEach(tab => {
    if (tab === 'links') return;
    document.querySelectorAll('#pane-' + tab + ' [data-slug]').forEach(el => itens.push({ tab, kind: el.dataset.kind, slug: el.dataset.slug, titulo: el.dataset.titulo }));
  });
  const q = (document.getElementById('linksBusca') || {}).value || '';
  const f = slugify(q), vis = itens.filter(i => !f || slugify(i.titulo + ' ' + TAB_NOMES[i.tab] + ' ' + tipos[i.kind]).includes(f));
  document.getElementById('linksResumo').textContent = `${itens.length} itens com link (${itens.filter(i => i.kind === 'k').length} KPIs, ${itens.filter(i => i.kind === 'g').length} gráficos, ${itens.filter(i => i.kind === 't').length} tabelas) · mostrando ${vis.length}`;
  const linhas = [];
  let ultimo = '';
  vis.forEach(i => {
    if (i.tab !== ultimo) { linhas.push(`<tr class="tot"><td colspan="3"><a href="#${i.tab}" style="color:inherit;text-decoration:none">${esc(TAB_NOMES[i.tab])}</a> <span class="mut" style="font-weight:400">· #${i.tab}</span></td></tr>`); ultimo = i.tab; }
    const frag = `${i.tab}/${i.kind}/${i.slug}`;
    linhas.push(`<tr><td style="white-space:normal"><a href="#${esc(frag)}" style="color:inherit">${esc(i.titulo)}</a></td><td>${tipos[i.kind]}</td><td style="text-align:right"><code style="font-size:11px">#${esc(frag)}</code> <button class="lnk static" type="button" data-frag="${esc(frag)}">copiar</button></td></tr>`);
  });
  const tb = document.getElementById('linksTabela');
  tb.innerHTML = '<thead><tr><th>Item</th><th>Tipo</th><th>Endereço</th></tr></thead><tbody>' + linhas.join('') + '</tbody>';
  tb.querySelectorAll('button[data-frag]').forEach(b => b.addEventListener('click', () => copiar(baseUrl() + '#' + b.dataset.frag)));
  window.__INDICE_LINKS = itens;
}
function copiarIndiceMarkdown() {
  const tipos = { k: 'KPI', g: 'Gráfico', t: 'Tabela' }, arq = baseUrl().split('/').pop() || 'MVP-Consolidado-Mon-Clinique-v2.html';
  const out = ['# Índice de links — Mon Clinique', ''];
  let ult = '';
  (window.__INDICE_LINKS || []).forEach(i => { if (i.tab !== ult) { out.push('', `## ${TAB_NOMES[i.tab]}`, `- Aba: \`${arq}#${i.tab}\``); ult = i.tab; } out.push(`- ${tipos[i.kind]} · ${i.titulo}: \`${arq}#${i.tab}/${i.kind}/${i.slug}\``); });
  copiar(out.join('\n'), 'Índice copiado em Markdown');
}

/* =================================================================
   ORQUESTRAÇÃO — navegação lazy, tema, atualizar dados
   ================================================================= */
const RENDER = { agenda: renderAgenda, pacientes: renderPacientes, prontuario: renderProntuario, orc: renderOrcamentos, caixa: renderCaixa, div: renderDiv, qual: renderQualidade, links: renderLinks };
const BUILT = {};
let TAB_ATUAL = 'geral';
function renderAll() {
  renderFin();
  renderGeral();
  Object.keys(BUILT).forEach(k => { if (k !== 'links') RENDER[k](); });
  if (built.crm) renderCRM();
  if (built.mkt) renderMKT();
  Object.keys(TAB_NOMES).forEach(t => { if (t === 'geral' || t === 'fin' || BUILT[t] || (t === 'crm' && built.crm) || (t === 'mkt' && built.mkt)) decorar(t); });
}
function goTab(name, o) {
  if (!TAB_NOMES[name]) name = 'geral';
  TAB_ATUAL = name;
  document.querySelectorAll('.navitem').forEach(x => x.classList.remove('active'));
  const nav = document.querySelector(`.navitem[data-tab="${name}"]`); if (nav) nav.classList.add('active');
  document.querySelectorAll('.pane').forEach(p => p.hidden = true);
  document.getElementById('pane-' + name).hidden = false;
  if (name === 'crm' && !built.crm) { renderCRM(); built.crm = true; }
  if (name === 'mkt' && !built.mkt) { renderMKT(); built.mkt = true; }
  if (name === 'links') { renderLinks(); BUILT.links = true; }
  else if (RENDER[name] && !BUILT[name]) { RENDER[name](); BUILT[name] = true; }
  decorar(name);
  if (!(o && o.semHash)) { setHash(name); window.scrollTo(0, 0); }
}
renderGeral();
decorar('geral'); decorar('fin');
if (location.hash && location.hash.length > 1) aplicarHash();
