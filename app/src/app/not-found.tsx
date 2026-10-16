import Link from 'next/link'

export default function NaoEncontrado() {
  return (
    <main className="auth"><div className="auth-caixa">
      <h1>Não encontrado</h1>
      <p>Esta página não existe ou o seu perfil não tem acesso a este registro.</p>
      <Link href="/inicio" className="botao primario">Voltar ao início</Link>
    </div></main>
  )
}
