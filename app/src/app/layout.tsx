import type { Metadata, Viewport } from 'next'
import { connection } from 'next/server'
import './globals.css'

export const metadata: Metadata = {
  title: { default: 'Mon Clinique', template: '%s · Mon Clinique' },
  description: 'Sistema de gestão da clínica',
  robots: { index: false, follow: false },
}
export const viewport: Viewport = {
  themeColor: [{ media: '(prefers-color-scheme: light)', color: '#f4f2ee' }, { media: '(prefers-color-scheme: dark)', color: '#12181a' }],
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await connection() // tudo dinâmico: o nonce do CSP muda a cada requisição
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  )
}
