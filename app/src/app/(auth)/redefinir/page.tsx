import { redirect } from 'next/navigation'
import { redefinirSenha } from '@/actions/auth'
import { Campo, Enviar, Formulario } from '@/components/form'
import { obterSessao } from '@/lib/sessao'

export const metadata = { title: 'Nova senha' }

export default async function Redefinir() {
  const s = await obterSessao()
  if (s.estado === 'sem_login') redirect('/login')
  return (
    <>
      <h1>Criar nova senha</h1>
      <Formulario acao={redefinirSenha}>
        <Campo nome="senha" rotulo="Nova senha" tipo="password" autoComplete="new-password" obrigatorio ajuda="Mínimo de 12 caracteres." />
        <Campo nome="confirmar" rotulo="Repita a senha" tipo="password" autoComplete="new-password" obrigatorio />
        <Enviar>Salvar senha</Enviar>
      </Formulario>
    </>
  )
}
