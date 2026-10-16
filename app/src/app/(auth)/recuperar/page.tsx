import Link from 'next/link'
import { recuperarSenha } from '@/actions/auth'
import { Campo, Enviar, Formulario } from '@/components/form'

export const metadata = { title: 'Recuperar senha' }

export default function Recuperar() {
  return (
    <>
      <h1>Recuperar senha</h1>
      <Formulario acao={recuperarSenha}>
        <Campo nome="email" rotulo="E-mail" tipo="email" autoComplete="username" obrigatorio />
        <Enviar>Enviar link</Enviar>
      </Formulario>
      <p className="nota"><Link href="/login">Voltar para o login</Link></p>
    </>
  )
}
