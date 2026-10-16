import { sair } from '@/actions/auth'
import { Marca } from '@/components/marca'

export const metadata = { title: 'Sem acesso' }

export default function SemAcesso() {
  return (
    <main className="auth">
      <div className="auth-caixa">
        <Marca href="/login" />
        <h1>Seu login ainda não tem acesso</h1>
        <p>O seu usuário existe, mas ainda não recebeu um perfil (ou foi desativado). Peça à administração da clínica para liberar o acesso.</p>
        <form action={sair}><button className="botao secundario" type="submit">Sair</button></form>
      </div>
    </main>
  )
}
