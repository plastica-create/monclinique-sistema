import Link from 'next/link'
import { sair } from '@/actions/auth'
import { Marca } from '@/components/marca'
import { Menu } from '@/components/menu'
import { MENU, NOME_PAPEL } from '@/lib/roles'
import { exigirSessao } from '@/lib/sessao'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await exigirSessao()
  const itens = MENU.filter((m) => m.papeis.includes(s.papel)).map(({ href, rotulo }) => ({ href, rotulo }))
  return (
    <div className="casca">
      <a href="#conteudo" className="pular">Pular para o conteúdo</a>
      <aside className="lateral">
        <Marca />
        <Menu itens={itens} />
        <div className="usuario">
          <span><b>{s.nome}</b><br /><span className="papel">{NOME_PAPEL[s.papel]}</span></span>
          <Link href="/seguranca" prefetch={false}>Minha segurança</Link>
          <form action={sair}><button className="link-botao" type="submit">Sair</button></form>
        </div>
      </aside>
      <main id="conteudo" className="principal">{children}</main>
    </div>
  )
}
