import Link from 'next/link'
import { notFound } from 'next/navigation'
import { adicionarItem, marcarGanho, marcarPerda, reabrir, registrarContato, removerItem } from '@/actions/orcamentos'
import { Campo, Enviar, Formulario, Selecao } from '@/components/form'
import { Botao, Cabecalho, Cartao, Etiqueta, Vazio } from '@/components/ui'
import { listarCatalogo } from '@/lib/data/comum'
import { obter } from '@/lib/data/orcamentos'
import { data, hojeISO, moeda } from '@/lib/format'
import { pode } from '@/lib/roles'
import { exigirSessao } from '@/lib/sessao'
import { supabaseServidor } from '@/lib/supabase/server'
import { MOTIVOS_PERDA, ROTULO_STATUS_ORC, ROTULO_TEMP, ROTULO_TIPO_ORC } from '@/lib/tipos'

export const metadata = { title: 'Orçamento' }

export default async function OrcamentoPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await exigirSessao('orcamentos')
  const { id } = await params
  const supabase = await supabaseServidor()
  const r = await obter(supabase, id)
  if (!r) notFound()
  const { orcamento: o, itens } = r
  const editar = pode.editarOrcamento(s.papel)
  const catalogo = editar ? await listarCatalogo(supabase) : []
  const hoje = hojeISO()
  return (
    <>
      <Cabecalho titulo={o.titulo ?? 'Orçamento'}
        sub={<><Link href={`/pacientes/${o.paciente_id}` as never}>{o.paciente?.nome}</Link> · {ROTULO_TIPO_ORC[o.tipo_orcamento]}{o.numero && ` · nº ${o.numero}`}</>}
        acoes={editar && <Botao href={`/orcamentos/${o.id}/editar`} variante="secundario">Editar</Botao>} />
      <div className="grade-2">
        <Cartao titulo="Resumo">
          <dl className="dados">
            <div><dt>Status</dt><dd><Etiqueta tom={o.status === 'ganho' ? 'ok' : o.status === 'perda' ? 'erro' : 'ouro'}>{ROTULO_STATUS_ORC[o.status]}</Etiqueta>
              {o.situacao && <> <Etiqueta>{ROTULO_TEMP[o.situacao]}</Etiqueta></>}</dd></div>
            <div><dt>Emissão</dt><dd>{data(o.data_emissao)}</dd></div>
            <div><dt>Validade</dt><dd>{data(o.valido_ate)}{o.status === 'em_aberto' && o.valido_ate && o.valido_ate < hoje && <> <Etiqueta tom="erro">vencido</Etiqueta></>}</dd></div>
            <div><dt>Bruto</dt><dd>{moeda(o.valor_bruto)}</dd></div>
            <div><dt>Com desconto</dt><dd>{moeda(o.valor_liquido)}</dd></div>
            <div><dt>Orçado por</dt><dd>{o.orcado_por_nome ?? '—'}</dd></div>
            {o.data_ganho && <div><dt>Ganho em</dt><dd>{data(o.data_ganho)}</dd></div>}
            {o.data_perda && <div><dt>Perdido em</dt><dd>{data(o.data_perda)} · {o.motivo_perda}</dd></div>}
          </dl>
          {o.observacao && <pre className="nota" style={{ whiteSpace: 'pre-wrap', font: 'inherit' }}>{o.observacao}</pre>}
        </Cartao>

        {editar && (
          <Cartao titulo="Andamento">
            {o.status === 'em_aberto' ? (
              <div className="pilha">
                <Formulario acao={registrarContato} limparAoSalvar>
                  <input type="hidden" name="id" value={o.id} />
                  <div className="linha-form">
                    <Campo nome="nota" rotulo="Contato feito" obrigatorio placeholder="ex.: ligou, pediu para retornar em 15 dias" />
                    <Selecao nome="situacao" rotulo="Temperatura" vazio="manter" opcoes={Object.entries(ROTULO_TEMP)} />
                  </div>
                  <div><Enviar variante="secundario">Registrar contato</Enviar></div>
                </Formulario>
                <Formulario acao={marcarGanho} className="form-inline">
                  <input type="hidden" name="id" value={o.id} />
                  <Campo nome="data_ganho" rotulo="Data do fechamento" tipo="date" padrao={hoje} />
                  <Enviar>Marcar como ganho</Enviar>
                </Formulario>
                <Formulario acao={marcarPerda}>
                  <input type="hidden" name="id" value={o.id} />
                  <div className="linha-form">
                    <Selecao nome="motivo" rotulo="Motivo da perda" obrigatorio vazio="Escolha…" opcoes={MOTIVOS_PERDA.map((m) => [m, m] as const)} />
                    <Campo nome="detalhe" rotulo="Detalhe" />
                  </div>
                  <div><Enviar variante="perigo">Registrar perda</Enviar></div>
                </Formulario>
              </div>
            ) : (
              <Formulario acao={reabrir}><input type="hidden" name="id" value={o.id} /><div><Enviar variante="secundario">Reabrir orçamento</Enviar></div></Formulario>
            )}
          </Cartao>
        )}

        <Cartao titulo="Itens">
          {itens.length === 0 ? <Vazio>Sem itens: vale o valor do resumo.</Vazio> : (
            <table className="tabela"><caption className="so-leitor">Itens</caption>
              <thead><tr><th>Descrição</th><th className="num">Qtd</th><th className="num">Unitário</th><th className="num">Desconto</th><th className="num">Total</th>{editar && <th />}</tr></thead>
              <tbody>{itens.map((i) => (
                <tr key={i.id}><td>{i.descricao}</td><td className="num">{i.quantidade}</td><td className="num">{moeda(i.valor_unitario)}</td>
                  <td className="num">{moeda(i.desconto)}</td><td className="num">{moeda(i.valor_total)}</td>
                  {editar && <td><Formulario acao={removerItem} className="form-inline"><input type="hidden" name="id" value={i.id} />
                    <input type="hidden" name="orcamento_id" value={o.id} /><Enviar variante="secundario">Remover</Enviar></Formulario></td>}</tr>
              ))}</tbody></table>)}
          {editar && (
            <details className="dobra" style={{ marginTop: 12 }}><summary>Adicionar item</summary>
              <Formulario acao={adicionarItem} limparAoSalvar>
                <input type="hidden" name="orcamento_id" value={o.id} />
                <div className="linha-form">
                  <Selecao nome="catalogo_id" rotulo="Do catálogo" vazio="(item livre)" opcoes={catalogo.map((c) => [c.id, `${c.descricao}${c.valor ? ` · ${moeda(c.valor)}` : ''}`] as const)} />
                  <Campo nome="descricao" rotulo="Descrição" obrigatorio />
                </div>
                <div className="linha-form">
                  <Campo nome="quantidade" rotulo="Quantidade" padrao="1" inputMode="decimal" />
                  <Campo nome="valor_unitario" rotulo="Valor unitário (R$)" inputMode="decimal" obrigatorio />
                  <Campo nome="desconto" rotulo="Desconto (R$)" inputMode="decimal" padrao="0" />
                </div>
                <div><Enviar>Adicionar</Enviar></div>
              </Formulario>
            </details>
          )}
        </Cartao>
      </div>
    </>
  )
}
