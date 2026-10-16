import { redirect } from 'next/navigation'
import { sair } from '@/actions/auth'
import { CadastroMfa, VerificarMfa } from '@/components/mfa'
import { obterSessao } from '@/lib/sessao'
import { supabaseServidor } from '@/lib/supabase/server'

export const metadata = { title: 'Segundo fator' }

export default async function Mfa() {
  const s = await obterSessao()
  if (s.estado === 'sem_login') redirect('/login')
  if (s.estado === 'ok' || s.estado === 'sem_perfil') redirect('/inicio')
  const supabase = await supabaseServidor()
  const { data } = await supabase.auth.mfa.listFactors()
  const fator = data?.totp?.[0]
  return (
    <>
      {s.estado === 'mfa_pendente' && fator ? (
        <>
          <h1>Código de verificação</h1>
          <p>Abra o aplicativo autenticador e digite o código de 6 números.</p>
          <VerificarMfa factorId={fator.id} />
        </>
      ) : (
        <>
          <h1>Cadastre o segundo fator</h1>
          <p>Por segurança, o seu perfil exige um aplicativo autenticador (Google Authenticator, Microsoft Authenticator, 1Password…).</p>
          <CadastroMfa />
        </>
      )}
      <form action={sair}><button className="link-botao" type="submit">Sair</button></form>
    </>
  )
}
