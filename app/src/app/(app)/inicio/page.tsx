import { Barras, BarrasHorizontais } from '@/components/graficos'
import { Cabecalho, Cartao, Kpi, Vazio } from '@/components/ui'
import { carregarPainel } from '@/lib/data/painel'
import { data, mesCurto, moeda, moedaCurta, numero, pct } from '@/lib/format'
import { exigirSessao } from '@/lib/sessao'
import { supabaseServidor } from '@/lib/supabase/server'

export const metadata = { title: 'Início' }

export default async function Inicio({ searchParams }: { searchParams: Promise<{ negado?: string }> }) {
  const s = await exigirSessao('inicio')
  const { negado } = await searchParams
  const p = await carregarPainel(await supabaseServidor())

  const ult = p.receita.at(-1)
  const ant = p.receita.at(-2)
  const recebida12 = p.receita.reduce((t, m) => t + m.recebida, 0)
  const atrasado = p.receber.filter((r) => r.situacao === 'atrasado')
  const valorAtrasado = atrasado.reduce((t, r) => t + r.valor, 0)
  const atrasado1ano = atrasado.filter((r) => r.ordem === 4).reduce((t, r) => t + r.valor, 0)
  const abertoTotal = p.aging.reduce((t, f) => t + f.valor, 0)
  const pipeline = p.aging.filter((f) => f.ordem <= 3)
  const pipelineValor = pipeline.reduce((t, f) => t + f.valor, 0)
  const pipelineQtd = pipeline.reduce((t, f) => t + f.qtd, 0)
  const agenda3m = p.agenda.slice(-3)
  const tot3 = agenda3m.reduce((t, m) => t + m.total, 0)
  const fin3 = agenda3m.reduce((t, m) => t + m.finalizados, 0)
  const canc3 = agenda3m.reduce((t, m) => t + m.cancelados, 0)
  const semBaixa = p.agenda.reduce((t, m) => t + m.semBaixa, 0)
  const reativaveis = p.recencia.filter((r) => r.reativavel).reduce((t, r) => t + r.qtd, 0)
  const totalPac = p.origem.reduce((t, o) => t + o.total, 0)
  const naoInformado = p.origem.find((o) => o.origem === 'Não informado')?.total ?? 0
  const conversao = p.funil.emitidos ? (100 * p.funil.ganhos) / p.funil.emitidos : null
  const variacao = ult && ant && ant.recebida ? (100 * (ult.recebida - ant.recebida)) / ant.recebida : null

  return (
    <>
      <Cabecalho titulo={`Olá, ${s.nome.split(' ')[0]}`} sub={`Números até ${data(p.hoje)} · só agregados, sem dado de paciente`} />
      {negado && <p className="alerta aviso">Seu perfil não tem acesso àquela área.</p>}

      <div className="kpis">
        {p.temFinanceiro && (
          <>
            <Kpi rotulo="Recebido no mês" valor={moeda(ult?.recebida ?? 0)} href="/inicio#receita"
              detalhe={variacao == null ? 'líquido de taxas' : `${variacao >= 0 ? '+' : ''}${pct(variacao)} vs. mês anterior`} />
            <Kpi rotulo="Recebido em 12 meses" valor={moedaCurta(recebida12)} href="/inicio#receita" />
            <Kpi rotulo="A receber vencido" valor={moeda(valorAtrasado)} tom={valorAtrasado > 0 ? 'erro' : 'ok'} href="/financeiro?visao=vencidos"
              detalhe={atrasado1ano ? `${moedaCurta(atrasado1ano)} há mais de 1 ano` : undefined} />
          </>
        )}
        {p.temOrcamentos && (
          <>
            <Kpi rotulo="Pipeline real (≤ 180 dias)" valor={moedaCurta(pipelineValor)} href="/orcamentos?faixa=recentes"
              detalhe={`${numero(pipelineQtd)} orçamentos · de ${moedaCurta(abertoTotal)} em aberto`} />
            <Kpi rotulo="Conversão (12 meses)" valor={pct(conversao)} href="/inicio#orcamentos"
              detalhe={`${numero(p.funil.ganhos)} ganhos de ${numero(p.funil.emitidos)} emitidos`} />
          </>
        )}
        {p.temAgenda && (
          <>
            <Kpi rotulo="Comparecimento (3 meses)" valor={pct(tot3 ? (100 * fin3) / tot3 : null)} href="/inicio#agenda"
              detalhe={`${numero(canc3)} cancelamentos`} />
            <Kpi rotulo="Agenda sem baixa" valor={numero(semBaixa)} tom={semBaixa > 0 ? 'aviso' : 'ok'} href="/agenda?visao=pendentes"
              detalhe="passou e ninguém registrou o desfecho" />
          </>
        )}
        {totalPac > 0 && (
          <>
            <Kpi rotulo="Pacientes para reativar" valor={numero(reativaveis)} href="/inicio#recencia" detalhe="6 a 24 meses sem voltar" />
            <Kpi rotulo="Origem não informada" valor={pct(totalPac ? (100 * naoInformado) / totalPac : null)} tom="aviso" href="/inicio#origem"
              detalhe={`${numero(naoInformado)} de ${numero(totalPac)} cadastros`} />
          </>
        )}
      </div>

      <div className="grade-2">
        {p.temFinanceiro && (
          <Cartao titulo="Receita recebida x despesa paga" className="ancora">
            <div id="receita" />
            <Barras titulo="Receita e despesa por mês" rotulos={p.receita.map((m) => mesCurto(m.mes))} formatar={moedaCurta}
              series={[{ nome: 'Recebido', valores: p.receita.map((m) => m.recebida), classe: 's1' },
                       { nome: 'Despesa', valores: p.receita.map((m) => m.despesa), classe: 's2' }]} />
            <p className="nota">Despesa vem do que for lançado aqui. No Gestão DS as despesas pararam em set/25.</p>
          </Cartao>
        )}
        {p.temAgenda && (
          <Cartao titulo="Agenda por mês">
            <div id="agenda" />
            <Barras titulo="Agendamentos por desfecho" rotulos={p.agenda.map((m) => mesCurto(m.mes))} formatar={(v) => numero(Math.round(v))}
              series={[{ nome: 'Compareceu', valores: p.agenda.map((m) => m.finalizados), classe: 's1' },
                       { nome: 'Cancelou', valores: p.agenda.map((m) => m.cancelados), classe: 's2' },
                       { nome: 'Faltou', valores: p.agenda.map((m) => m.faltas), classe: 's4' },
                       { nome: 'Sem baixa', valores: p.agenda.map((m) => m.semBaixa), classe: 's3' }]} />
          </Cartao>
        )}
        {p.temOrcamentos && (
          <Cartao titulo="Orçamentos em aberto por idade">
            <div id="orcamentos" />
            <BarrasHorizontais titulo="Valor em aberto por faixa de idade" formatar={moedaCurta}
              itens={p.aging.map((f) => ({ rotulo: f.faixa, valor: f.valor, detalhe: `(${numero(f.qtd)})`, classe: f.ordem <= 3 ? 's1' : 's3' }))} />
            <p className="nota">Mais de 180 dias quase nunca fecha: dê baixa como perda para a conversão ficar real.
              Temperatura do pipeline: quente {moedaCurta(p.temperatura.quente)}, morno {moedaCurta(p.temperatura.morno)}, frio {moedaCurta(p.temperatura.frio)}.</p>
          </Cartao>
        )}
        {p.receber.length > 0 && (
          <Cartao titulo="A receber">
            <BarrasHorizontais titulo="A receber por atraso" formatar={moedaCurta}
              itens={p.receber.map((r) => ({ rotulo: r.faixa, valor: r.valor, detalhe: `(${numero(r.qtd)})`, classe: r.situacao === 'a_vencer' ? 's1' : 's4' }))} />
          </Cartao>
        )}
        {p.origem.length > 0 && (
          <Cartao titulo="De onde vêm os pacientes">
            <div id="origem" />
            <BarrasHorizontais titulo="Pacientes por origem" formatar={numero}
              itens={p.origem.slice(0, 8).map((o) => ({ rotulo: o.origem, valor: o.total, detalhe: `${pct(o.pct)}`, classe: o.origem === 'Não informado' ? 's3' : 's1' }))} />
            <p className="nota">A origem agora é obrigatória no cadastro, para este número melhorar.</p>
          </Cartao>
        )}
        {p.recencia.length > 0 && (
          <Cartao titulo="Tempo desde o último atendimento">
            <div id="recencia" />
            <BarrasHorizontais titulo="Pacientes por recência" formatar={numero}
              itens={p.recencia.map((r) => ({ rotulo: r.faixa, valor: r.qtd, classe: r.reativavel ? 's2' : 's1' }))} />
            <p className="nota">Em dourado: 6 a 24 meses sem voltar, bons alvos para reativação.</p>
          </Cartao>
        )}
      </div>
      {!p.temFinanceiro && !p.temOrcamentos && !p.temAgenda && p.origem.length === 0 && <Vazio>Ainda não há dados para o seu perfil.</Vazio>}
    </>
  )
}
