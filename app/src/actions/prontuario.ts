'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { supabaseServidor } from '@/lib/supabase/server'
import { exigirSessao } from '@/lib/sessao'
import { pode } from '@/lib/roles'
import { mensagemErro } from '@/lib/erros'
import { consentimentoSchema, dadosForm, errosCampos, evolucaoSchema } from '@/lib/schemas'
import { paraTimestamp } from '@/lib/format'
import type { EstadoAcao } from '@/lib/acao'
import type { ClasseAnexo } from '@/lib/tipos'

// ---------------------------------------------------------------- evolução clínica
export async function salvarEvolucao(_: EstadoAcao, fd: FormData): Promise<EstadoAcao> {
  const s = await exigirSessao()
  if (!pode.verProntuario(s.papel)) return { erro: 'Sem permissão para o prontuário.' }
  const valores = dadosForm(fd)
  const p = evolucaoSchema.safeParse(valores)
  if (!p.success) { const campos = errosCampos(p.error); return { campos, valores, erro: Object.values(campos)[0] } }
  if (s.papel === 'medico' && p.data.medico_id !== s.medicoId) return { erro: 'Você só registra evolução em seu nome.', valores }
  const supabase = await supabaseServidor()
  const { error } = await supabase.from('atendimentos').insert({
    paciente_id: p.data.paciente_id, medico_id: p.data.medico_id, inicio: paraTimestamp(p.data.dia, p.data.hora),
    servico: p.data.servico, tipo_servico: p.data.tipo_servico, texto: p.data.texto,
  }).select('id').single()   // nunca select('*') em atendimentos
  if (error) return { erro: mensagemErro(error, 'gravar evolução'), valores }
  revalidatePath(`/prontuario/${p.data.paciente_id}`)
  return { ok: true, mensagem: 'Evolução registrada.' }
}

const edicaoSchema = z.object({ id: z.uuid(), paciente_id: z.uuid(), texto: z.string().trim().min(1, 'O texto não pode ficar vazio.').max(50000) })

export async function editarEvolucao(_: EstadoAcao, fd: FormData): Promise<EstadoAcao> {
  const s = await exigirSessao()
  if (!pode.verProntuario(s.papel)) return { erro: 'Sem permissão para o prontuário.' }
  const p = edicaoSchema.safeParse(dadosForm(fd))
  if (!p.success) return { campos: errosCampos(p.error) }
  const supabase = await supabaseServidor()
  // a versão anterior fica na auditoria (trigger); texto_html legado deixa de valer
  const { error } = await supabase.from('atendimentos').update({ texto: p.data.texto, texto_html: null }).eq('id', p.data.id).select('id').single()
  if (error) return { erro: mensagemErro(error, 'editar evolução') }
  revalidatePath(`/prontuario/${p.data.paciente_id}`)
  return { ok: true, mensagem: 'Evolução atualizada. A versão anterior ficou registrada na auditoria.' }
}

// ---------------------------------------------------------------- consentimentos (LGPD)
export async function registrarConsentimento(_: EstadoAcao, fd: FormData): Promise<EstadoAcao> {
  const s = await exigirSessao()
  if (!pode.consentimentos(s.papel)) return { erro: 'Sem permissão.' }
  const valores = dadosForm(fd)
  const p = consentimentoSchema.safeParse(valores)
  if (!p.success) return { campos: errosCampos(p.error), valores }
  const supabase = await supabaseServidor()
  const { error } = await supabase.from('consentimentos').insert(p.data)
  if (error) return { erro: mensagemErro(error, 'registrar consentimento'), valores }
  revalidatePath(`/pacientes/${p.data.paciente_id}`)
  return { ok: true, mensagem: p.data.aceito ? 'Consentimento registrado.' : 'Recusa registrada.' }
}

const revogarSchema = z.object({ id: z.uuid(), paciente_id: z.uuid(), motivo: z.string().trim().min(1, 'Informe o motivo.').max(300) })

export async function revogarConsentimento(_: EstadoAcao, fd: FormData): Promise<EstadoAcao> {
  const s = await exigirSessao()
  if (!pode.consentimentos(s.papel)) return { erro: 'Sem permissão.' }
  const p = revogarSchema.safeParse(dadosForm(fd))
  if (!p.success) return { campos: errosCampos(p.error) }
  const supabase = await supabaseServidor()
  const { error } = await supabase.from('consentimentos')
    .update({ revogado_em: new Date().toISOString(), motivo_revogacao: p.data.motivo }).eq('id', p.data.id).is('revogado_em', null)
  if (error) return { erro: mensagemErro(error, 'revogar consentimento') }
  revalidatePath(`/pacientes/${p.data.paciente_id}`)
  return { ok: true, mensagem: 'Consentimento revogado.' }
}

// ---------------------------------------------------------------- anexos (bucket privado)
const MIMES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'audio/mpeg', 'audio/mp4', 'audio/x-m4a',
  'audio/wav', 'audio/webm', 'audio/ogg', 'video/mp4'] as const
const MAX_BYTES = 50 * 1024 * 1024

const preparoSchema = z.object({
  paciente_id: z.uuid(),
  classe: z.enum(['clinico', 'administrativo', 'financeiro']),
  nome: z.string().trim().min(1).max(180),
  mime: z.enum(MIMES, { message: 'Tipo de arquivo não permitido.' }),
  tamanho: z.number().int().positive().max(MAX_BYTES, 'Arquivo acima de 50 MB.'),
})

function nomeSeguro(nome: string) {
  return nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').slice(-120)
}

/** Passo 1: o servidor valida e devolve uma URL assinada de envio (o arquivo vai direto ao Storage). */
export async function prepararEnvioAnexo(entrada: z.input<typeof preparoSchema>) {
  await exigirSessao()
  const p = preparoSchema.safeParse(entrada)
  if (!p.success) return { erro: p.error.issues[0]?.message ?? 'Arquivo inválido.' }
  const caminho = `${p.data.paciente_id}/${p.data.classe}/${crypto.randomUUID()}-${nomeSeguro(p.data.nome)}`
  const supabase = await supabaseServidor()
  const { data, error } = await supabase.storage.from('anexos').createSignedUploadUrl(caminho)
  if (error || !data) return { erro: 'Você não tem permissão para enviar este tipo de anexo.' }
  return { url: data.signedUrl, caminho }
}

const registroSchema = preparoSchema.extend({
  caminho: z.string().min(10).max(400),
  tipo_documento: z.string().trim().max(60).optional(),
  data_documento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
})

/** Passo 2: confere que o objeto existe no bucket e grava os metadados. */
export async function registrarAnexo(entrada: z.input<typeof registroSchema>) {
  const s = await exigirSessao()
  const p = registroSchema.safeParse(entrada)
  if (!p.success) return { erro: 'Dados do anexo inválidos.' }
  if (!p.data.caminho.startsWith(`${p.data.paciente_id}/${p.data.classe}/`)) return { erro: 'Caminho inválido.' }
  const supabase = await supabaseServidor()
  const pasta = p.data.caminho.slice(0, p.data.caminho.lastIndexOf('/'))
  const arquivo = p.data.caminho.slice(p.data.caminho.lastIndexOf('/') + 1)
  const { data: lista } = await supabase.storage.from('anexos').list(pasta, { search: arquivo, limit: 1 })
  if (!lista?.some((o) => o.name === arquivo)) return { erro: 'O envio do arquivo não terminou. Tente de novo.' }
  const { error } = await supabase.from('anexos').insert({
    paciente_id: p.data.paciente_id, classe: p.data.classe, tipo_documento: p.data.tipo_documento || null,
    nome_arquivo: p.data.nome, storage_path: p.data.caminho, mime_type: p.data.mime, tamanho_bytes: p.data.tamanho,
    data_documento: p.data.data_documento || null, enviado_por: s.userId,
  })
  if (error) return { erro: mensagemErro(error, 'registrar anexo') }
  revalidatePath(`/pacientes/${p.data.paciente_id}`)
  return { ok: true }
}

/** Abre um anexo por URL assinada de 60 s. Anexo clínico entra na auditoria antes. */
export async function abrirAnexo(id: string) {
  await exigirSessao()
  if (!z.uuid().safeParse(id).success) return { erro: 'Anexo inválido.' }
  const supabase = await supabaseServidor()
  const { data: a } = await supabase.from('anexos').select('id, paciente_id, classe, storage_path').eq('id', id).maybeSingle()
  if (!a?.storage_path) return { erro: 'Arquivo indisponível (legado ainda não migrado).' }
  if ((a.classe as ClasseAnexo) === 'clinico') {
    const { error } = await supabase.rpc('registrar_leitura_prontuario', { p_paciente_id: a.paciente_id, p_finalidade: `anexo ${a.id}` })
    if (error) return { erro: mensagemErro(error, 'auditar anexo') }
  }
  const { data, error } = await supabase.storage.from('anexos').createSignedUrl(a.storage_path as string, 60)
  if (error || !data) return { erro: 'Não foi possível abrir o arquivo.' }
  return { url: data.signedUrl }
}
