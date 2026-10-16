import { notFound, redirect } from 'next/navigation'
import { OrcamentoForm } from '@/components/orcamento-form'
import { Cabecalho, Cartao } from '@/components/ui'
import { listarMedicos } from '@/lib/data/comum'
import { obter } from '@/lib/data/orcamentos'
import { pode } from '@/lib/roles'
import { exigirSessao } from '@/lib/sessao'
import { supabaseServidor } from '@/lib/supabase/server'

export const metadata = { title: 'Editar orçamento' }

export default async function EditarOrcamento({ params }: { params: Promise<{ id: string }> }) {
  const s = await exigirSessao('orcamentos')
  if (!pode.editarOrcamento(s.papel)) redirect('/orcamentos')
  const { id } = await params
  const supabase = await supabaseServidor()
  const [r, medicos] = await Promise.all([obter(supabase, id), listarMedicos(supabase)])
  if (!r) notFound()
  return (
    <>
      <Cabecalho titulo="Editar orçamento" />
      <Cartao><OrcamentoForm o={r.orcamento} medicos={medicos} medicoFixo={s.papel === 'medico'} /></Cartao>
    </>
  )
}
