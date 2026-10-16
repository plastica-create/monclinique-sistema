import { ItemAgenda } from '@/components/agenda'
import type { Agendamento } from '@/lib/tipos'

export function AgendamentoLista({ lista, comData, podeEditar }: { lista: Agendamento[]; comData: boolean; podeEditar: boolean }) {
  return <div className="agenda-dia">{lista.map((a) => <ItemAgenda key={a.id} a={a} comData={comData} podeEditar={podeEditar} />)}</div>
}
