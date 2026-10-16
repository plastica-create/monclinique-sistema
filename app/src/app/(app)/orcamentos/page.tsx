import Link from 'next/link'
import { Abas, Botao, Cabecalho, Cartao, Etiqueta, Vazio } from '@/components/ui'
import { listar, POR_PAGINA } from '@/lib/data/orcamentos'
import { data, hojeISO, moeda, numero } from '@/lib/format'
import { pode } from '@/lib/roles'
import { exigirSessao } from '@/lib/sessao'
import { supabaseServidor } from '@/lib/supabase/server'
import { ROTULO_STATUS_ORC, ROTULO_TEMP, type StatusOrcamento } from '@/lib/tipos'

export const metadata = { title: 'Orçamentos' }

export default async function Orcamentos({ searchParams }: { searchParams: Promise<{ status?: string; faixa?: string; situacao?: string; pagina?: string }> }) {
  const s = await exigirSessao('orcamentos')
  const sp = await searchParams
  const status = (['em_aberto', 'ganho', 'perda'] as const).find((x) => x === sp.status)
  const faixa = sp.faixa === 'recentes' || sp.faixa === 'antigos' ? sp.faixa : undefined
  const filtroStatus: StatusOrcamento | undefined = faixa ? 'em_aberto' : status
  const { lista, total, pagina } = await listar(await supabaseServidor(), { status: filtroStatus, faixa, situacao: sp.situacao, pagina: Number(sp.pagina) || 1 })
  const chave = faixa ?? status ?? 'todos'
  const hoje = hojeISO()
  const link = (pg: number) => {
    const u = new URLSearchParams(Object.entries({ status: sp.status, faixa, situacao: sp.situacao, pagina: String(pg) }).filter(([, v]) => v) as [string, string][])
    return `/orcamentos?${u}`
  }
  return (
    <>
      <Cabecalho titulo="Orçamentos" sub={`${numero(total)} orçamento(s)`} acoes={pode.editarOrcamento(s.papel) && <Botao href="/orcamentos/novo">Novo orçamento</Botao>} />
      <Abas atual={chave} itens={[
        { chave: 'todos', rotulo: 'Todos', href: '/orcamentos' },
        { chave: 'recentes', rotulo: 'Pipeline (≤ 180 dias)', href: '/orcamentos?faixa=recentes' },
        { chave: 'antigos', rotulo: 'Em aberto antigos (dar baixa)', href: '/orcamentos?faixa=antigos' },
        { chave: 'ganho', rotulo: 'Ganhos', href: '/orcamentos?status=ganho' },
        { chave: 'perda', rotulo: 'Perdas', href: '/orcamentos?status=perda' },
      ]} />
      <Cartao>
        {lista.length === 0 ? <Vazio>Nenhum orçamento neste filtro.</Vazio> : (
          <div className="tabela-envolve">
            <table className="tabela">
              <caption className="so-leitor">Orçamentos</caption>
              <thead><tr><th>Paciente</th><th>Título</th><th>Emissão</th><th>Validade</th><th>Status</th><th className="num">Líquido</th></tr></thead>
              <tbody>
                {lista.map((o) => (
                  <tr key={o.id}>
                    <td><Link href={`/orcamentos/${o.id}` as never} prefetch={false}>{o.paciente?.nome ?? '—'}</Link></td>
                    <td>{o.titulo ?? o.numero ?? '—'}</td>
                    <td>{data(o.data_emissao)}</td>
                    <td>{o.status === 'em_aberto' && o.valido_ate && o.valido_ate < hoje ? <Etiqueta tom="erro">vencido {data(o.valido_ate)}</Etiqueta> : data(o.valido_ate)}</td>
                    <td><Etiqueta tom={o.status === 'ganho' ? 'ok' : o.status === 'perda' ? 'erro' : 'ouro'}>{ROTULO_STATUS_ORC[o.status]}</Etiqueta>
                      {o.situacao && <> <Etiqueta tom={o.situacao === 'quente' ? 'erro' : o.situacao === 'morno' ? 'aviso' : 'info'}>{ROTULO_TEMP[o.situacao]}</Etiqueta></>}</td>
                    <td className="num">{moeda(o.valor_liquido)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {total > POR_PAGINA && (
          <div className="form-inline" style={{ marginTop: 12 }}>
            {pagina > 1 && <Link className="botao secundario pequeno" href={link(pagina - 1) as never}>← Anterior</Link>}
            <span className="nota">Página {pagina} de {Math.ceil(total / POR_PAGINA)}</span>
            {pagina * POR_PAGINA < total && <Link className="botao secundario pequeno" href={link(pagina + 1) as never}>Próxima →</Link>}
          </div>
        )}
      </Cartao>
    </>
  )
}
