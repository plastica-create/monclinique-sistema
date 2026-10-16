import { redirect } from 'next/navigation'
import { PacienteForm } from '@/components/paciente-form'
import { Cabecalho, Cartao } from '@/components/ui'
import { listarMedicos } from '@/lib/data/comum'
import { pode } from '@/lib/roles'
import { exigirSessao } from '@/lib/sessao'
import { supabaseServidor } from '@/lib/supabase/server'

export const metadata = { title: 'Novo paciente' }

export default async function NovoPaciente() {
  const s = await exigirSessao('pacientes')
  if (!pode.cadastrarPaciente(s.papel)) redirect('/pacientes')
  const medicos = await listarMedicos(await supabaseServidor())
  return (
    <>
      <Cabecalho titulo="Novo paciente" />
      <Cartao><PacienteForm medicos={medicos} mostrarDocumentos /></Cartao>
    </>
  )
}
