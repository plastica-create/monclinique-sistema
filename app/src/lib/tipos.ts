// Linhas do banco usadas pelo app (subset das colunas de db/001_schema.sql).
export type StatusAgendamento = 'nao_confirmado' | 'confirmado' | 'em_espera' | 'em_atendimento' | 'finalizado' | 'cancelado' | 'faltou'
export type TipoAgendamento = 'consulta' | 'retorno' | 'procedimento' | 'cirurgia' | 'exame' | 'bloqueio'
export type StatusOrcamento = 'em_aberto' | 'ganho' | 'perda'
export type Temperatura = 'quente' | 'morno' | 'frio'
export type TipoOrcamento = 'cirurgico' | 'procedimento' | 'outros'
export type TipoLancamento = 'receita' | 'despesa'
export type ClasseAnexo = 'clinico' | 'administrativo' | 'financeiro'
export type StatusLead = 'aberto' | 'ganho' | 'perdido'
export type TipoConsentimento =
  | 'tratamento_dados_saude' | 'uso_imagem' | 'gravacao_audio' | 'comunicacao_marketing'
  | 'compartilhamento_terceiros' | 'termo_cirurgico' | 'outro'
export type CanalConsentimento = 'presencial_papel' | 'assinatura_digital' | 'whatsapp' | 'site_app' | 'telefone' | 'outro'

export type Medico = { id: string; nome: string; ativo: boolean }

export type PacienteResumo = {
  id: string; nome: string; data_nascimento: string | null; celular: string | null; origem: string | null
  ultima_visita_atendimento: string | null; tem_cpf: boolean; ativo: boolean
}

export type Paciente = PacienteResumo & {
  sexo: string | null; estado_civil: string | null; ocupacao: string | null; email: string | null; telefone: string | null
  cep: string | null; endereco: string | null; numero: string | null; complemento: string | null; bairro: string | null
  cidade: string | null; uf: string | null; indicacao_original: string | null; convenio: string | null; instagram: string | null
  medico_responsavel_id: string | null; data_cadastro: string | null; observacao: string | null; cod_legado_gestaods: string | null
}

export type Agendamento = {
  id: string; paciente_id: string | null; medico_id: string | null; data_hora: string; fim: string | null
  tipo: TipoAgendamento; procedimento: string | null; convenio: string | null; status: StatusAgendamento
  primeiro_atendimento: boolean; observacao: string | null
  paciente?: { nome: string } | null; medico?: { nome: string } | null
}

export type Orcamento = {
  id: string; numero: string | null; titulo: string | null; tipo_orcamento: TipoOrcamento; status: StatusOrcamento
  situacao: Temperatura | null; paciente_id: string; medico_id: string | null; orcado_por_nome: string | null
  data_emissao: string; valido_ate: string | null; data_ganho: string | null; data_perda: string | null
  motivo_perda: string | null; valor_bruto: number; valor_liquido: number; observacao: string | null
  paciente?: { nome: string } | null
}

export type OrcamentoItem = {
  id: string; orcamento_id: string; catalogo_id: string | null; ordem: number; descricao: string
  quantidade: number; valor_unitario: number; desconto: number; valor_total: number
}

export type Lancamento = {
  id: string; tipo: TipoLancamento; data_pagamento: string; data_lancamento: string; prestador: string | null
  paciente_id: string | null; paciente_nome_original: string | null; orcamento_id: string | null; descricao: string | null
  categoria_id: string | null; forma_pagamento: string | null; caixa_id: string | null; valor: number; valor_liquido: number
  pago: boolean; data_anomala: boolean
  paciente?: { nome: string } | null; categoria?: { nome: string } | null
}

export type AtendimentoMeta = {
  id: string; paciente_id: string; medico_id: string; inicio: string; fim: string | null; servico: string
  tipo_servico: string | null; legado_cod_repetido: boolean
}
export type Atendimento = AtendimentoMeta & { texto: string | null; texto_html: string | null }

export type Anexo = {
  id: string; paciente_id: string; classe: ClasseAnexo; tipo_documento: string | null; nome_arquivo: string | null
  storage_path: string | null; mime_type: string | null; tamanho_bytes: number | null; data_documento: string | null
  arquivo_disponivel: boolean; created_at: string
}

export type Consentimento = {
  id: string; paciente_id: string; tipo: TipoConsentimento; versao_termo: string; aceito: boolean; aceito_em: string
  canal: CanalConsentimento; revogado_em: string | null; motivo_revogacao: string | null; observacao: string | null
}

export type Lead = {
  id: string; crm_id_externo: string | null; nome: string; telefone: string | null; email: string | null
  origem: string | null; campanha: string | null; etapa: string; status: StatusLead; valor: number | null
  responsavel_nome: string | null; paciente_id: string | null; data_entrada: string | null
  data_ultima_interacao: string | null; motivo_perda: string | null; observacao: string | null
}

export const ROTULO_STATUS_AG: Record<StatusAgendamento, string> = {
  nao_confirmado: 'Não confirmado', confirmado: 'Confirmado', em_espera: 'Em espera', em_atendimento: 'Em atendimento',
  finalizado: 'Compareceu', cancelado: 'Cancelado', faltou: 'Faltou',
}
export const ROTULO_TIPO_AG: Record<TipoAgendamento, string> = {
  consulta: 'Consulta', retorno: 'Retorno', procedimento: 'Procedimento', cirurgia: 'Cirurgia', exame: 'Exame', bloqueio: 'Bloqueio',
}
export const ROTULO_STATUS_ORC: Record<StatusOrcamento, string> = { em_aberto: 'Em aberto', ganho: 'Ganho', perda: 'Perda' }
export const ROTULO_TEMP: Record<Temperatura, string> = { quente: 'Quente', morno: 'Morno', frio: 'Frio' }
export const ROTULO_TIPO_ORC: Record<TipoOrcamento, string> = { cirurgico: 'Cirúrgico', procedimento: 'Procedimento', outros: 'Outros' }
export const ROTULO_CLASSE: Record<ClasseAnexo, string> = { clinico: 'Clínico', administrativo: 'Administrativo', financeiro: 'Financeiro' }
export const ROTULO_CONSENT: Record<TipoConsentimento, string> = {
  tratamento_dados_saude: 'Tratamento de dados de saúde', uso_imagem: 'Uso de imagem', gravacao_audio: 'Gravação de áudio (Plaud/IA)',
  comunicacao_marketing: 'Comunicação de marketing', compartilhamento_terceiros: 'Compartilhamento com terceiros',
  termo_cirurgico: 'Termo cirúrgico', outro: 'Outro',
}
export const ROTULO_CANAL: Record<CanalConsentimento, string> = {
  presencial_papel: 'Presencial (papel)', assinatura_digital: 'Assinatura digital', whatsapp: 'WhatsApp',
  site_app: 'Site/app', telefone: 'Telefone', outro: 'Outro',
}
export const ROTULO_STATUS_LEAD: Record<StatusLead, string> = { aberto: 'Aberto', ganho: 'Ganho', perdido: 'Perdido' }

export const ORIGENS = [
  'Instagram', 'Google', 'Facebook', 'Site', 'Indicação de paciente', 'Indicação de médico', 'Indicação de funcionário',
  'Já é paciente', 'Evento', 'Outro',
] as const
export const MOTIVOS_PERDA = ['Preço', 'Escolheu outro profissional', 'Desistiu do procedimento', 'Sem retorno do paciente', 'Condição clínica', 'Outro'] as const
export const FORMAS_PAGAMENTO = ['Pix', 'Dinheiro', 'Cartão de crédito', 'Cartão de débito', 'Boleto', 'Transferência', 'Outro'] as const
