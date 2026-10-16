'use server'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { supabaseServidor } from '@/lib/supabase/server'
import { bloqueado, limparFalhas, registrarFalha } from '@/lib/limite'
import type { EstadoAcao } from '@/lib/acao'

async function ipCliente() {
  const h = await headers()
  return (h.get('x-forwarded-for') ?? '').split(',')[0]?.trim() || h.get('x-real-ip') || 'local'
}

const loginSchema = z.object({ email: z.email().max(200), senha: z.string().min(1).max(200) })

export async function entrar(_: EstadoAcao, fd: FormData): Promise<EstadoAcao> {
  const p = loginSchema.safeParse({ email: String(fd.get('email') ?? '').trim().toLowerCase(), senha: fd.get('senha') })
  if (!p.success) return { erro: 'Informe e-mail e senha.', valores: { email: String(fd.get('email') ?? '') } }
  const chave = `${await ipCliente()}|${p.data.email}`
  if (bloqueado(chave)) return { erro: 'Muitas tentativas. Aguarde 15 minutos e tente de novo.' }
  const supabase = await supabaseServidor()
  const { error } = await supabase.auth.signInWithPassword({ email: p.data.email, password: p.data.senha })
  if (error) {
    registrarFalha(chave)
    return { erro: 'E-mail ou senha incorretos.', valores: { email: p.data.email } }
  }
  limparFalhas(chave)
  redirect('/inicio')
}

export async function sair() {
  const supabase = await supabaseServidor()
  await supabase.auth.signOut()
  redirect('/login')
}

export async function recuperarSenha(_: EstadoAcao, fd: FormData): Promise<EstadoAcao> {
  const email = String(fd.get('email') ?? '').trim().toLowerCase()
  const ok = { ok: true, mensagem: 'Se o e-mail estiver cadastrado, você vai receber um link para criar uma nova senha.' }
  if (!z.email().safeParse(email).success) return { erro: 'Informe um e-mail válido.' }
  const chave = `rec|${await ipCliente()}`
  if (bloqueado(chave)) return ok
  registrarFalha(chave) // conta pedidos, não só falhas
  const h = await headers()
  const origem = `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('host')}`
  const supabase = await supabaseServidor()
  await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origem}/auth/callback?proximo=/redefinir` })
  return ok // mesma resposta exista ou não o e-mail
}

const senhaSchema = z.object({
  senha: z.string().min(12, 'Use pelo menos 12 caracteres.').max(200),
  confirmar: z.string(),
}).refine((v) => v.senha === v.confirmar, { message: 'As senhas não conferem.', path: ['confirmar'] })

export async function redefinirSenha(_: EstadoAcao, fd: FormData): Promise<EstadoAcao> {
  const p = senhaSchema.safeParse({ senha: fd.get('senha'), confirmar: fd.get('confirmar') })
  if (!p.success) return { campos: Object.fromEntries(p.error.issues.map((i) => [String(i.path[0]), i.message])) }
  const supabase = await supabaseServidor()
  const { error } = await supabase.auth.updateUser({ password: p.data.senha })
  if (error) return { erro: error.code === 'same_password' ? 'A nova senha precisa ser diferente da atual.' :
    error.code === 'weak_password' ? 'Senha fraca ou já vazada. Escolha outra.' : 'Não foi possível trocar a senha. Peça um novo link.' }
  redirect('/inicio')
}

// ---------------------------------------------------------------- MFA (TOTP)
export async function iniciarCadastroMfa(): Promise<EstadoAcao> {
  const supabase = await supabaseServidor()
  // remove fatores não verificados que ficaram de tentativas anteriores
  const { data: lista } = await supabase.auth.mfa.listFactors()
  for (const f of lista?.all ?? []) if (f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id })
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `App ${new Date().toISOString().slice(0, 10)}` })
  if (error || !data) return { erro: 'Não foi possível iniciar o cadastro do segundo fator.' }
  return { ok: true, dados: { factorId: data.id, qr: data.totp.qr_code, segredo: data.totp.secret } }
}

const codigoSchema = z.object({ factorId: z.string().min(1).max(100), codigo: z.string().regex(/^\d{6}$/, 'Digite os 6 números do aplicativo.') })

export async function verificarMfa(_: EstadoAcao, fd: FormData): Promise<EstadoAcao> {
  const p = codigoSchema.safeParse({ factorId: fd.get('factorId'), codigo: String(fd.get('codigo') ?? '').replace(/\s/g, '') })
  if (!p.success) return { campos: { codigo: p.error.issues[0]?.message ?? 'Código inválido.' } }
  const chave = `mfa|${await ipCliente()}|${p.data.factorId}`
  if (bloqueado(chave)) return { erro: 'Muitas tentativas. Aguarde 15 minutos.' }
  const supabase = await supabaseServidor()
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: p.data.factorId, code: p.data.codigo })
  if (error) {
    registrarFalha(chave)
    return { campos: { codigo: 'Código incorreto ou expirado.' } }
  }
  limparFalhas(chave)
  redirect('/inicio')
}

export async function removerFatorMfa(_: EstadoAcao, fd: FormData): Promise<EstadoAcao> {
  const factorId = String(fd.get('factorId') ?? '')
  const supabase = await supabaseServidor()
  const { error } = await supabase.auth.mfa.unenroll({ factorId })
  if (error) return { erro: 'Para remover o segundo fator, entre de novo usando o código do aplicativo.' }
  return { ok: true, mensagem: 'Segundo fator removido.' }
}
