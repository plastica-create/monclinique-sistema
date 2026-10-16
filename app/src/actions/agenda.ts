'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { supabaseServidor } from '@/lib/supabase/server'
import { exigirSessao } from '@/lib/sessao'
import { pode } from '@/lib/roles'
import { mensagemErro } from '@/lib/erros'
import { agendamentoSchema, baixaSchema, dadosForm, errosCampos } from '@/lib/schemas'
import { data as fmtData, hojeISO, paraTimestamp } from '@/lib/format'
import type { EstadoAcao } from '@/lib/acao'

export async function salvarAgendamento(_: EstadoAcao, fd: FormData): Promise<EstadoAcao> {
  const s = await exigirSessao('agenda')
  if (!pode.agendar(s.papel)) return { erro: 'Sem permissão para agendar.' }
  const valores = dadosForm(fd)
  const id = valores.id || null
  const p = agendamentoSchema.safeParse(valores)
  if (!p.success) return { campos: errosCampos(p.error), valores, erro: 'Confira os campos destacados.' }
  const v = p.data
  if (s.papel === 'medico' && v.medico_id !== s.medicoId) return { erro: 'Você só agenda na sua própria agenda.', valores }
  const inicio = paraTimestamp(v.dia, v.hora)
  const fim = new Date(new Date(inicio).getTime() + v.duracao_min * 60_000).toISOString()
  const supabase = await supabaseServidor()

  if (valores.confirmar_conflito !== 'on') {
    let q = supabase.from('agendamentos').select('id, data_hora, tipo', { count: 'exact', head: false })
      .eq('medico_id', v.medico_id).lt('data_hora', fim).gt('fim', inicio).not('status', 'in', '(cancelado,faltou)')
    if (id) q = q.neq('id', id)
    const { data: conflitos } = await q.limit(3)
    if (conflitos && conflitos.length > 0) {
      return { valores: { ...valores, confirmar_conflito: 'on' },
        aviso: `Este horário se sobrepõe a ${conflitos.length} agendamento(s) do mesmo médico. Para manter assim, clique em Salvar de novo.` }
    }
  }

  const linha = {
    paciente_id: v.tipo === 'bloqueio' ? null : v.paciente_id, medico_id: v.medico_id, data_hora: inicio, fim,
    tipo: v.tipo, procedimento: v.procedimento, convenio: v.convenio ?? 'Particular',
    primeiro_atendimento: v.primeiro_atendimento, observacao: v.observacao,
  }
  const { error } = id
    ? await supabase.from('agendamentos').update(linha).eq('id', id)
    : await supabase.from('agendamentos').insert(linha)
  if (error) return { erro: mensagemErro(error, 'salvar agendamento'), valores }
  revalidatePath('/agenda')
  redirect(`/agenda?dia=${v.dia}`)
}

/** Baixa: compareceu → finalizado; faltou; cancelou (exige motivo). Futuro só pode ser cancelado/confirmado. */
export async function darBaixa(_: EstadoAcao, fd: FormData): Promise<EstadoAcao> {
  const s = await exigirSessao('agenda')
  if (!pode.agendar(s.papel)) return { erro: 'Sem permissão.' }
  const p = baixaSchema.safeParse(dadosForm(fd))
  if (!p.success) return { campos: errosCampos(p.error), erro: Object.values(errosCampos(p.error))[0] }
  const supabase = await supabaseServidor()
  const { data: atual } = await supabase.from('agendamentos').select('id, data_hora, observacao').eq('id', p.data.id).maybeSingle()
  if (!atual) return { erro: 'Agendamento não encontrado.' }
  const futuro = new Date(atual.data_hora as string) > new Date()
  if (futuro && (p.data.desfecho === 'finalizado' || p.data.desfecho === 'faltou'))
    return { erro: 'Agendamento futuro só pode ser confirmado ou cancelado.' }
  const mudanca: Record<string, unknown> = { status: p.data.desfecho }
  if (p.data.desfecho === 'cancelado') {
    const linha = `[cancelado em ${fmtData(hojeISO())}: ${p.data.motivo}]`
    mudanca.observacao = atual.observacao ? `${atual.observacao}\n${linha}` : linha
  }
  const { error } = await supabase.from('agendamentos').update(mudanca).eq('id', p.data.id)
  if (error) return { erro: mensagemErro(error, 'baixa de agendamento') }
  revalidatePath('/agenda')
  return { ok: true }
}
