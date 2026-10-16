import 'server-only'
import type { Supa } from '@/lib/supabase/server'
import type { Paciente, PacienteResumo } from '@/lib/tipos'

export const COLS_RESUMO = 'id, nome, data_nascimento, celular, origem, ultima_visita_atendimento, tem_cpf, ativo'
const COLS = `${COLS_RESUMO}, sexo, estado_civil, ocupacao, email, telefone, cep, endereco, numero, complemento, bairro,
  cidade, uf, indicacao_original, convenio, instagram, medico_responsavel_id, data_cadastro, observacao, cod_legado_gestaods`

export async function recentes(supabase: Supa, limite = 30): Promise<PacienteResumo[]> {
  const { data } = await supabase.from('pacientes').select(COLS_RESUMO).order('created_at', { ascending: false }).limit(limite)
  return (data ?? []) as PacienteResumo[]
}

export async function buscar(supabase: Supa, termo: string): Promise<PacienteResumo[]> {
  const { data, error } = await supabase.rpc('buscar_pacientes', { p_termo: termo, p_limite: 40 })
  if (error) throw error
  return (data ?? []) as PacienteResumo[]
}

export async function obter(supabase: Supa, id: string): Promise<Paciente | null> {
  const { data } = await supabase.from('pacientes').select(COLS).eq('id', id).maybeSingle()
  return (data as Paciente | null) ?? null
}

export async function documentosExistem(supabase: Supa, id: string) {
  const { data } = await supabase.from('pacientes_documentos').select('paciente_id').eq('paciente_id', id).maybeSingle()
  return data != null
}
