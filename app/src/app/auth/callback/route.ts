import { NextResponse, type NextRequest } from 'next/server'
import { supabaseServidor } from '@/lib/supabase/server'

// Troca o código PKCE do e-mail (recuperação de senha) por uma sessão.
export async function GET(request: NextRequest) {
  const url = request.nextUrl
  const codigo = url.searchParams.get('code')
  const proximo = url.searchParams.get('proximo')
  const destino = proximo === '/redefinir' ? '/redefinir' : '/inicio'   // só destinos conhecidos (sem open redirect)
  if (codigo) {
    const supabase = await supabaseServidor()
    const { error } = await supabase.auth.exchangeCodeForSession(codigo)
    if (!error) return NextResponse.redirect(new URL(destino, url.origin))
  }
  return NextResponse.redirect(new URL('/login?link=invalido', url.origin))
}
