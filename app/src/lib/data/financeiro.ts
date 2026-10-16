import 'server-only'
import type { Supa } from '@/lib/supabase/server'
import type { Lancamento } from '@/lib/tipos'
import { hojeISO } from '@/lib/format'

const COLS = 'id, tipo, data_pagamento, data_lancamento, prestador, paciente_id, paciente_nome_original, orcamento_id, descricao, categoria_id, forma_pagamento, caixa_id, valor, valor_liquido, pago, data_anomala, paciente:pacientes(nome), categoria:categorias_financeiras(nome)'

export async function doMes(supabase: Supa, mes: string, tipo?: 'receita' | 'despesa') {
  const [a, m] = mes.split('-').map(Number) as [number, number]
  const fim = new Date(Date.UTC(a, m, 1)).toISOString().slice(0, 10)
  let q = supabase.from('lancamentos').select(COLS).gte('data_pagamento', `${mes}-01`).lt('data_pagamento', fim)
  if (tipo) q = q.eq('tipo', tipo)
  const { data } = await q.order('data_pagamento').limit(2000)
  return (data ?? []) as unknown as Lancamento[]
}

export async function vencidos(supabase: Supa) {
  const { data } = await supabase.from('lancamentos').select(COLS).eq('tipo', 'receita').eq('pago', false)
    .lt('data_pagamento', hojeISO()).order('data_pagamento').limit(1000)
  return (data ?? []) as unknown as Lancamento[]
}

export async function doPaciente(supabase: Supa, pacienteId: string) {
  const { data } = await supabase.from('lancamentos').select(COLS).eq('paciente_id', pacienteId).order('data_pagamento', { ascending: false }).limit(100)
  return (data ?? []) as unknown as Lancamento[]
}

export async function apoio(supabase: Supa) {
  const [{ data: categorias }, { data: caixas }] = await Promise.all([
    supabase.from('categorias_financeiras').select('id, tipo, nome').eq('ativo', true).order('nome'),
    supabase.from('caixas').select('id, nome').eq('ativo', true).order('nome'),
  ])
  return {
    categorias: (categorias ?? []) as { id: string; tipo: 'receita' | 'despesa'; nome: string }[],
    caixas: (caixas ?? []) as { id: string; nome: string }[],
  }
}
