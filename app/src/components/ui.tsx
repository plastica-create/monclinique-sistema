import Link from 'next/link'
import type { ReactNode } from 'react'

export function Cabecalho({ titulo, sub, acoes }: { titulo: string; sub?: ReactNode; acoes?: ReactNode }) {
  return (
    <header className="cabecalho">
      <div>
        <h1>{titulo}</h1>
        {sub && <p className="sub">{sub}</p>}
      </div>
      {acoes && <div className="acoes">{acoes}</div>}
    </header>
  )
}

export function Cartao({ titulo, children, acoes, className }: { titulo?: string; children: ReactNode; acoes?: ReactNode; className?: string }) {
  return (
    <section className={`cartao ${className ?? ''}`}>
      {(titulo || acoes) && (
        <div className="cartao-topo">
          {titulo && <h2>{titulo}</h2>}
          {acoes}
        </div>
      )}
      {children}
    </section>
  )
}

export type Tom = 'neutro' | 'ok' | 'aviso' | 'erro' | 'info' | 'ouro'
export function Etiqueta({ tom = 'neutro', children }: { tom?: Tom; children: ReactNode }) {
  return <span className={`etiqueta ${tom}`}>{children}</span>
}

export function Vazio({ children }: { children: ReactNode }) {
  return <p className="vazio">{children}</p>
}

export function Botao({ href, children, variante = 'primario' }: { href: string; children: ReactNode; variante?: 'primario' | 'secundario' }) {
  return <Link href={href as never} className={`botao ${variante}`}>{children}</Link>
}

export function Abas({ itens, atual }: { itens: { href: string; rotulo: string; chave: string }[]; atual: string }) {
  return (
    <nav className="abas" aria-label="Filtros">
      {itens.map((i) => (
        <Link key={i.chave} href={i.href as never} aria-current={i.chave === atual ? 'page' : undefined}>{i.rotulo}</Link>
      ))}
    </nav>
  )
}

export function Kpi({ rotulo, valor, detalhe, tom, href }: { rotulo: string; valor: string; detalhe?: string; tom?: Tom; href?: string }) {
  const corpo = (
    <>
      <span className="kpi-rotulo">{rotulo}</span>
      <strong className={`kpi-valor ${tom ?? ''}`}>{valor}</strong>
      {detalhe && <span className="kpi-detalhe">{detalhe}</span>}
    </>
  )
  return href ? <Link href={href as never} className="kpi">{corpo}</Link> : <div className="kpi">{corpo}</div>
}
