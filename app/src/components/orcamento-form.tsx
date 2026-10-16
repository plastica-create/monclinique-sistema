import { salvarOrcamento } from '@/actions/orcamentos'
import { Campo, Enviar, Formulario, Selecao } from '@/components/form'
import { EscolherPaciente } from '@/components/paciente-picker'
import { hojeISO, somarDias } from '@/lib/format'
import { ROTULO_TEMP, ROTULO_TIPO_ORC, type Medico, type Orcamento } from '@/lib/tipos'

const reais = (v: number | null | undefined) => (v == null ? '' : String(v).replace('.', ','))

export function OrcamentoForm({ o, medicos, paciente, medicoFixo }: {
  o?: Orcamento; medicos: Medico[]; paciente?: { id: string; nome: string } | null; medicoFixo?: boolean
}) {
  const hoje = hojeISO()
  return (
    <Formulario acao={salvarOrcamento}>
      {o && <input type="hidden" name="id" value={o.id} />}
      <EscolherPaciente inicial={paciente ?? (o ? { id: o.paciente_id, nome: o.paciente?.nome ?? 'Paciente' } : null)} />
      <div className="linha-form">
        <Campo nome="titulo" rotulo="Título" obrigatorio padrao={o?.titulo} placeholder="ex.: Rinoplastia" />
        <Selecao nome="tipo_orcamento" rotulo="Tipo" padrao={o?.tipo_orcamento ?? 'procedimento'} opcoes={Object.entries(ROTULO_TIPO_ORC)} />
        {!medicoFixo && <Selecao nome="medico_id" rotulo="Médico" vazio="—" padrao={o?.medico_id ?? medicos[0]?.id} opcoes={medicos.map((m) => [m.id, m.nome] as const)} />}
        <Selecao nome="situacao" rotulo="Temperatura" vazio="—" padrao={o?.situacao ?? 'morno'} opcoes={Object.entries(ROTULO_TEMP)} />
      </div>
      <div className="linha-form">
        <Campo nome="data_emissao" rotulo="Emissão" tipo="date" obrigatorio padrao={o?.data_emissao ?? hoje} />
        <Campo nome="valido_ate" rotulo="Válido até" tipo="date" padrao={o?.valido_ate ?? somarDias(hoje, 30)} />
        <Campo nome="valor_bruto" rotulo="Valor bruto (R$)" inputMode="decimal" obrigatorio padrao={reais(o?.valor_bruto)} />
        <Campo nome="valor_liquido" rotulo="Valor com desconto (R$)" inputMode="decimal" obrigatorio padrao={reais(o?.valor_liquido)}
          ajuda="Se houver itens, os totais são recalculados por eles." />
      </div>
      <Campo nome="observacao" rotulo="Observação" tipo="textarea" padrao={o?.observacao} />
      <div className="form-acoes"><Enviar>{o ? 'Salvar alterações' : 'Criar orçamento'}</Enviar></div>
    </Formulario>
  )
}
