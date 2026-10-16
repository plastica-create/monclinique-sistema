import Link from 'next/link'
import { darBaixa, salvarAgendamento } from '@/actions/agenda'
import { Campo, Enviar, Formulario, Marcar, Selecao } from '@/components/form'
import { EscolherPaciente } from '@/components/paciente-picker'
import { Etiqueta, type Tom } from '@/components/ui'
import { dataHora, hojeISO, hora } from '@/lib/format'
import { ROTULO_STATUS_AG, ROTULO_TIPO_AG, type Agendamento, type Medico, type StatusAgendamento } from '@/lib/tipos'

export const TOM_STATUS: Record<StatusAgendamento, Tom> = {
  nao_confirmado: 'neutro', confirmado: 'info', em_espera: 'ouro', em_atendimento: 'ouro', finalizado: 'ok', cancelado: 'erro', faltou: 'erro',
}

export function ItemAgenda({ a, comData, podeEditar }: { a: Agendamento; comData?: boolean; podeEditar: boolean }) {
  const passado = new Date(a.data_hora) <= new Date()
  const aberto = ['nao_confirmado', 'confirmado', 'em_espera', 'em_atendimento'].includes(a.status)
  return (
    <div className={`ag-item ${a.status === 'cancelado' ? 'cancelado' : ''}`}>
      <span className="hora">{comData ? dataHora(a.data_hora) : hora(a.data_hora)}</span>
      <div>
        {a.tipo === 'bloqueio' ? <b>Horário bloqueado</b> : a.paciente_id
          ? <Link href={`/pacientes/${a.paciente_id}` as never} prefetch={false}><b>{a.paciente?.nome ?? 'Paciente'}</b></Link> : <b>—</b>}
        <div className="detalhe">
          {ROTULO_TIPO_AG[a.tipo]}{a.procedimento && ` · ${a.procedimento}`} · {a.medico?.nome}
          {a.primeiro_atendimento && <> · <Etiqueta tom="ouro">1ª vez</Etiqueta></>} · <Etiqueta tom={TOM_STATUS[a.status]}>{ROTULO_STATUS_AG[a.status]}</Etiqueta>
        </div>
        {a.observacao && <div className="detalhe">{a.observacao}</div>}
      </div>
      {podeEditar && a.tipo !== 'bloqueio' && aberto && (
        <div className="ag-acoes">
          <Formulario acao={darBaixa} className="form-inline">
            <input type="hidden" name="id" value={a.id} />
            {passado ? (
              <>
                <Enviar nome="desfecho" valor="finalizado">Compareceu</Enviar>
                <Enviar nome="desfecho" valor="faltou" variante="secundario">Faltou</Enviar>
              </>
            ) : a.status === 'nao_confirmado' && <Enviar nome="desfecho" valor="confirmado" variante="secundario">Confirmar</Enviar>}
          </Formulario>
          <details>
            <summary className="link-botao">Cancelar</summary>
            <Formulario acao={darBaixa} className="form-inline">
              <input type="hidden" name="id" value={a.id} /><input type="hidden" name="desfecho" value="cancelado" />
              <Campo nome="motivo" rotulo="Motivo" obrigatorio />
              <Enviar variante="perigo">Cancelar agendamento</Enviar>
            </Formulario>
          </details>
          <Link href={`/agenda/${a.id}` as never} prefetch={false} className="botao secundario pequeno">Remarcar</Link>
        </div>
      )}
    </div>
  )
}

export function AgendamentoForm({ a, medicos, medicoPadrao, paciente, dia }: {
  a?: Agendamento; medicos: Medico[]; medicoPadrao?: string | null; paciente?: { id: string; nome: string } | null; dia?: string
}) {
  const inicio = a ? new Date(a.data_hora) : null
  const fmt = (d: Date, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Cuiaba', ...o }).format(d)
  const duracao = a?.fim ? Math.round((new Date(a.fim).getTime() - new Date(a.data_hora).getTime()) / 60000) : 30
  return (
    <Formulario acao={salvarAgendamento}>
      {a && <input type="hidden" name="id" value={a.id} />}
      <EscolherPaciente inicial={paciente ?? (a?.paciente_id ? { id: a.paciente_id, nome: a.paciente?.nome ?? 'Paciente' } : null)} />
      <div className="linha-form">
        <Selecao nome="medico_id" rotulo="Médico" obrigatorio padrao={a?.medico_id ?? medicoPadrao ?? medicos[0]?.id} opcoes={medicos.map((m) => [m.id, m.nome] as const)} />
        <Campo nome="dia" rotulo="Dia" tipo="date" obrigatorio padrao={inicio ? fmt(inicio, { dateStyle: 'short' }) : dia ?? hojeISO()} />
        <Campo nome="hora" rotulo="Hora" tipo="time" obrigatorio step="300"
          padrao={inicio ? fmt(inicio, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) : '08:00'} />
        <Selecao nome="duracao_min" rotulo="Duração" padrao={String(duracao)}
          opcoes={[15, 30, 45, 60, 90, 120, 180, 240, 360].map((m) => [String(m), m < 60 ? `${m} min` : `${m / 60} h`] as const)} />
      </div>
      <div className="linha-form">
        <Selecao nome="tipo" rotulo="Tipo" padrao={a?.tipo ?? 'consulta'} opcoes={Object.entries(ROTULO_TIPO_AG)} />
        <Campo nome="procedimento" rotulo="Procedimento" padrao={a?.procedimento} />
        <Campo nome="convenio" rotulo="Convênio" padrao={a?.convenio ?? 'Particular'} />
      </div>
      <Marcar nome="primeiro_atendimento" rotulo="Primeira vez do paciente na clínica" padrao={a?.primeiro_atendimento} />
      <Campo nome="observacao" rotulo="Observação" tipo="textarea" padrao={a?.observacao}
        ajuda="Visível para a recepção. Não registre informação clínica aqui." />
      <div className="form-acoes"><Enviar>{a ? 'Salvar alterações' : 'Agendar'}</Enviar></div>
    </Formulario>
  )
}
