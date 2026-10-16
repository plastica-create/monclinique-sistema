'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { supabaseServidor } from '@/lib/supabase/server'
import { exigirSessao } from '@/lib/sessao'
import { pode } from '@/lib/roles'
import { mensagemErro } from '@/lib/erros'
import { dadosForm, errosCampos, itemSchema, orcamentoSchema, perdaSchema } from '@/lib/schemas'
import { data as fmtData, hojeISO } from '@/lib/format'
import type { EstadoAcao } from '@/lib/acao'
import type { Supa } from '@/lib/supabase/server'

async function permitido() {
  const s = await exigirSessao('orcamentos')
  if (!pode.editarOrcamento(s.papel)) throw new Error('sem permissão')
  return s
}

export async function salvarOrcamento(_: EstadoAcao, fd: FormData): Promise<EstadoAcao> {
  const s = await permitido().catch(() => null)
  if (!s) return { erro: 'Seu perfil não edita orçamentos.' }
  const valores = dadosForm(fd)
  const id = valores.id || null
  const p = orcamentoSchema.safeParse(valores)
  if (!p.success) return { campos: errosCampos(p.error), valores, erro: 'Confira os campos destacados.' }
  const linha = { ...p.data, medico_id: s.papel === 'medico' ? s.medicoId : p.data.medico_id }
  const supabase = await supabaseServidor()
  if (id) {
    const { error } = await supabase.from('orcamentos').update(linha).eq('id', id)
    if (error) return { erro: mensagemErro(error, 'atualizar orçamento'), valores }
    revalidatePath(`/orcamentos/${id}`)
    redirect(`/orcamentos/${id}`)
  }
  const { data, error } = await supabase.from('orcamentos').insert({ ...linha, orcado_por_nome: s.nome, orcado_por_usuario_id: s.userId })
    .select('id').single()
  if (error || !data) return { erro: mensagemErro(error, 'criar orçamento'), valores }
  revalidatePath('/orcamentos')
  redirect(`/orcamentos/${data.id}`)
}

export async function marcarGanho(_: EstadoAcao, fd: FormData): Promise<EstadoAcao> {
  if (!(await permitido().catch(() => null))) return { erro: 'Sem permissão.' }
  const id = z.uuid().safeParse(fd.get('id'))
  const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).safeParse(fd.get('data_ganho') || hojeISO())
  if (!id.success || !dia.success) return { erro: 'Dados inválidos.' }
  const supabase = await supabaseServidor()
  const { error } = await supabase.from('orcamentos')
    .update({ status: 'ganho', data_ganho: dia.data, data_perda: null, motivo_perda: null, situacao: null }).eq('id', id.data)
  if (error) return { erro: mensagemErro(error, 'ganhar orçamento') }
  revalidatePath(`/orcamentos/${id.data}`)
  return { ok: true, mensagem: 'Orçamento marcado como ganho.' }
}

export async function marcarPerda(_: EstadoAcao, fd: FormData): Promise<EstadoAcao> {
  if (!(await permitido().catch(() => null))) return { erro: 'Sem permissão.' }
  const p = perdaSchema.safeParse(dadosForm(fd))
  if (!p.success) return { campos: errosCampos(p.error) }
  const motivo = p.data.motivo === 'Outro' ? `Outro: ${p.data.detalhe}` : p.data.detalhe ? `${p.data.motivo}: ${p.data.detalhe}` : p.data.motivo
  const supabase = await supabaseServidor()
  const { error } = await supabase.from('orcamentos')
    .update({ status: 'perda', data_perda: hojeISO(), motivo_perda: motivo, data_ganho: null, situacao: null }).eq('id', p.data.id)
  if (error) return { erro: mensagemErro(error, 'perder orçamento') }
  revalidatePath(`/orcamentos/${p.data.id}`)
  return { ok: true, mensagem: 'Perda registrada.' }
}

export async function reabrir(_: EstadoAcao, fd: FormData): Promise<EstadoAcao> {
  if (!(await permitido().catch(() => null))) return { erro: 'Sem permissão.' }
  const id = z.uuid().safeParse(fd.get('id'))
  if (!id.success) return { erro: 'Dados inválidos.' }
  const supabase = await supabaseServidor()
  const { error } = await supabase.from('orcamentos')
    .update({ status: 'em_aberto', data_ganho: null, data_perda: null, motivo_perda: null, situacao: 'morno' }).eq('id', id.data)
  if (error) return { erro: mensagemErro(error, 'reabrir orçamento') }
  revalidatePath(`/orcamentos/${id.data}`)
  return { ok: true, mensagem: 'Orçamento reaberto.' }
}

const contatoSchema = z.object({ id: z.uuid(), nota: z.string().trim().min(1, 'Escreva o que foi combinado.').max(300),
  situacao: z.enum(['quente', 'morno', 'frio', '']).optional() })

/** Registra um contato: acrescenta uma linha datada na observação (não há tabela de contatos). */
export async function registrarContato(_: EstadoAcao, fd: FormData): Promise<EstadoAcao> {
  const s = await permitido().catch(() => null)
  if (!s) return { erro: 'Sem permissão.' }
  const p = contatoSchema.safeParse(dadosForm(fd))
  if (!p.success) return { campos: errosCampos(p.error) }
  const supabase = await supabaseServidor()
  const { data: atual } = await supabase.from('orcamentos').select('observacao').eq('id', p.data.id).maybeSingle()
  const linha = `[${fmtData(hojeISO())} · ${s.nome}] ${p.data.nota}`
  const mudanca: Record<string, unknown> = { observacao: atual?.observacao ? `${linha}\n${atual.observacao}` : linha }
  if (p.data.situacao) mudanca.situacao = p.data.situacao
  const { error } = await supabase.from('orcamentos').update(mudanca).eq('id', p.data.id)
  if (error) return { erro: mensagemErro(error, 'registrar contato') }
  revalidatePath(`/orcamentos/${p.data.id}`)
  return { ok: true, mensagem: 'Contato registrado.' }
}

/** Recalcula bruto/líquido a partir dos itens (só quando há itens). */
async function recalcular(supabase: Supa, orcamentoId: string) {
  const { data: itens } = await supabase.from('orcamento_itens').select('quantidade, valor_unitario, desconto').eq('orcamento_id', orcamentoId)
  if (!itens || itens.length === 0) return null
  const bruto = itens.reduce((t, i) => t + Number(i.quantidade) * Number(i.valor_unitario), 0)
  const desconto = itens.reduce((t, i) => t + Number(i.desconto), 0)
  const r = (v: number) => Math.round(v * 100) / 100
  return supabase.from('orcamentos').update({ valor_bruto: r(bruto), valor_liquido: r(bruto - desconto) }).eq('id', orcamentoId)
}

export async function adicionarItem(_: EstadoAcao, fd: FormData): Promise<EstadoAcao> {
  if (!(await permitido().catch(() => null))) return { erro: 'Sem permissão.' }
  const valores = dadosForm(fd)
  const p = itemSchema.safeParse(valores)
  if (!p.success) return { campos: errosCampos(p.error), valores }
  const supabase = await supabaseServidor()
  const { count } = await supabase.from('orcamento_itens').select('id', { count: 'exact', head: true }).eq('orcamento_id', p.data.orcamento_id)
  const { error } = await supabase.from('orcamento_itens').insert({ ...p.data, ordem: (count ?? 0) + 1 })
  if (error) return { erro: mensagemErro(error, 'adicionar item'), valores }
  const r = await recalcular(supabase, p.data.orcamento_id)
  if (r?.error) return { erro: mensagemErro(r.error, 'recalcular orçamento') }
  revalidatePath(`/orcamentos/${p.data.orcamento_id}`)
  return { ok: true, mensagem: 'Item adicionado e totais recalculados.' }
}

export async function removerItem(_: EstadoAcao, fd: FormData): Promise<EstadoAcao> {
  if (!(await permitido().catch(() => null))) return { erro: 'Sem permissão.' }
  const id = z.uuid().safeParse(fd.get('id'))
  const orc = z.uuid().safeParse(fd.get('orcamento_id'))
  if (!id.success || !orc.success) return { erro: 'Dados inválidos.' }
  const supabase = await supabaseServidor()
  const { error } = await supabase.from('orcamento_itens').delete().eq('id', id.data)
  if (error) return { erro: mensagemErro(error, 'remover item') }
  await recalcular(supabase, orc.data)
  revalidatePath(`/orcamentos/${orc.data}`)
  return { ok: true }
}
