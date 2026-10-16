import 'server-only'
import type { Supa } from '@/lib/supabase/server'
import type { Medico } from '@/lib/tipos'

export async function listarMedicos(supabase: Supa): Promise<Medico[]> {
  const { data } = await supabase.from('medicos').select('id, nome, ativo').eq('ativo', true).order('nome')
  return (data ?? []) as Medico[]
}

export async function listarCatalogo(supabase: Supa) {
  const { data } = await supabase.from('catalogo_servicos').select('id, classe, descricao, valor, duracao_min')
    .eq('ativo', true).order('descricao').limit(1000)
  return (data ?? []) as { id: string; classe: string; descricao: string; valor: number | null; duracao_min: number | null }[]
}

export function nomesPorId<T extends { id: string; nome: string }>(lista: T[]) {
  return new Map(lista.map((x) => [x.id, x.nome]))
}
