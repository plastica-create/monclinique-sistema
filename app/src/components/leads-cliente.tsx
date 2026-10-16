'use client'
import { importarLeads } from '@/actions/leads'
import { Enviar, Formulario, useEstadoForm } from '@/components/form'

function Previa() {
  const e = useEstadoForm()
  const linhas = (e.dados as { nome: string; etapa: string; origem: string | null; valor: number | null }[] | undefined) ?? []
  if (!linhas.length) return null
  return (
    <table className="tabela"><caption>Primeiras linhas</caption>
      <thead><tr><th>Nome</th><th>Etapa</th><th>Origem</th><th className="num">Valor</th></tr></thead>
      <tbody>{linhas.map((l, i) => <tr key={i}><td>{l.nome}</td><td>{l.etapa}</td><td>{l.origem ?? '—'}</td><td className="num">{l.valor ?? '—'}</td></tr>)}</tbody>
    </table>
  )
}

function AreaCsv() {
  const e = useEstadoForm()
  return (
    <div className="campo">
      <label htmlFor="csv">Cole o CSV (cabeçalho com: nome, telefone, email, origem, campanha, etapa, valor, id)</label>
      <textarea id="csv" name="csv" rows={6} defaultValue={e.valores?.csv} key={e.valores?.csv ?? 'vazio'} />
      <input type="file" accept=".csv,text/csv" aria-label="Ou escolha um arquivo CSV" onChange={async (ev) => {
        const f = ev.target.files?.[0]
        if (f) (document.getElementById('csv') as HTMLTextAreaElement).value = await f.text()
      }} />
    </div>
  )
}

export function ImportarLeads() {
  return (
    <Formulario acao={importarLeads}>
      <AreaCsv />
      <Previa />
      <div className="form-acoes">
        <Enviar nome="modo" valor="previa" variante="secundario">Pré-visualizar</Enviar>
        <Enviar nome="modo" valor="gravar">Importar</Enviar>
      </div>
    </Formulario>
  )
}
