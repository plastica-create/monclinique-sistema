import { z } from 'zod'
import { cpfValido, soDigitos, valorReais } from '@/lib/validacao'
import { FORMAS_PAGAMENTO, MOTIVOS_PERDA, ORIGENS } from '@/lib/tipos'

// Campo de texto opcional: '' -> null, com limite de tamanho.
const opc = (max = 200) =>
  z.string().trim().max(max, `Máximo de ${max} caracteres.`).transform((v) => (v === '' ? null : v)).nullable().optional()
    .transform((v) => v ?? null)
const obrig = (rotulo: string, max = 200) => z.string().trim().min(1, `Informe ${rotulo}.`).max(max)
const dataISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.')
const dataOpc = z.string().trim().transform((v) => (v === '' ? null : v)).nullable().optional().transform((v) => v ?? null)
  .refine((v) => v == null || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Data inválida.')
const uuid = z.uuid('Seleção inválida.')
const uuidOpc = z.string().trim().transform((v) => (v === '' ? null : v)).nullable().optional().transform((v) => v ?? null)
  .refine((v) => v == null || z.uuid().safeParse(v).success, 'Seleção inválida.')
const reais = (rotulo: string) =>
  z.string().transform((v, ctx) => {
    const n = valorReais(v)
    if (n == null || n < 0) { ctx.addIssue({ code: 'custom', message: `Valor de ${rotulo} inválido.` }); return z.NEVER }
    return n
  })
const marcado = z.string().optional().transform((v) => v === 'on' || v === 'true')

export const pacienteSchema = z.object({
  nome: obrig('o nome', 150),
  data_nascimento: dataOpc,
  sexo: z.enum(['F', 'M', 'O', '']).optional().transform((v) => (v ? v : null)),
  celular: opc(30).transform((v) => (v ? soDigitos(v) : null)),
  telefone: opc(30).transform((v) => (v ? soDigitos(v) : null)),
  email: opc(150).refine((v) => v == null || z.email().safeParse(v).success, 'E-mail inválido.'),
  origem: z.enum(ORIGENS, { message: 'Escolha a origem do paciente.' }),
  indicacao_original: opc(200),
  convenio: opc(80),
  instagram: opc(80),
  estado_civil: opc(40),
  ocupacao: opc(80),
  cep: opc(12).transform((v) => (v ? soDigitos(v) : null)),
  endereco: opc(200), numero: opc(20), complemento: opc(80), bairro: opc(80), cidade: opc(80),
  uf: opc(2).transform((v) => (v ? v.toUpperCase() : null)).refine((v) => v == null || /^[A-Z]{2}$/.test(v), 'UF inválida.'),
  medico_responsavel_id: uuidOpc,
  observacao: opc(1000),
  cpf: opc(14).transform((v) => (v ? soDigitos(v) : null)).refine((v) => v == null || cpfValido(v), 'CPF inválido.'),
  rg: opc(30),
  confirmar_duplicado: marcado,
})

export const agendamentoSchema = z.object({
  paciente_id: uuidOpc,
  medico_id: uuid,
  dia: dataISO,
  hora: z.string().regex(/^\d{2}:\d{2}$/, 'Hora inválida.'),
  duracao_min: z.coerce.number().int().min(5).max(720),
  tipo: z.enum(['consulta', 'retorno', 'procedimento', 'cirurgia', 'exame', 'bloqueio']),
  procedimento: opc(200),
  convenio: opc(80),
  primeiro_atendimento: marcado,
  observacao: opc(500),
}).refine((v) => v.tipo === 'bloqueio' || v.paciente_id, { message: 'Escolha o paciente.', path: ['paciente_id'] })

export const baixaSchema = z.object({
  id: uuid,
  desfecho: z.enum(['finalizado', 'faltou', 'cancelado', 'confirmado', 'em_espera', 'em_atendimento']),
  motivo: opc(300),
}).refine((v) => v.desfecho !== 'cancelado' || v.motivo, { message: 'Informe o motivo do cancelamento.', path: ['motivo'] })

export const orcamentoSchema = z.object({
  paciente_id: uuid,
  medico_id: uuidOpc,
  titulo: obrig('o título', 150),
  tipo_orcamento: z.enum(['cirurgico', 'procedimento', 'outros']),
  situacao: z.enum(['quente', 'morno', 'frio', '']).optional().transform((v) => (v ? v : null)),
  data_emissao: dataISO,
  valido_ate: dataOpc,
  valor_bruto: reais('bruto'),
  valor_liquido: reais('líquido'),
  observacao: opc(1000),
}).refine((v) => v.valor_liquido <= v.valor_bruto, { message: 'O líquido não pode passar do bruto.', path: ['valor_liquido'] })
  .refine((v) => !v.valido_ate || v.valido_ate >= v.data_emissao, { message: 'Validade antes da emissão.', path: ['valido_ate'] })

export const perdaSchema = z.object({
  id: uuid,
  motivo: z.enum(MOTIVOS_PERDA, { message: 'Escolha o motivo da perda.' }),
  detalhe: opc(300),
}).refine((v) => v.motivo !== 'Outro' || v.detalhe, { message: 'Descreva o motivo.', path: ['detalhe'] })

export const itemSchema = z.object({
  orcamento_id: uuid,
  catalogo_id: uuidOpc,
  descricao: obrig('a descrição', 200),
  quantidade: z.coerce.number().positive('Quantidade inválida.').max(9999),
  valor_unitario: reais('unitário'),
  desconto: z.string().optional().transform((v) => valorReais(v ?? '') ?? 0),
})

export const lancamentoSchema = z.object({
  tipo: z.enum(['receita', 'despesa']),
  data_lancamento: dataISO,
  data_pagamento: dataISO,
  paciente_id: uuidOpc,
  orcamento_id: uuidOpc,
  prestador: opc(150),
  descricao: obrig('a descrição', 200),
  categoria_id: uuidOpc,
  caixa_id: uuidOpc,
  forma_pagamento: z.enum(FORMAS_PAGAMENTO).optional().or(z.literal('')).transform((v) => (v ? v : null)),
  valor: reais('valor'),
  valor_liquido: z.string().optional().transform((v) => valorReais(v ?? '')),
  pago: marcado,
}).transform((v) => ({ ...v, valor_liquido: v.valor_liquido ?? v.valor }))
  .refine((v) => v.tipo === 'despesa' || v.valor_liquido <= v.valor, { message: 'O líquido não pode passar do bruto.', path: ['valor_liquido'] })

export const evolucaoSchema = z.object({
  paciente_id: uuid,
  medico_id: uuid,
  dia: dataISO,
  hora: z.string().regex(/^\d{2}:\d{2}$/, 'Hora inválida.'),
  servico: obrig('o serviço', 80),
  tipo_servico: opc(200),
  texto: obrig('o texto da evolução', 50000),
})

export const consentimentoSchema = z.object({
  paciente_id: uuid,
  tipo: z.enum(['tratamento_dados_saude', 'uso_imagem', 'gravacao_audio', 'comunicacao_marketing', 'compartilhamento_terceiros', 'termo_cirurgico', 'outro']),
  versao_termo: obrig('a versão do termo', 80),
  aceito: z.enum(['sim', 'nao']).transform((v) => v === 'sim'),
  canal: z.enum(['presencial_papel', 'assinatura_digital', 'whatsapp', 'site_app', 'telefone', 'outro']),
  observacao: opc(500),
})

export const leadSchema = z.object({
  nome: obrig('o nome', 150),
  telefone: opc(30).transform((v) => (v ? soDigitos(v) : null)),
  email: opc(150).refine((v) => v == null || z.email().safeParse(v).success, 'E-mail inválido.'),
  origem: opc(80), campanha: opc(120),
  etapa: obrig('a etapa', 80),
  valor: z.string().optional().transform((v) => valorReais(v ?? '')),
  responsavel_nome: opc(120),
  observacao: opc(1000),
})

export const perfilSchema = z.object({
  id: uuid,
  papel: z.enum(['admin', 'medico', 'comercial', 'recepcao', 'financeiro']),
  nome: obrig('o nome', 120),
  ativo: marcado,
})

/** FormData -> objeto simples (campos repetidos: o último vence). */
export function dadosForm(fd: FormData): Record<string, string> {
  const o: Record<string, string> = {}
  for (const [k, v] of fd.entries()) if (typeof v === 'string' && !k.startsWith('$ACTION')) o[k] = v
  return o
}

/** Erros do zod -> { campo: mensagem } */
export function errosCampos(e: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const i of e.issues) {
    const k = String(i.path[0] ?? '_')
    if (!out[k]) out[k] = i.message
  }
  return out
}
