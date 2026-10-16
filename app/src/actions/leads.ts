'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { supabaseServidor } from '@/lib/supabase/server'
import { exigirSessao } from '@/lib/sessao'
import { mensagemErro } from '@/lib/erros'
import { dadosForm, errosCampos, leadSchema } from '@/lib/schemas'
import { comCabecalho, lerCsv } from '@/lib/csv'
import { soDigitos, valorReais } from '@/lib/validacao'
import type { EstadoAcao } from '@/lib/acao'

export async function salvarLead(_: EstadoAcao, fd: FormData): Promise<EstadoAcao> {
  await exigirSessao('leads')
  const valores = dadosForm(fd)
  const p = leadSchema.safeParse(valores)
  if (!p.success) return { campos: errosCampos(p.error), valores }
  const supabase = await supabaseServidor()
  const { error } = await supabase.from('leads').insert({ ...p.data, data_entrada: new Date().toISOString() })
  if (error) return { erro: mensagemErro(error, 'criar lead'), valores }
  revalidatePath('/leads')
  return { ok: true, mensagem: 'Lead criado.' }
}

const etapaSchema = z.object({
  id: z.uuid(), etapa: z.string().trim().min(1).max(80), status: z.enum(['aberto', 'ganho', 'perdido']),
  motivo_perda: z.string().trim().max(300).optional(),
}).refine((v) => v.status !== 'perdido' || v.motivo_perda, { message: 'Informe o motivo da perda.', path: ['motivo_perda'] })

export async function moverLead(_: EstadoAcao, fd: FormData): Promise<EstadoAcao> {
  await exigirSessao('leads')
  const p = etapaSchema.safeParse(dadosForm(fd))
  if (!p.success) return { campos: errosCampos(p.error), erro: Object.values(errosCampos(p.error))[0] }
  const supabase = await supabaseServidor()
  const agora = new Date().toISOString()
  const { error } = await supabase.from('leads').update({
    etapa: p.data.etapa, status: p.data.status, data_ultima_interacao: agora,
    data_fechamento: p.data.status === 'aberto' ? null : agora, motivo_perda: p.data.status === 'perdido' ? p.data.motivo_perda : null,
  }).eq('id', p.data.id)
  if (error) return { erro: mensagemErro(error, 'mover lead') }
  revalidatePath('/leads')
  return { ok: true }
}

type LinhaLead = { crm_id_externo: string | null; nome: string; telefone: string | null; email: string | null; origem: string | null;
  campanha: string | null; etapa: string; valor: number | null; responsavel_nome: string | null }

function interpretar(texto: string) {
  const linhas = comCabecalho(lerCsv(texto)).slice(0, 2000)
  const validos: LinhaLead[] = []
  const erros: string[] = []
  linhas.forEach((l, i) => {
    const nome = l.nome ?? l.name ?? ''
    if (!nome) { erros.push(`linha ${i + 2}: sem nome`); return }
    validos.push({
      crm_id_externo: (l.id ?? l.crm_id ?? l.id_externo ?? '') || null, nome: nome.slice(0, 150),
      telefone: soDigitos(l.telefone ?? l.phone ?? '') || null, email: (l.email ?? l.e_mail ?? '') || null,
      origem: (l.origem ?? l.source ?? '') || null, campanha: (l.campanha ?? l.campaign ?? '') || null,
      etapa: (l.etapa ?? l.stage ?? '') || 'Novo', valor: valorReais(l.valor ?? l.value ?? ''), responsavel_nome: (l.responsavel ?? '') || null,
    })
  })
  return { validos, erros }
}

/** Importação de CSV (exportado do Black CRM ou planilha). "Pré-visualizar" não grava. */
export async function importarLeads(_: EstadoAcao, fd: FormData): Promise<EstadoAcao> {
  await exigirSessao('leads')
  const texto = String(fd.get('csv') ?? '')
  if (texto.length > 2_000_000) return { erro: 'Arquivo grande demais (máx. 2 MB).' }
  const { validos, erros } = interpretar(texto)
  if (validos.length === 0) return { erro: 'Nenhuma linha válida. O cabeçalho precisa ter ao menos a coluna "nome".', valores: { csv: texto } }
  if (fd.get('modo') !== 'gravar') {
    return { valores: { csv: texto }, aviso: `${validos.length} lead(s) prontos para importar${erros.length ? `; ${erros.length} linha(s) ignoradas (${erros.slice(0, 3).join('; ')})` : ''}. Clique em Importar para gravar.`,
      dados: validos.slice(0, 10) }
  }
  const supabase = await supabaseServidor()
  const comId = validos.filter((v) => v.crm_id_externo)
  const semId = validos.filter((v) => !v.crm_id_externo)
  if (comId.length) {
    const { error } = await supabase.from('leads').upsert(comId, { onConflict: 'crm_id_externo' })
    if (error) return { erro: mensagemErro(error, 'importar leads'), valores: { csv: texto } }
  }
  if (semId.length) {
    const { error } = await supabase.from('leads').insert(semId.map((v) => ({ ...v, data_entrada: new Date().toISOString() })))
    if (error) return { erro: mensagemErro(error, 'importar leads'), valores: { csv: texto } }
  }
  revalidatePath('/leads')
  return { ok: true, mensagem: `${validos.length} lead(s) importados (${comId.length} atualizados pelo ID do CRM).` }
}
