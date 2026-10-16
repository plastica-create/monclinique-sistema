// Erro do banco vira mensagem genérica em português; o log leva só o código (nunca o dado).
type ErroBanco = { code?: string; message?: string } | null | undefined

const MENSAGENS: Record<string, string> = {
  '42501': 'Você não tem permissão para esta ação.',
  '23505': 'Já existe um registro com esses dados.',
  '23503': 'Este registro está ligado a outro e não pode ser alterado assim.',
  '23514': 'Algum valor está fora do permitido. Confira os campos.',
  '22P02': 'Algum valor está em formato inválido.',
  '22007': 'Data em formato inválido.',
  '22008': 'Data fora do intervalo permitido.',
  PGRST116: 'Registro não encontrado ou sem permissão.',
}

export function mensagemErro(e: ErroBanco, contexto: string): string {
  const codigo = e?.code ?? 'desconhecido'
  console.error(`[erro] ${contexto}: código ${codigo}`)
  return MENSAGENS[codigo] ?? 'Não foi possível concluir. Tente de novo ou fale com a administração.'
}

export class ErroApp extends Error {}
