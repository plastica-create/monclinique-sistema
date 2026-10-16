// Papéis, menu e capacidades. ESPELHA a matriz de db/002_rls.sql: aqui só se esconde menu/botão;
// quem garante o acesso é a RLS do banco.
export const PAPEIS = ['admin', 'medico', 'comercial', 'recepcao', 'financeiro'] as const
export type Papel = (typeof PAPEIS)[number]

export const NOME_PAPEL: Record<Papel, string> = {
  admin: 'Administração',
  medico: 'Médico(a)',
  comercial: 'Comercial',
  recepcao: 'Recepção',
  financeiro: 'Financeiro',
}

export type Modulo = 'inicio' | 'agenda' | 'pacientes' | 'orcamentos' | 'financeiro' | 'leads' | 'admin'

export const MENU: { modulo: Modulo; rotulo: string; href: string; papeis: readonly Papel[] }[] = [
  { modulo: 'inicio', rotulo: 'Início', href: '/inicio', papeis: PAPEIS },
  { modulo: 'agenda', rotulo: 'Agenda', href: '/agenda', papeis: ['admin', 'medico', 'comercial', 'recepcao'] },
  { modulo: 'pacientes', rotulo: 'Pacientes', href: '/pacientes', papeis: PAPEIS },
  { modulo: 'orcamentos', rotulo: 'Orçamentos', href: '/orcamentos', papeis: ['admin', 'medico', 'comercial', 'financeiro'] },
  { modulo: 'financeiro', rotulo: 'Financeiro', href: '/financeiro', papeis: ['admin', 'financeiro'] },
  { modulo: 'leads', rotulo: 'Leads', href: '/leads', papeis: ['admin', 'comercial'] },
  { modulo: 'admin', rotulo: 'Administração', href: '/admin', papeis: ['admin'] },
]

export const pode = {
  verModulo: (p: Papel, m: Modulo) => MENU.find((i) => i.modulo === m)?.papeis.includes(p) ?? false,
  cadastrarPaciente: (p: Papel) => p !== 'financeiro',
  verDocumentos: (p: Papel) => p === 'admin' || p === 'financeiro' || p === 'medico',
  editarDocumentos: (p: Papel) => p === 'admin',
  verProntuario: (p: Papel) => p === 'admin' || p === 'medico',
  agendar: (p: Papel) => p !== 'financeiro',
  editarOrcamento: (p: Papel) => p === 'admin' || p === 'comercial' || p === 'medico',
  editarFinanceiro: (p: Papel) => p === 'admin' || p === 'financeiro',
  consentimentos: (p: Papel) => p !== 'financeiro',
}
