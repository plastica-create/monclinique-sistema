import 'server-only'
import type { Supa } from '@/lib/supabase/server'
import { hojeISO } from '@/lib/format'

// O dashboard lê SÓ as views agregadas (vw_*). Quem não tem acesso à tabela de origem recebe vazio.
const n = (v: unknown) => (v == null ? 0 : Number(v))

export type MesReceita = { mes: string; recebida: number; despesa: number; aReceber: number }
export type MesAgenda = { mes: string; total: number; finalizados: number; cancelados: number; faltas: number; semBaixa: number }

/** Primeiro dia do mês, N meses antes de hoje (AAAA-MM-01). */
export function inicioMes(mesesAtras: number, hoje = hojeISO()) {
  const [a, m] = hoje.split('-').map(Number) as [number, number]
  const d = new Date(Date.UTC(a, m - 1 - mesesAtras, 1))
  return d.toISOString().slice(0, 10)
}

export function mesesAte(hoje: string, qtd: number) {
  return Array.from({ length: qtd }, (_, i) => inicioMes(qtd - 1 - i, hoje))
}

export async function carregarPainel(supabase: Supa) {
  const hoje = hojeISO()
  const desde = inicioMes(11, hoje)
  const [receita, agenda, aging, receber, origem, recencia, funil] = await Promise.all([
    supabase.from('vw_receita_mensal').select('mes, receita_recebida, despesa_paga, a_receber').gte('mes', desde).lte('mes', hoje),
    supabase.from('vw_agenda_mensal').select('mes, total, finalizados, cancelados, faltas, sem_baixa').gte('mes', desde),
    supabase.from('vw_aging_orcamentos').select('ordem, faixa, situacao, qtd, valor_liquido, qtd_validade_vencida'),
    supabase.from('vw_a_receber_atrasado').select('situacao, ordem, faixa, qtd, valor'),
    supabase.from('vw_origem_pacientes').select('origem, total_pacientes, pct_total, novos_desde_2023, valor_orcamentos_ganhos'),
    supabase.from('vw_recencia_pacientes').select('ordem, faixa, reativavel, qtd'),
    supabase.from('vw_orcamentos_funil').select('mes_emissao, status, qtd, valor_liquido').gte('mes_emissao', desde),
  ])

  const meses = mesesAte(hoje, 12)
  const porMesR = new Map<string, MesReceita>(meses.map((m) => [m, { mes: m, recebida: 0, despesa: 0, aReceber: 0 }]))
  for (const r of receita.data ?? []) {
    const x = porMesR.get(String(r.mes))
    if (x) { x.recebida += n(r.receita_recebida); x.despesa += n(r.despesa_paga); x.aReceber += n(r.a_receber) }
  }
  const porMesA = new Map<string, MesAgenda>(meses.map((m) => [m, { mes: m, total: 0, finalizados: 0, cancelados: 0, faltas: 0, semBaixa: 0 }]))
  for (const r of agenda.data ?? []) {
    const x = porMesA.get(String(r.mes))
    if (x) {
      x.total += n(r.total); x.finalizados += n(r.finalizados); x.cancelados += n(r.cancelados)
      x.faltas += n(r.faltas); x.semBaixa += n(r.sem_baixa)
    }
  }

  // aging: soma por faixa (o médico só recebe os dele, pela RLS)
  const faixas = new Map<number, { faixa: string; qtd: number; valor: number; vencidos: number }>()
  for (const r of aging.data ?? []) {
    const f = faixas.get(n(r.ordem)) ?? { faixa: String(r.faixa), qtd: 0, valor: 0, vencidos: 0 }
    f.qtd += n(r.qtd); f.valor += n(r.valor_liquido); f.vencidos += n(r.qtd_validade_vencida)
    faixas.set(n(r.ordem), f)
  }
  const temperatura = { quente: 0, morno: 0, frio: 0, sem: 0 }
  for (const r of aging.data ?? []) {
    if (n(r.ordem) > 3) continue
    const k = (r.situacao ?? 'sem') as keyof typeof temperatura
    temperatura[k] += n(r.valor_liquido)
  }

  const funilTot = { emitidos: 0, ganhos: 0, valorGanho: 0, perdas: 0 }
  for (const r of funil.data ?? []) {
    funilTot.emitidos += n(r.qtd)
    if (r.status === 'ganho') { funilTot.ganhos += n(r.qtd); funilTot.valorGanho += n(r.valor_liquido) }
    if (r.status === 'perda') funilTot.perdas += n(r.qtd)
  }

  return {
    hoje,
    temFinanceiro: (receita.data?.length ?? 0) > 0 || (receber.data?.length ?? 0) > 0,
    temOrcamentos: (aging.data?.length ?? 0) > 0 || (funil.data?.length ?? 0) > 0,
    temAgenda: (agenda.data?.length ?? 0) > 0,
    receita: [...porMesR.values()],
    agenda: [...porMesA.values()],
    aging: [...faixas.entries()].sort((a, b) => a[0] - b[0]).map(([ordem, f]) => ({ ordem, ...f })),
    temperatura,
    funil: funilTot,
    receber: (receber.data ?? []).map((r) => ({ situacao: String(r.situacao), ordem: n(r.ordem), faixa: String(r.faixa), qtd: n(r.qtd), valor: n(r.valor) }))
      .sort((a, b) => a.ordem - b.ordem),
    origem: (origem.data ?? []).map((r) => ({ origem: String(r.origem), total: n(r.total_pacientes), pct: n(r.pct_total), novos: n(r.novos_desde_2023), valorGanho: n(r.valor_orcamentos_ganhos) }))
      .sort((a, b) => b.total - a.total),
    recencia: (recencia.data ?? []).map((r) => ({ ordem: n(r.ordem), faixa: String(r.faixa), reativavel: Boolean(r.reativavel), qtd: n(r.qtd) }))
      .sort((a, b) => a.ordem - b.ordem),
  }
}

export type Painel = Awaited<ReturnType<typeof carregarPainel>>
