import { notFound, redirect } from 'next/navigation'
import { AgendamentoForm } from '@/components/agenda'
import { Cabecalho, Cartao } from '@/components/ui'
import { obter } from '@/lib/data/agenda'
import { listarMedicos } from '@/lib/data/comum'
import { pode } from '@/lib/roles'
import { exigirSessao } from '@/lib/sessao'
import { supabaseServidor } from '@/lib/supabase/server'

export const metadata = { title: 'Remarcar' }

export default async function EditarAgendamento({ params }: { params: Promise<{ id: string }> }) {
  const s = await exigirSessao('agenda')
  if (!pode.agendar(s.papel)) redirect('/agenda')
  const { id } = await params
  const supabase = await supabaseServidor()
  const [a, medicos] = await Promise.all([obter(supabase, id), listarMedicos(supabase)])
  if (!a) notFound()
  return (
    <>
      <Cabecalho titulo="Remarcar agendamento" />
      <Cartao><AgendamentoForm a={a} medicos={medicos.filter((m) => s.papel !== 'medico' || m.id === s.medicoId)} /></Cartao>
    </>
  )
}
