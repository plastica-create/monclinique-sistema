'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { supabaseServidor } from '@/lib/supabase/server'
import { exigirSessao } from '@/lib/sessao'
import { pode } from '@/lib/roles'
import { mensagemErro } from '@/lib/erros'
import { dadosForm, errosCampos, pacienteSchema } from '@/lib/schemas'
import { buscar } from '@/lib/data/pacientes'
import { termoBusca } from '@/lib/validacao'
import { cpf as fmtCpf } from '@/lib/format'
import type { EstadoAcao } from '@/lib/acao'

/** Busca por POST (o termo — nome ou telefone — nunca vai para a URL nem para o log). */
export async function buscarPacientes(termo: string) {
  await exigirSessao('pacientes')
  const t = termoBusca(termo)
  if (t.length < 2) return []
  try {
    return await buscar(await supabaseServidor(), t)
  } catch (e) {
    mensagemErro(e as { code?: string }, 'buscar pacientes')
    return []
  }
}

export async function salvarPaciente(_: EstadoAcao, fd: FormData): Promise<EstadoAcao> {
  const s = await exigirSessao('pacientes')
  if (!pode.cadastrarPaciente(s.papel)) return { erro: 'Seu perfil não cadastra pacientes.' }
  const valores = dadosForm(fd)
  const id = valores.id || null
  const p = pacienteSchema.safeParse(valores)
  if (!p.success) return { campos: errosCampos(p.error), valores, erro: 'Confira os campos destacados.' }
  const { cpf, rg, confirmar_duplicado, ...cadastro } = p.data
  const supabase = await supabaseServidor()

  if (!confirmar_duplicado) {
    const { data: dup } = await supabase.rpc('possiveis_duplicados', {
      p_nome: cadastro.nome, p_nascimento: cadastro.data_nascimento, p_celular: cadastro.celular, p_ignorar: id,
    })
    if (dup && dup.length > 0) {
      return {
        valores: { ...valores, confirmar_duplicado: 'on' },
        aviso: `Já existe ${dup.length === 1 ? 'um cadastro' : `${dup.length} cadastros`} com este nome e mesmo nascimento ou celular. ` +
          'Confira na busca antes de criar outro. Se for outra pessoa, clique em Salvar de novo.',
      }
    }
  }

  // médico só cadastra paciente vinculado a ele (RLS); preenche sozinho
  if (s.papel === 'medico' && !cadastro.medico_responsavel_id) cadastro.medico_responsavel_id = s.medicoId

  let pacienteId = id
  if (id) {
    const { error } = await supabase.from('pacientes').update(cadastro).eq('id', id)
    if (error) return { erro: mensagemErro(error, 'atualizar paciente'), valores }
  } else {
    const { data, error } = await supabase.from('pacientes')
      .insert({ ...cadastro, data_cadastro: new Date().toISOString().slice(0, 10) }).select('id').single()
    if (error || !data) return { erro: mensagemErro(error, 'criar paciente'), valores }
    pacienteId = data.id as string
  }

  if (cpf || rg) {
    // recepção/comercial só inserem documento; alterar um existente é só admin (RLS)
    const { error } = s.papel === 'admin'
      ? await supabase.from('pacientes_documentos').upsert({ paciente_id: pacienteId, cpf, rg })
      : await supabase.from('pacientes_documentos').insert({ paciente_id: pacienteId, cpf, rg })
    if (error) {
      const msg = error.code === '23505' || error.code === '42501'
        ? 'Os dados foram salvos, mas o CPF/RG já existia e só a administração pode alterar.'
        : mensagemErro(error, 'gravar documentos')
      revalidatePath('/pacientes')
      return { erro: msg, valores: { ...valores, id: pacienteId! } }
    }
  }
  revalidatePath('/pacientes')
  redirect(`/pacientes/${pacienteId}`)
}

const revelarSchema = z.object({ pacienteId: z.uuid() })

/** Revela CPF/RG: a RPC grava a leitura na auditoria antes de devolver. */
export async function revelarDocumento(pacienteId: string): Promise<{ cpf?: string; rg?: string; erro?: string }> {
  await exigirSessao('pacientes')
  const p = revelarSchema.safeParse({ pacienteId })
  if (!p.success) return { erro: 'Paciente inválido.' }
  const supabase = await supabaseServidor()
  const { data, error } = await supabase.rpc('revelar_documento', { p_paciente_id: p.data.pacienteId, p_finalidade: 'tela do paciente' })
  if (error) return { erro: mensagemErro(error, 'revelar documento') }
  const linha = (data as { cpf: string | null; rg: string | null }[] | null)?.[0]
  return { cpf: linha?.cpf ? fmtCpf(linha.cpf) : '—', rg: linha?.rg ?? '—' }
}

export async function arquivarPaciente(_: EstadoAcao, fd: FormData): Promise<EstadoAcao> {
  const s = await exigirSessao('pacientes')
  if (!pode.cadastrarPaciente(s.papel)) return { erro: 'Sem permissão.' }
  const id = z.uuid().safeParse(fd.get('id'))
  if (!id.success) return { erro: 'Paciente inválido.' }
  const ativo = fd.get('ativo') === 'true'
  const supabase = await supabaseServidor()
  const { error } = await supabase.from('pacientes')
    .update({ ativo, arquivado_em: ativo ? null : new Date().toISOString() }).eq('id', id.data)
  if (error) return { erro: mensagemErro(error, 'arquivar paciente') }
  revalidatePath(`/pacientes/${id.data}`)
  return { ok: true, mensagem: ativo ? 'Cadastro reativado.' : 'Cadastro arquivado.' }
}
