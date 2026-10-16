// Gráficos em SVG puro (sem biblioteca, sem requisição externa). Cada gráfico traz a tabela
// equivalente para leitores de tela.
type Serie = { nome: string; valores: number[]; classe: string }

export function Barras({ titulo, rotulos, series, formatar, altura = 220 }: {
  titulo: string; rotulos: string[]; series: Serie[]; formatar: (v: number) => string; altura?: number
}) {
  const largura = 640
  const margem = { t: 12, d: 8, b: 28, e: 56 }
  const max = Math.max(1, ...series.flatMap((s) => s.valores))
  const passo = (largura - margem.e - margem.d) / Math.max(1, rotulos.length)
  const larguraBarra = Math.max(3, (passo * 0.72) / series.length)
  const y = (v: number) => altura - margem.b - (v / max) * (altura - margem.t - margem.b)
  const marcas = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max)
  return (
    <figure className="grafico">
      <svg viewBox={`0 0 ${largura} ${altura}`} role="img" aria-label={titulo}>
        {marcas.map((m) => (
          <g key={m}>
            <line x1={margem.e} x2={largura - margem.d} y1={y(m)} y2={y(m)} className="grade" />
            <text x={margem.e - 6} y={y(m) + 4} textAnchor="end" className="eixo">{formatar(m)}</text>
          </g>
        ))}
        {rotulos.map((r, i) => (
          <g key={r + i}>
            {series.map((s, j) => {
              const v = s.valores[i] ?? 0
              const x = margem.e + i * passo + (passo - larguraBarra * series.length) / 2 + j * larguraBarra
              return (
                <rect key={s.nome} x={x} y={y(v)} width={larguraBarra - 1} height={Math.max(0, altura - margem.b - y(v))}
                  className={s.classe} rx={2}>
                  <title>{`${s.nome} ${r}: ${formatar(v)}`}</title>
                </rect>
              )
            })}
            {(rotulos.length <= 12 || i % 2 === 0) && (
              <text x={margem.e + i * passo + passo / 2} y={altura - 8} textAnchor="middle" className="eixo">{r}</text>
            )}
          </g>
        ))}
      </svg>
      {series.length > 1 && (
        <figcaption className="legenda">
          {series.map((s) => <span key={s.nome}><i className={s.classe} />{s.nome}</span>)}
        </figcaption>
      )}
      <table className="so-leitor">
        <caption>{titulo}</caption>
        <thead><tr><th>Período</th>{series.map((s) => <th key={s.nome}>{s.nome}</th>)}</tr></thead>
        <tbody>
          {rotulos.map((r, i) => (
            <tr key={r + i}><th>{r}</th>{series.map((s) => <td key={s.nome}>{formatar(s.valores[i] ?? 0)}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}

/** Lista de barras horizontais (categorias). */
export function BarrasHorizontais({ titulo, itens, formatar }: {
  titulo: string; itens: { rotulo: string; valor: number; detalhe?: string; classe?: string }[]; formatar: (v: number) => string
}) {
  const max = Math.max(1, ...itens.map((i) => i.valor))
  return (
    <ul className="barras-h" aria-label={titulo}>
      {itens.map((i) => (
        <li key={i.rotulo}>
          <span className="bh-rotulo">{i.rotulo}</span>
          <span className="bh-trilho" aria-hidden="true">
            <span className={`bh-barra ${i.classe ?? 's1'}`} style={{ width: `${(i.valor / max) * 100}%` }} />
          </span>
          <span className="bh-valor">{formatar(i.valor)}{i.detalhe && <small> {i.detalhe}</small>}</span>
        </li>
      ))}
    </ul>
  )
}
