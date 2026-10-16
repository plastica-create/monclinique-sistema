import 'server-only'

function obrigatoria(nome: string): string {
  const v = process.env[nome]
  if (!v) throw new Error(`Variável de ambiente ausente: ${nome} (ver .env.example)`)
  return v
}

export const SUPABASE_URL = () => obrigatoria('NEXT_PUBLIC_SUPABASE_URL')
export const SUPABASE_ANON_KEY = () => obrigatoria('NEXT_PUBLIC_SUPABASE_ANON_KEY')
export const EM_PRODUCAO = process.env.NODE_ENV === 'production'
