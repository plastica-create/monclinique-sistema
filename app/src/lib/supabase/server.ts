import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { EM_PRODUCAO, SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/env'

// Cookies de sessão só no servidor: httpOnly (o JavaScript da página nunca vê o token).
export const OPCOES_COOKIE = { httpOnly: true, secure: EM_PRODUCAO, sameSite: 'lax' as const, path: '/' }

/** Cliente Supabase do usuário logado (chave anon + JWT do cookie). A RLS decide o que ele lê. */
export async function supabaseServidor() {
  const store = await cookies()
  return createServerClient(SUPABASE_URL(), SUPABASE_ANON_KEY(), {
    cookieOptions: OPCOES_COOKIE,
    cookies: {
      getAll: () => store.getAll(),
      setAll: (lista) => {
        try {
          for (const { name, value, options } of lista) store.set(name, value, { ...options, ...OPCOES_COOKIE })
        } catch {
          // Em Server Component não dá para gravar cookie; o proxy renova a sessão.
        }
      },
    },
  })
}

export type Supa = Awaited<ReturnType<typeof supabaseServidor>>
