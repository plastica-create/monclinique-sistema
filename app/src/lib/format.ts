// Formatação pt-BR. A clínica fica em Cuiabá (America/Cuiaba, UTC-4).
export const FUSO = 'America/Cuiaba'

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const brlCurto = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 })
const inteiro = new Intl.NumberFormat('pt-BR')

export const moeda = (v: number | string | null | undefined) => (v == null || v === '' ? '—' : brl.format(Number(v)))
export const moedaCurta = (v: number) => brlCurto.format(v)
export const numero = (v: number | null | undefined) => (v == null ? '—' : inteiro.format(v))
export const pct = (v: number | null | undefined, casas = 1) =>
  v == null || !Number.isFinite(v) ? '—' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: casas, minimumFractionDigits: casas })}%`

/** 'AAAA-MM-DD' (date do banco) -> 'DD/MM/AAAA', sem passar por fuso. */
export function data(iso: string | null | undefined) {
  if (!iso) return '—'
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

const fmtDataHora = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, dateStyle: 'short', timeStyle: 'short' })
const fmtHora = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit' })
export const dataHora = (iso: string | null | undefined) => (iso ? fmtDataHora.format(new Date(iso)) : '—')
export const hora = (iso: string) => fmtHora.format(new Date(iso))

/** Hoje em Cuiabá como 'AAAA-MM-DD'. */
export function hojeISO(agora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO }).format(agora)
}

/** Soma dias a 'AAAA-MM-DD'. */
export function somarDias(iso: string, dias: number) {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

/** 'AAAA-MM-DD' + 'HH:MM' de Cuiabá -> ISO com fuso (-04:00). */
export function paraTimestamp(dia: string, hhmm: string) {
  return `${dia}T${hhmm}:00-04:00`
}

/** Limites [início, fim) de um dia de Cuiabá, em ISO. */
export function limitesDia(dia: string) {
  return { de: paraTimestamp(dia, '00:00'), ate: paraTimestamp(somarDias(dia, 1), '00:00') }
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
/** '2026-03-01' -> 'mar/26' */
export function mesCurto(iso: string) {
  const [a, m] = iso.split('-')
  return `${MESES[Number(m) - 1]}/${a!.slice(2)}`
}

const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
export function diaPorExtenso(iso: string) {
  const d = new Date(`${iso}T12:00:00Z`)
  return `${DIAS[d.getUTCDay()]}, ${data(iso)}`
}

export function idade(nascimento: string | null, hoje = hojeISO()) {
  if (!nascimento) return null
  const [a, m, d] = nascimento.split('-').map(Number) as [number, number, number]
  const [ha, hm, hd] = hoje.split('-').map(Number) as [number, number, number]
  return ha - a - (hm < m || (hm === m && hd < d) ? 1 : 0)
}

/** Mostra só os 4 últimos dígitos de um telefone (listas). */
export const telefoneMascarado = (t: string | null) => (t ? `•••• ${t.replace(/\D/g, '').slice(-4)}` : '—')

export function telefone(t: string | null) {
  if (!t) return '—'
  const d = t.replace(/\D/g, '')
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return t
}

export const cpfMascarado = '•••.•••.•••-••'
export function cpf(d: string) {
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : d
}
