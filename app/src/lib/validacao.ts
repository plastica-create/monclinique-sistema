// Regras puras (testadas em validacao.test.ts).

export function soDigitos(v: string) {
  return v.replace(/\D/g, '')
}

/** CPF válido pelo dígito verificador (11 dígitos, não repetidos). */
export function cpfValido(v: string) {
  const d = soDigitos(v)
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false
  const dv = (n: number) => {
    let soma = 0
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i)
    const r = (soma * 10) % 11
    return r === 10 ? 0 : r
  }
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10])
}

/** Remove acentos, maiúsculas, espaços colapsados (igual a public.normaliza_texto). */
export function normalizar(t: string | null | undefined) {
  return (t ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

/** Valor em reais digitado ("1.234,56", "1234.56", "R$ 10") -> número com 2 casas, ou null. */
export function valorReais(v: string | null | undefined): number | null {
  if (v == null) return null
  let s = v.replace(/[R$\s]/g, '')
  if (!s) return null
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '')   // "3.000" = três mil (pt-BR)
  const n = Number(s)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}

/** Texto de busca seguro para o filtro ilike do PostgREST (sem curingas/vírgulas/parênteses). */
export function termoBusca(t: string) {
  return t.replace(/[%_*,()\\.:"']/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)
}
