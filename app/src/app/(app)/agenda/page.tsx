import Link from 'next/link'
import { AgendamentoLista } from './lista'
import { Abas, Botao, Cabecalho, Cartao, Vazio } from '@/components/ui'
import { doDia, semBaixa } from '@/lib/data/agenda'
import { listarMedicos } from '@/lib/data/comum'
import { diaPorExtenso, hojeISO, somarDias } from '@/lib/format'
import { pode } from '@/lib/roles'
import { exigirSessao } from '@/lib/sessao'
import { supabaseServidor } from '@/lib/supabase/server'

export const metadata = { title: 'Agenda' }

export default async function Agenda({ searchParams }: { searchParams: Promise<{ dia?: string; medico?: string; visao?: string }> }) {
  const s = await exigirSessao('agenda')
  const sp = await searchParams
  const dia = sp.dia && /^\d{4}-\d{2}-\d{2}$/.test(sp.dia) ? sp.dia : hojeISO()
  const supabase = await supabaseServidor()
  const medicos = await listarMedicos(supabase)
  const medico = medicos.find((m) => m.id === sp.medico)?.id ?? null
  const pendentes = sp.visao === 'pendentes'
  const lista = pendentes ? await semBaixa(supabase) : await doDia(supabase, dia, medico)
  const q = (extra: Record<string, string | undefined>) => {
    const u = new URLSearchParams()
    for (const [k, v] of Object.entries({ dia, medico: medico ?? undefined, ...extra })) if (v) u.set(k, v)
    return `/agenda?${u.toString()}`
  }
  const editar = pode.agendar(s.papel)
  return (
    <>
      <Cabecalho titulo="Agenda" sub={pendentes ? 'Agendamentos que já passaram e estão sem desfecho' : diaPorExtenso(dia)}
        acoes={editar && <Botao href={`/agenda/novo?dia=${dia}`}>Novo agendamento</Botao>} />
      <Abas atual={pendentes ? 'p' : 'd'} itens={[{ chave: 'd', rotulo: 'Dia', href: q({ visao: undefined }) }, { chave: 'p', rotulo: 'Sem baixa', href: '/agenda?visao=pendentes' }]} />
      {!pendentes && (
        <div className="form-inline" style={{ marginBottom: 14 }}>
          <Link className="botao secundario pequeno" href={q({ dia: somarDias(dia, -1) }) as never}>← Anterior</Link>
          <Link className="botao secundario pequeno" href={q({ dia: hojeISO() }) as never}>Hoje</Link>
          <Link className="botao secundario pequeno" href={q({ dia: somarDias(dia, 1) }) as never}>Próximo →</Link>
          <form className="form-inline" action="/agenda">
            <input type="date" name="dia" defaultValue={dia} aria-label="Ir para o dia" className="botao secundario pequeno" />
            {s.papel !== 'medico' && medicos.length > 1 && (
              <select name="medico" defaultValue={medico ?? ''} aria-label="Médico" className="botao secundario pequeno">
                <option value="">Todos os médicos</option>
                {medicos.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </select>
            )}
            <button className="botao secundario pequeno" type="submit">Ir</button>
          </form>
        </div>
      )}
      <Cartao>
        {lista.length === 0 ? <Vazio>{pendentes ? 'Nenhum agendamento pendente de baixa. 👏' : 'Nenhum agendamento neste dia.'}</Vazio>
          : <AgendamentoLista lista={lista} comData={pendentes} podeEditar={editar} />}
      </Cartao>
    </>
  )
}
