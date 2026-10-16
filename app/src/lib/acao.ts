// Estado devolvido por toda Server Action de formulário (useActionState).
export type EstadoAcao = {
  ok?: boolean
  erro?: string
  campos?: Record<string, string>
  mensagem?: string
  valores?: Record<string, string>
  aviso?: string       // ex.: possível duplicado, pede confirmação
  dados?: unknown
}
export const ESTADO_INICIAL: EstadoAcao = {}
