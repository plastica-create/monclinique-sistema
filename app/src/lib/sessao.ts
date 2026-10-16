import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { supabaseServidor } from '@/lib/supabase/server'
import { pode, type Modulo, type Papel } from '@/lib/roles'

export type Sessao =
  | { estado: 'sem_login' }
  | { estado: 'mfa_pendente'; email: string }          // tem 2º fator cadastrado, sessão ainda aal1
  | { estado: 'mfa_obrigatorio'; email: string; nome: string } // banco exige MFA (admin/médico) e não há fator
  | { estado: 'sem_perfil'; email: string }             // login sem linha ativa em perfis
  | { estado: 'ok'; userId: string; email: string; nome: string; papel: Papel; medicoId: string | null; aal: string }

/** Estado da sessão do usuário (uma vez por requisição). */
export const obterSessao = cache(async (): Promise<Sessao> => {
  const supabase = await supabaseServidor()
  const { data: c } = await supabase.auth.getClaims()
  const claims = c?.claims
  if (!claims?.sub) return { estado: 'sem_login' }
  const email = String(claims.email ?? '')

  // aal vem do JWT já validado; se a sessão é aal1 e existe fator verificado, falta o código
  const aal = String(claims.aal ?? 'aal1')
  if (aal !== 'aal2') {
    const { data: fatores } = await supabase.auth.mfa.listFactors()
    if ((fatores?.totp ?? []).some((f) => f.status === 'verified')) return { estado: 'mfa_pendente', email }
  }

  const [{ data: perfil }, { data: papel }] = await Promise.all([
    supabase.from('perfis').select('nome, papel, ativo').eq('id', claims.sub).maybeSingle(),
    supabase.rpc('papel_atual'),
  ])
  if (!perfil || !perfil.ativo) return { estado: 'sem_perfil', email }
  if (!papel) return { estado: 'mfa_obrigatorio', email, nome: perfil.nome as string }

  let medicoId: string | null = null
  if (papel === 'medico' || papel === 'admin') {
    const { data } = await supabase.rpc('medico_atual_id')
    medicoId = (data as string | null) ?? null
  }
  return {
    estado: 'ok', userId: claims.sub, email, nome: perfil.nome as string, papel: papel as Papel, medicoId,
    aal,
  }
})

export type SessaoOk = Extract<Sessao, { estado: 'ok' }>

/** Exige sessão válida (e, se informado, acesso ao módulo). Redireciona caso contrário. */
export async function exigirSessao(modulo?: Modulo): Promise<SessaoOk> {
  const s = await obterSessao()
  if (s.estado === 'sem_login') redirect('/login')
  if (s.estado === 'mfa_pendente' || s.estado === 'mfa_obrigatorio') redirect('/mfa')
  if (s.estado === 'sem_perfil') redirect('/sem-acesso')
  if (modulo && !pode.verModulo(s.papel, modulo)) redirect('/inicio?negado=1')
  return s
}
