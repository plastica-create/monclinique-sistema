import 'server-only'
import type { Supa } from '@/lib/supabase/server'
import type { Orcamento, OrcamentoItem, StatusOrcamento } from '@/lib/tipos'
import { hojeISO, somarDias } from '@/lib/format'

const COLS = 'id, numero, titulo, tipo_orcamento, status, situacao, paciente_id, medico_id, orcado_por_nome, data_emissao, valido_ate, data_ganho, data_perda, motivo_perda, valor_bruto, valor_liquido, observacao, paciente:pacientes(nome)'

export type FiltroOrc = { status?: StatusOrcamento; faixa?: 'recentes' | 'antigos'; situacao?: string; pagina?: number }
export const POR_PAGINA = 50

export async function listar(supabase: Supa, f: FiltroOrc) {
  const hoje = hojeISO()
  let q = supabase.from('orcamentos').select(COLS, { count: 'exact' })
  if (f.status) q = q.eq('status', f.status)
  if (f.faixa === 'recentes') q = q.gte('data_emissao', somarDias(hoje, -180))
  if (f.faixa === 'antigos') q = q.lt('data_emissao', somarDias(hoje, -180))
  if (f.situacao && ['quente', 'morno', 'frio'].includes(f.situacao)) q = q.eq('situacao', f.situacao)
  const pagina = Math.max(1, f.pagina ?? 1)
  const { data, count } = await q.order('data_emissao', { ascending: false }).range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1)
  return { lista: (data ?? []) as unknown as Orcamento[], total: count ?? 0, pagina }
}

export async function obter(supabase: Supa, id: string) {
  const [{ data: o }, { data: itens }] = await Promise.all([
    supabase.from('orcamentos').select(COLS).eq('id', id).maybeSingle(),
    supabase.from('orcamento_itens').select('id, orcamento_id, catalogo_id, ordem, descricao, quantidade, valor_unitario, desconto, valor_total')
      .eq('orcamento_id', id).order('ordem'),
  ])
  return o ? { orcamento: o as unknown as Orcamento, itens: (itens ?? []) as OrcamentoItem[] } : null
}

export async function doPaciente(supabase: Supa, pacienteId: string) {
  const { data } = await supabase.from('orcamentos').select(COLS).eq('paciente_id', pacienteId).order('data_emissao', { ascending: false }).limit(50)
  return (data ?? []) as unknown as Orcamento[]
}
