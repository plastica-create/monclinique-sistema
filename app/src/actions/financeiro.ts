'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { supabaseServidor } from '@/lib/supabase/server'
import { exigirSessao } from '@/lib/sessao'
import { pode } from '@/lib/roles'
import { mensagemErro } from '@/lib/erros'
import { dadosForm, errosCampos, lancamentoSchema } from '@/lib/schemas'
import { hojeISO } from '@/lib/format'
import { valorReais } from '@/lib/validacao'
import type { EstadoAcao } from '@/lib/acao'

async function permitido() {
  const s = await exigirSessao('financeiro')
  return pode.editarFinanceiro(s.papel) ? s : null
}

export async function salvarLancamento(_: EstadoAcao, fd: FormData): Promise<EstadoAcao> {
  if (!(await permitido())) return { erro: 'Sem permissão.' }
  const valores = dadosForm(fd)
  const p = lancamentoSchema.safeParse(valores)
  if (!p.success) return { campos: errosCampos(p.error), valores, erro: 'Confira os campos destacados.' }
  const v = p.data
  const supabase = await supabaseServidor()
  const { error } = await supabase.from('lancamentos').insert({
    ...v, paciente_id: v.tipo === 'receita' ? v.paciente_id : null, orcamento_id: v.tipo === 'receita' ? v.orcamento_id : null,
  })
  if (error) return { erro: mensagemErro(error, 'criar lançamento'), valores }
  revalidatePath('/financeiro')
  redirect(`/financeiro?mes=${v.data_pagamento.slice(0, 7)}`)
}

export async function marcarPago(_: EstadoAcao, fd: FormData): Promise<EstadoAcao> {
  if (!(await permitido())) return { erro: 'Sem permissão.' }
  const id = z.uuid().safeParse(fd.get('id'))
  if (!id.success) return { erro: 'Lançamento inválido.' }
  const liquido = valorReais(String(fd.get('valor_liquido') ?? ''))
  const supabase = await supabaseServidor()
  const mudanca: Record<string, unknown> = { pago: true, data_pagamento: hojeISO() }
  if (liquido != null) mudanca.valor_liquido = liquido
  const { error } = await supabase.from('lancamentos').update(mudanca).eq('id', id.data).eq('pago', false)
  if (error) return { erro: mensagemErro(error, 'baixar lançamento') }
  revalidatePath('/financeiro')
  return { ok: true, mensagem: 'Pagamento registrado com a data de hoje.' }
}

const conciliacaoSchema = z.object({
  mes: z.string().regex(/^\d{4}-\d{2}$/),
  contabilidade: z.string().optional(),
  conta_azul: z.string().optional(),
  observacao: z.string().trim().max(300).optional(),
})

export async function salvarConciliacao(_: EstadoAcao, fd: FormData): Promise<EstadoAcao> {
  if (!(await permitido())) return { erro: 'Sem permissão.' }
  const p = conciliacaoSchema.safeParse(dadosForm(fd))
  if (!p.success) return { erro: 'Dados inválidos.' }
  const supabase = await supabaseServidor()
  const { error } = await supabase.from('conciliacao_mensal').upsert({
    mes: `${p.data.mes}-01`, contabilidade: valorReais(p.data.contabilidade), conta_azul: valorReais(p.data.conta_azul),
    observacao: p.data.observacao || null,
  })
  if (error) return { erro: error.code === '42P01' ? 'Falta aplicar db/005_app.sql no banco.' : mensagemErro(error, 'conciliação') }
  revalidatePath('/financeiro')
  return { ok: true, mensagem: 'Valores salvos.' }
}

/** Registra que a lista de vencidos (com nomes) foi exportada/copiada. */
export async function registrarCopiaCobranca(qtd: number) {
  if (!(await permitido())) return
  const supabase = await supabaseServidor()
  await supabase.rpc('registrar_exportacao', { p_tabela: 'lancamentos', p_qtd: Math.max(0, Math.floor(qtd)), p_finalidade: 'cobrança de vencidos' })
}
