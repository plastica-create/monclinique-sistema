import { NextResponse, type NextRequest } from 'next/server'
import { atualizarSessao } from '@/lib/supabase/proxy'

const PUBLICAS = ['/login', '/recuperar', '/auth/callback']

function montarCsp(nonce: string) {
  const dev = process.env.NODE_ENV === 'development'
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    // atributos style do React/SVG exigem unsafe-inline em estilos (não em scripts)
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    // o navegador só fala com o Supabase no envio direto de anexo (URL assinada)
    `connect-src 'self' ${supabase}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ['upgrade-insecure-requests']),
  ].join('; ')
}

export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const csp = montarCsp(nonce)
  const headers = new Headers(request.headers)
  headers.set('x-nonce', nonce)
  headers.set('Content-Security-Policy', csp)

  const { response, logado } = await atualizarSessao(request, headers)
  const caminho = request.nextUrl.pathname
  const publica = PUBLICAS.some((p) => caminho === p || caminho.startsWith(p + '/'))

  let final = response
  if (!logado && !publica) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    final = NextResponse.redirect(url)
    for (const c of response.cookies.getAll()) final.cookies.set(c)
  }
  final.headers.set('Content-Security-Policy', csp)
  final.headers.set('Cache-Control', 'private, no-store')
  return final
}

export const config = {
  matcher: [
    {
      source: '/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
}
