import { BuscaPacientes } from '@/components/pacientes-busca'
import { Botao, Cabecalho, Cartao } from '@/components/ui'
import { recentes } from '@/lib/data/pacientes'
import { pode } from '@/lib/roles'
import { exigirSessao } from '@/lib/sessao'
import { supabaseServidor } from '@/lib/supabase/server'

export const metadata = { title: 'Pacientes' }

export default async function Pacientes() {
  const s = await exigirSessao('pacientes')
  const lista = await recentes(await supabaseServidor())
  return (
    <>
      <Cabecalho titulo="Pacientes" sub={s.papel === 'medico' ? 'Somente os seus pacientes' : undefined}
        acoes={pode.cadastrarPaciente(s.papel) && <Botao href="/pacientes/novo">Novo paciente</Botao>} />
      <Cartao><BuscaPacientes iniciais={lista} /></Cartao>
    </>
  )
}
