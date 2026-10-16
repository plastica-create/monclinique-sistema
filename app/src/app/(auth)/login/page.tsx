import Link from 'next/link'
import { redirect } from 'next/navigation'
import { entrar } from '@/actions/auth'
import { Campo, Enviar, Formulario } from '@/components/form'
import { obterSessao } from '@/lib/sessao'

export const metadata = { title: 'Entrar' }

export default async function Login() {
  const s = await obterSessao()
  if (s.estado === 'ok') redirect('/inicio')
  if (s.estado === 'mfa_pendente' || s.estado === 'mfa_obrigatorio') redirect('/mfa')
  return (
    <>
      <h1>Entrar</h1>
      <Formulario acao={entrar}>
        <Campo nome="email" rotulo="E-mail" tipo="email" autoComplete="username" obrigatorio inputMode="email" />
        <Campo nome="senha" rotulo="Senha" tipo="password" autoComplete="current-password" obrigatorio />
        <Enviar>Entrar</Enviar>
      </Formulario>
      <p className="nota"><Link href="/recuperar">Esqueci a senha</Link> · Acesso só para a equipe da clínica.</p>
    </>
  )
}
