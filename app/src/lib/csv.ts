// CSV simples (vírgula ou ponto e vírgula, aspas duplas). Usado na importação de leads.
export function lerCsv(texto: string): string[][] {
  const linhas: string[][] = []
  const sep = (texto.split('\n')[0] ?? '').split(';').length > (texto.split('\n')[0] ?? '').split(',').length ? ';' : ','
  let campo = ''
  let linha: string[] = []
  let aspas = false
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]!
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++ }
      else if (c === '"') aspas = false
      else campo += c
    } else if (c === '"') aspas = true
    else if (c === sep) { linha.push(campo.trim()); campo = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++
      linha.push(campo.trim()); campo = ''
      if (linha.some((x) => x !== '')) linhas.push(linha)
      linha = []
    } else campo += c
  }
  linha.push(campo.trim())
  if (linha.some((x) => x !== '')) linhas.push(linha)
  return linhas
}

/** Converte linhas em objetos usando o cabeçalho (minúsculo, sem acento, _). */
export function comCabecalho(linhas: string[][]) {
  const [cab, ...resto] = linhas
  if (!cab) return []
  const chaves = cab.map((c) => c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\W+/g, '_'))
  return resto.map((l) => Object.fromEntries(chaves.map((k, i) => [k, l[i] ?? ''])))
}
