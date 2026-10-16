import { redirect } from 'next/navigation'
import { OrcamentoForm } from '@/components/orcamento-form'
import { Cabecalho, Cartao } from '@/components/ui'
import { listarMedicos } from '@/lib/data/comum'
import { pode } from '@/lib/roles'
import { exigirSessao } from '@/lib/sessao'
import { supabaseServidor } from '@/lib/supabase/server'

export const metadata = { title: 'Novo orçamento' }

export default async function NovoOrcamento({ searchParams }: { searchParams: Promise<{ paciente?: string }> }) {
  const s = await exigirSessao('orcamentos')
  if (!pode.editarOrcamento(s.papel)) redirect('/orcamentos')
  const sp = await searchParams
  const supabase = await supabaseServidor()
  const medicos = await listarMedicos(supabase)
  let paciente: { id: string; nome: string } | null = null
  if (sp.paciente) {
    const { data } = await supabase.from('pacientes').select('id, nome').eq('id', sp.paciente).maybeSingle()
    paciente = (data as typeof paciente) ?? null
  }
  return (
    <>
      <Cabecalho titulo="Novo orçamento" />
      <Cartao><OrcamentoForm medicos={medicos} paciente={paciente} medicoFixo={s.papel === 'medico'} /></Cartao>
    </>
  )
}
