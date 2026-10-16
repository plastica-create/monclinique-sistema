'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function Menu({ itens }: { itens: { href: string; rotulo: string }[] }) {
  const atual = usePathname()
  return (
    <nav className="menu" aria-label="Principal">
      {itens.map((i) => (
        <Link key={i.href} href={i.href as never} prefetch={false}
          aria-current={atual === i.href || atual.startsWith(i.href + '/') ? 'page' : undefined}>
          {i.rotulo}
        </Link>
      ))}
    </nav>
  )
}
