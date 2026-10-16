import 'server-only'
import type { Supa } from '@/lib/supabase/server'
import type { Agendamento } from '@/lib/tipos'
import { limitesDia } from '@/lib/format'

const COLS = 'id, paciente_id, medico_id, data_hora, fim, tipo, procedimento, convenio, status, primeiro_atendimento, observacao, paciente:pacientes(nome), medico:medicos(nome)'

export async function doDia(supabase: Supa, dia: string, medicoId?: string | null): Promise<Agendamento[]> {
  const { de, ate } = limitesDia(dia)
  let q = supabase.from('agendamentos').select(COLS).gte('data_hora', de).lt('data_hora', ate).order('data_hora')
  if (medicoId) q = q.eq('medico_id', medicoId)
  const { data } = await q
  return (data ?? []) as unknown as Agendamento[]
}

/** Passou e ninguém deu baixa (não confirmado / confirmado / em espera / em atendimento). */
export async function semBaixa(supabase: Supa, limite = 200): Promise<Agendamento[]> {
  const { data } = await supabase.from('agendamentos').select(COLS)
    .in('status', ['nao_confirmado', 'confirmado', 'em_espera', 'em_atendimento']).neq('tipo', 'bloqueio')
    .lt('data_hora', new Date().toISOString()).order('data_hora', { ascending: false }).limit(limite)
  return (data ?? []) as unknown as Agendamento[]
}

export async function doPaciente(supabase: Supa, pacienteId: string, limite = 20): Promise<Agendamento[]> {
  const { data } = await supabase.from('agendamentos').select(COLS).eq('paciente_id', pacienteId)
    .order('data_hora', { ascending: false }).limit(limite)
  return (data ?? []) as unknown as Agendamento[]
}

export async function obter(supabase: Supa, id: string): Promise<Agendamento | null> {
  const { data } = await supabase.from('agendamentos').select(COLS).eq('id', id).maybeSingle()
  return (data as unknown as Agendamento | null) ?? null
}
