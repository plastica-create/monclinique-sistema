import { moverLead, salvarLead } from '@/actions/leads'
import { Campo, Enviar, Formulario, Selecao } from '@/components/form'
import { ImportarLeads } from '@/components/leads-cliente'
import { Abas, Cabecalho, Cartao, Etiqueta, Kpi, Vazio } from '@/components/ui'
import { data, moeda, moedaCurta, numero, telefone } from '@/lib/format'
import { exigirSessao } from '@/lib/sessao'
import { supabaseServidor } from '@/lib/supabase/server'
import { ROTULO_STATUS_LEAD, type Lead } from '@/lib/tipos'

export const metadata = { title: 'Leads' }

export default async function Leads({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await exigirSessao('leads')
  const sp = await searchParams
  const status = sp.status === 'ganho' || sp.status === 'perdido' ? sp.status : 'aberto'
  const supabase = await supabaseServidor()
  const [{ data: lista }, { data: todos }] = await Promise.all([
    supabase.from('leads').select('id, crm_id_externo, nome, telefone, email, origem, campanha, etapa, status, valor, responsavel_nome, paciente_id, data_entrada, data_ultima_interacao, motivo_perda, observacao')
      .eq('status', status).order('data_entrada', { ascending: false, nullsFirst: false }).limit(500),
    supabase.from('leads').select('etapa, status, valor'),
  ])
  const leads = (lista ?? []) as Lead[]
  const abertos = (todos ?? []).filter((l) => l.status === 'aberto')
  const etapas = [...new Set(abertos.map((l) => String(l.etapa)))]
  const ganhos = (todos ?? []).filter((l) => l.status === 'ganho').length
  const fechados = (todos ?? []).filter((l) => l.status !== 'aberto').length
  return (
    <>
      <Cabecalho titulo="Leads" sub="Contato e interesse apenas: nunca registre dado clínico aqui (LGPD art. 11, §4º)." />
      <div className="kpis">
        <Kpi rotulo="Leads em aberto" valor={numero(abertos.length)} detalhe={moedaCurta(abertos.reduce((t, l) => t + Number(l.valor ?? 0), 0))} />
        <Kpi rotulo="Conversão" valor={fechados ? `${Math.round((100 * ganhos) / fechados)}%` : '—'} detalhe={`${ganhos} ganhos de ${fechados} fechados`} />
        {etapas.slice(0, 3).map((e) => <Kpi key={e} rotulo={`Etapa: ${e}`} valor={numero(abertos.filter((l) => l.etapa === e).length)} />)}
      </div>
      <Abas atual={status} itens={(['aberto', 'ganho', 'perdido'] as const).map((s) => ({ chave: s, rotulo: ROTULO_STATUS_LEAD[s], href: `/leads?status=${s}` }))} />
      <div className="pilha">
        <Cartao>
          {leads.length === 0 ? <Vazio>Nenhum lead.</Vazio> : (
            <div className="tabela-envolve">
              <table className="tabela"><caption className="so-leitor">Leads</caption>
                <thead><tr><th>Nome</th><th>Contato</th><th>Origem</th><th>Etapa</th><th className="num">Valor</th><th>Entrada</th>{status === 'aberto' && <th>Mover</th>}</tr></thead>
                <tbody>{leads.map((l) => (
                  <tr key={l.id}>
                    <td>{l.nome}{l.paciente_id && <> <Etiqueta tom="ok">paciente</Etiqueta></>}</td>
                    <td>{telefone(l.telefone)}<br /><small>{l.email}</small></td>
                    <td>{l.origem ?? '—'}{l.campanha && <><br /><small>{l.campanha}</small></>}</td>
                    <td>{l.etapa}{l.motivo_perda && <><br /><small>{l.motivo_perda}</small></>}</td>
                    <td className="num">{moeda(l.valor)}</td>
                    <td>{data(l.data_entrada)}</td>
                    {status === 'aberto' && <td>
                      <details><summary className="link-botao">mover</summary>
                        <Formulario acao={moverLead}>
                          <input type="hidden" name="id" value={l.id} />
                          <Campo nome="etapa" rotulo="Etapa" padrao={l.etapa} />
                          <Selecao nome="status" rotulo="Situação" opcoes={Object.entries(ROTULO_STATUS_LEAD)} padrao="aberto" />
                          <Campo nome="motivo_perda" rotulo="Motivo (se perdido)" />
                          <Enviar>Salvar</Enviar>
                        </Formulario>
                      </details></td>}
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </Cartao>
        <div className="grade-2">
          <Cartao titulo="Novo lead">
            <Formulario acao={salvarLead} limparAoSalvar>
              <div className="linha-form">
                <Campo nome="nome" rotulo="Nome" obrigatorio />
                <Campo nome="telefone" rotulo="Telefone" tipo="tel" />
                <Campo nome="email" rotulo="E-mail" tipo="email" />
              </div>
              <div className="linha-form">
                <Campo nome="origem" rotulo="Origem" />
                <Campo nome="campanha" rotulo="Campanha" />
                <Campo nome="etapa" rotulo="Etapa" padrao="Novo" obrigatorio />
                <Campo nome="valor" rotulo="Valor estimado (R$)" inputMode="decimal" />
              </div>
              <div><Enviar>Criar lead</Enviar></div>
            </Formulario>
          </Cartao>
          <Cartao titulo="Importar CSV">
            <ImportarLeads />
            <p className="nota">Linhas com ID do CRM atualizam o lead existente; sem ID, criam novo.</p>
          </Cartao>
        </div>
      </div>
    </>
  )
}
