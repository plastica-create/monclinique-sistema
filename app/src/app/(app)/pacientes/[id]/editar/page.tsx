import { notFound, redirect } from 'next/navigation'
import { PacienteForm } from '@/components/paciente-form'
import { Cabecalho, Cartao } from '@/components/ui'
import { listarMedicos } from '@/lib/data/comum'
import { obter } from '@/lib/data/pacientes'
import { pode } from '@/lib/roles'
import { exigirSessao } from '@/lib/sessao'
import { supabaseServidor } from '@/lib/supabase/server'

export const metadata = { title: 'Editar paciente' }

export default async function EditarPaciente({ params }: { params: Promise<{ id: string }> }) {
  const s = await exigirSessao('pacientes')
  if (!pode.cadastrarPaciente(s.papel)) redirect('/pacientes')
  const { id } = await params
  const supabase = await supabaseServidor()
  const [paciente, medicos] = await Promise.all([obter(supabase, id), listarMedicos(supabase)])
  if (!paciente) notFound()
  return (
    <>
      <Cabecalho titulo="Editar cadastro" sub={paciente.nome} />
      <Cartao><PacienteForm paciente={paciente} medicos={medicos} mostrarDocumentos={false} /></Cartao>
    </>
  )
}
