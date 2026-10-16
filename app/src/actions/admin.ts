'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { supabaseServidor } from '@/lib/supabase/server'
import { exigirSessao } from '@/lib/sessao'
import { mensagemErro } from '@/lib/erros'
import { dadosForm, errosCampos, perfilSchema } from '@/lib/schemas'
import type { EstadoAcao } from '@/lib/acao'

export async function salvarPerfil(_: EstadoAcao, fd: FormData): Promise<EstadoAcao> {
  const s = await exigirSessao('admin')
  const valores = dadosForm(fd)
  const p = perfilSchema.safeParse(valores)
  if (!p.success) return { campos: errosCampos(p.error), valores, erro: Object.values(errosCampos(p.error))[0] }
  if (p.data.id === s.userId && (!p.data.ativo || p.data.papel !== 'admin'))
    return { erro: 'Você não pode tirar o seu próprio acesso de administração.' }
  const supabase = await supabaseServidor()
  const novo = valores.novo === '1'
  const { error } = novo
    ? await supabase.from('perfis').insert(p.data)
    : await supabase.from('perfis').update({ papel: p.data.papel, nome: p.data.nome, ativo: p.data.ativo }).eq('id', p.data.id)
  if (error) return { erro: error.code === '23503' ? 'Esse ID não existe em Authentication → Users.' : mensagemErro(error, 'salvar perfil'), valores }
  revalidatePath('/admin')
  return { ok: true, mensagem: novo ? 'Acesso liberado.' : 'Perfil atualizado.' }
}

export async function alternarMfa(_: EstadoAcao, fd: FormData): Promise<EstadoAcao> {
  const s = await exigirSessao('admin')
  const ligar = fd.get('ligar') === 'true'
  if (ligar && s.aal !== 'aal2') return { erro: 'Cadastre e use o seu segundo fator (Minha segurança) antes de exigir MFA, ou você perde o acesso.' }
  const supabase = await supabaseServidor()
  const { error } = await supabase.from('config_seguranca').update({ exigir_mfa_admin_medico: ligar }).eq('id', true)
  if (error) return { erro: mensagemErro(error, 'config MFA') }
  revalidatePath('/admin')
  return { ok: true, mensagem: ligar ? 'MFA agora é obrigatório para administração e médicos.' : 'MFA deixou de ser obrigatório.' }
}

const medicoSchema = z.object({
  id: z.string().optional(),
  nome: z.string().trim().min(1, 'Informe o nome.').max(120),
  crm: z.string().trim().max(20).optional(),
  uf_crm: z.string().trim().toUpperCase().regex(/^([A-Z]{2})?$/, 'UF inválida.').optional(),
  especialidade: z.string().trim().max(80).optional(),
  usuario_id: z.string().trim().optional().refine((v) => !v || z.uuid().safeParse(v).success, 'ID de usuário inválido.'),
  ativo: z.string().optional(),
})

export async function salvarMedico(_: EstadoAcao, fd: FormData): Promise<EstadoAcao> {
  await exigirSessao('admin')
  const valores = dadosForm(fd)
  const p = medicoSchema.safeParse(valores)
  if (!p.success) return { campos: errosCampos(p.error), valores, erro: Object.values(errosCampos(p.error))[0] }
  const { id, ativo, ...m } = p.data
  const linha = { nome: m.nome, crm: m.crm || null, uf_crm: m.uf_crm || null, especialidade: m.especialidade || null,
    usuario_id: m.usuario_id || null, ativo: id ? ativo === 'on' : true }
  const supabase = await supabaseServidor()
  const { error } = id ? await supabase.from('medicos').update(linha).eq('id', id) : await supabase.from('medicos').insert(linha)
  if (error) return { erro: error.code === '23505' ? 'Esse login já está ligado a outro médico.' : mensagemErro(error, 'salvar médico'), valores }
  revalidatePath('/admin')
  return { ok: true, mensagem: 'Médico salvo.' }
}
