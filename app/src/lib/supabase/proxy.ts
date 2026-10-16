import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const OPCOES = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/' }

/** Renova a sessão (cookie) a cada requisição e devolve se há usuário válido. */
export async function atualizarSessao(request: NextRequest, requestHeaders: Headers) {
  let response = NextResponse.next({ request: { headers: requestHeaders } })
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookieOptions: OPCOES,
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (lista) => {
        for (const { name, value } of lista) request.cookies.set(name, value)
        response = NextResponse.next({ request: { headers: requestHeaders } })
        for (const { name, value, options } of lista) response.cookies.set(name, value, { ...options, ...OPCOES })
      },
    },
  })
  // getClaims valida o JWT (não confia só no cookie).
  const { data } = await supabase.auth.getClaims()
  return { response, logado: Boolean(data?.claims?.sub) }
}
