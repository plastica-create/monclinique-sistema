// Limite simples de tentativas, em memória e por instância (em serverless é parcial;
// a defesa real é a do Supabase Auth). 5 falhas em 15 minutos por chave.
const JANELA_MS = 15 * 60 * 1000
const MAX_FALHAS = 5
const falhas = new Map<string, number[]>()

export function bloqueado(chave: string, agora = Date.now()) {
  const lista = (falhas.get(chave) ?? []).filter((t) => agora - t < JANELA_MS)
  falhas.set(chave, lista)
  return lista.length >= MAX_FALHAS
}
export function registrarFalha(chave: string, agora = Date.now()) {
  falhas.set(chave, [...(falhas.get(chave) ?? []).filter((t) => agora - t < JANELA_MS), agora])
}
export function limparFalhas(chave: string) {
  falhas.delete(chave)
}
