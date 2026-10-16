import Link from 'next/link'
import { marcarPago, salvarConciliacao } from '@/actions/financeiro'
import { CopiarCobranca } from '@/components/financeiro-cliente'
import { Campo, Enviar, Formulario } from '@/components/form'
import { Abas, Botao, Cabecalho, Cartao, Etiqueta, Kpi, Vazio } from '@/components/ui'
import { doMes, vencidos } from '@/lib/data/financeiro'
import { inicioMes } from '@/lib/data/painel'
import { data, hojeISO, mesCurto, moeda, numero } from '@/lib/format'
import { exigirSessao } from '@/lib/sessao'
import { supabaseServidor } from '@/lib/supabase/server'

export const metadata = { title: 'Financeiro' }

export default async function Financeiro({ searchParams }: { searchParams: Promise<{ mes?: string; visao?: string; tipo?: string }> }) {
  await exigirSessao('financeiro')
  const sp = await searchParams
  const hoje = hojeISO()
  const mes = sp.mes && /^\d{4}-\d{2}$/.test(sp.mes) ? sp.mes : hoje.slice(0, 7)
  const visao = sp.visao === 'vencidos' || sp.visao === 'conciliacao' ? sp.visao : 'mes'
  const tipo = sp.tipo === 'receita' || sp.tipo === 'despesa' ? sp.tipo : undefined
  const supabase = await supabaseServidor()
  const mesAnt = inicioMes(1, `${mes}-15`).slice(0, 7)
  const mesProx = inicioMes(-1, `${mes}-15`).slice(0, 7)

  return (
    <>
      <Cabecalho titulo="Financeiro" acoes={<Botao href="/financeiro/novo">Novo lançamento</Botao>} />
      <Abas atual={visao} itens={[
        { chave: 'mes', rotulo: 'Lançamentos do mês', href: `/financeiro?mes=${mes}` },
        { chave: 'vencidos', rotulo: 'A receber vencido', href: '/financeiro?visao=vencidos' },
        { chave: 'conciliacao', rotulo: 'Conciliação contábil', href: '/financeiro?visao=conciliacao' },
      ]} />
      {visao === 'mes' && <Mes mes={mes} tipo={tipo} ant={mesAnt} prox={mesProx} supabase={supabase} hoje={hoje} />}
      {visao === 'vencidos' && <Vencidos supabase={supabase} hoje={hoje} />}
      {visao === 'conciliacao' && <Conciliacao supabase={supabase} hoje={hoje} />}
    </>
  )
}

type P = { supabase: Awaited<ReturnType<typeof supabaseServidor>>; hoje: string }

async function Mes({ mes, tipo, ant, prox, supabase, hoje }: P & { mes: string; tipo?: 'receita' | 'despesa'; ant: string; prox: string }) {
  const lista = await doMes(supabase, mes, tipo)
  const soma = (f: (l: (typeof lista)[number]) => boolean, campo: 'valor' | 'valor_liquido' = 'valor_liquido') =>
    lista.filter(f).reduce((t, l) => t + Number(l[campo]), 0)
  const recebido = soma((l) => l.tipo === 'receita' && l.pago)
  const despesa = soma((l) => l.tipo === 'despesa' && l.pago)
  const aberto = soma((l) => l.tipo === 'receita' && !l.pago, 'valor')
  const taxas = soma((l) => l.tipo === 'receita' && l.pago, 'valor') - recebido
  const base = `/financeiro?mes=${mes}`
  return (
    <>
      <div className="form-inline" style={{ marginBottom: 14 }}>
        <Link className="botao secundario pequeno" href={`/financeiro?mes=${ant}` as never}>← {mesCurto(`${ant}-01`)}</Link>
        <b style={{ padding: '0 8px' }}>{mesCurto(`${mes}-01`)}</b>
        <Link className="botao secundario pequeno" href={`/financeiro?mes=${prox}` as never}>{mesCurto(`${prox}-01`)} →</Link>
        <Abas atual={tipo ?? 't'} itens={[{ chave: 't', rotulo: 'Tudo', href: base }, { chave: 'receita', rotulo: 'Receitas', href: `${base}&tipo=receita` },
          { chave: 'despesa', rotulo: 'Despesas', href: `${base}&tipo=despesa` }]} />
      </div>
      <div className="kpis">
        <Kpi rotulo="Recebido (líquido)" valor={moeda(recebido)} />
        <Kpi rotulo="Taxas de cartão" valor={moeda(taxas)} />
        <Kpi rotulo="Despesas pagas" valor={moeda(despesa)} />
        <Kpi rotulo="Resultado de caixa" valor={moeda(recebido - despesa)} tom={recebido - despesa >= 0 ? 'ok' : 'erro'} />
        <Kpi rotulo="A receber no mês" valor={moeda(aberto)} tom={aberto > 0 ? 'aviso' : undefined} />
      </div>
      <Cartao>
        {lista.length === 0 ? <Vazio>Nenhum lançamento neste mês.</Vazio> : (
          <div className="tabela-envolve">
            <table className="tabela"><caption className="so-leitor">Lançamentos</caption>
              <thead><tr><th>Data</th><th>Descrição</th><th>Paciente / prestador</th><th>Categoria</th><th>Forma</th><th className="num">Bruto</th><th className="num">Líquido</th><th>Situação</th></tr></thead>
              <tbody>{lista.map((l) => (
                <tr key={l.id}>
                  <td>{data(l.data_pagamento)}</td>
                  <td>{l.descricao ?? '—'}{l.data_anomala && <> <Etiqueta tom="aviso">data suspeita</Etiqueta></>}</td>
                  <td>{l.paciente_id ? <Link href={`/pacientes/${l.paciente_id}` as never} prefetch={false}>{l.paciente?.nome}</Link> : l.prestador ?? l.paciente_nome_original ?? '—'}</td>
                  <td>{l.categoria?.nome ?? '—'}</td>
                  <td>{l.forma_pagamento ?? '—'}</td>
                  <td className="num">{l.tipo === 'despesa' ? '−' : ''}{moeda(l.valor)}</td>
                  <td className="num">{moeda(l.valor_liquido)}</td>
                  <td>{l.pago ? <Etiqueta tom="ok">pago</Etiqueta> : (
                    <Formulario acao={marcarPago} className="form-inline">
                      <input type="hidden" name="id" value={l.id} />
                      <Etiqueta tom={l.data_pagamento < hoje ? 'erro' : 'aviso'}>{l.data_pagamento < hoje ? 'vencido' : 'a vencer'}</Etiqueta>
                      <Enviar variante="secundario">Baixar</Enviar>
                    </Formulario>)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Cartao>
    </>
  )
}

async function Vencidos({ supabase, hoje }: P) {
  const lista = await vencidos(supabase)
  const total = lista.reduce((t, l) => t + Number(l.valor), 0)
  const dias = (d: string) => Math.round((Date.parse(hoje) - Date.parse(d)) / 86_400_000)
  return (
    <>
      <div className="kpis">
        <Kpi rotulo="Total vencido" valor={moeda(total)} tom="erro" detalhe={`${numero(lista.length)} parcela(s)`} />
        <Kpi rotulo="Há mais de 1 ano" valor={moeda(lista.filter((l) => dias(l.data_pagamento) > 365).reduce((t, l) => t + Number(l.valor), 0))}
          detalhe="avaliar se ainda é cobrável" />
      </div>
      <Cartao>
        {lista.length === 0 ? <Vazio>Nada vencido. 👏</Vazio> : (
          <div className="tabela-envolve">
            <table className="tabela"><caption className="so-leitor">Receitas vencidas</caption>
              <thead><tr><th>Vencimento</th><th>Atraso</th><th>Paciente</th><th>Descrição</th><th className="num">Valor</th><th /></tr></thead>
              <tbody>{lista.map((l) => (
                <tr key={l.id}>
                  <td>{data(l.data_pagamento)}</td><td>{numero(dias(l.data_pagamento))} dias</td>
                  <td>{l.paciente_id ? <Link href={`/pacientes/${l.paciente_id}` as never} prefetch={false}>{l.paciente?.nome}</Link> : l.paciente_nome_original ?? '—'}</td>
                  <td>{l.descricao ?? '—'}</td><td className="num">{moeda(l.valor)}</td>
                  <td>{(l.paciente?.nome ?? l.paciente_nome_original) && <CopiarCobranca nome={l.paciente?.nome ?? l.paciente_nome_original ?? ''} valor={moeda(l.valor)} vencimento={data(l.data_pagamento)} />}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        <p className="nota">Copiar a mensagem não envia nada: cole no WhatsApp da clínica. Cada cópia fica registrada na auditoria.</p>
      </Cartao>
    </>
  )
}

async function Conciliacao({ supabase, hoje }: P) {
  const desde = inicioMes(11, hoje)
  const [{ data: sistema }, { data: conc, error }] = await Promise.all([
    supabase.from('vw_receita_mensal').select('mes, receita_recebida, receita_bruta_recebida').gte('mes', desde).order('mes', { ascending: false }),
    supabase.from('conciliacao_mensal').select('mes, contabilidade, conta_azul, observacao').gte('mes', desde),
  ])
  const porMes = new Map((conc ?? []).map((c) => [String(c.mes), c]))
  const meses = Array.from({ length: 12 }, (_, i) => inicioMes(i, hoje))
  const sis = new Map((sistema ?? []).map((r) => [String(r.mes), r]))
  return (
    <Cartao titulo="Recebido no sistema x contabilidade x Conta Azul">
      {error && <p className="alerta aviso">A tabela de conciliação ainda não existe no banco (aplicar db/005_app.sql). Mostrando só o sistema.</p>}
      <div className="tabela-envolve">
        <table className="tabela"><caption className="so-leitor">Conciliação</caption>
          <thead><tr><th>Mês</th><th className="num">Sistema (bruto)</th><th className="num">Contabilidade</th><th className="num">Conta Azul</th><th className="num">Diferença</th>{!error && <th>Atualizar</th>}</tr></thead>
          <tbody>{meses.map((m) => {
            const s = Number(sis.get(m)?.receita_bruta_recebida ?? 0)
            const c = porMes.get(m)
            const dif = c?.contabilidade != null ? s - Number(c.contabilidade) : null
            return (
              <tr key={m}>
                <td>{mesCurto(m)}</td><td className="num">{moeda(s)}</td>
                <td className="num">{c?.contabilidade != null ? moeda(c.contabilidade) : '—'}</td>
                <td className="num">{c?.conta_azul != null ? moeda(c.conta_azul) : '—'}</td>
                <td className="num">{dif == null ? '—' : <Etiqueta tom={Math.abs(dif) < 1 ? 'ok' : 'aviso'}>{moeda(dif)}</Etiqueta>}</td>
                {!error && <td>
                  <details><summary className="link-botao">editar</summary>
                    <Formulario acao={salvarConciliacao}>
                      <input type="hidden" name="mes" value={m.slice(0, 7)} />
                      <Campo nome="contabilidade" rotulo="Contabilidade (R$)" inputMode="decimal" padrao={c?.contabilidade != null ? String(c.contabilidade).replace('.', ',') : ''} />
                      <Campo nome="conta_azul" rotulo="Conta Azul (R$)" inputMode="decimal" padrao={c?.conta_azul != null ? String(c.conta_azul).replace('.', ',') : ''} />
                      <Enviar>Salvar</Enviar>
                    </Formulario>
                  </details></td>}
              </tr>
            )
          })}</tbody>
        </table>
      </div>
    </Cartao>
  )
}
