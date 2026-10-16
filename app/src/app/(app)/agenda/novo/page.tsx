import { redirect } from 'next/navigation'
import { AgendamentoForm } from '@/components/agenda'
import { Cabecalho, Cartao } from '@/components/ui'
import { listarMedicos } from '@/lib/data/comum'
import { pode } from '@/lib/roles'
import { exigirSessao } from '@/lib/sessao'
import { supabaseServidor } from '@/lib/supabase/server'

export const metadata = { title: 'Novo agendamento' }

export default async function NovoAgendamento({ searchParams }: { searchParams: Promise<{ paciente?: string; dia?: string }> }) {
  const s = await exigirSessao('agenda')
  if (!pode.agendar(s.papel)) redirect('/agenda')
  const sp = await searchParams
  const supabase = await supabaseServidor()
  const medicos = (await listarMedicos(supabase)).filter((m) => s.papel !== 'medico' || m.id === s.medicoId)
  let paciente: { id: string; nome: string } | null = null
  if (sp.paciente) {
    const { data } = await supabase.from('pacientes').select('id, nome').eq('id', sp.paciente).maybeSingle()
    paciente = (data as { id: string; nome: string } | null) ?? null
  }
  return (
    <>
      <Cabecalho titulo="Novo agendamento" />
      <Cartao><AgendamentoForm medicos={medicos} medicoPadrao={s.medicoId} paciente={paciente} dia={sp.dia} /></Cartao>
    </>
  )
}
