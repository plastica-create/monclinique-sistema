'use client'
import Link from 'next/link'
import { useState, useTransition } from 'react'
import { buscarPacientes } from '@/actions/pacientes'
import { data, telefoneMascarado } from '@/lib/format'
import type { PacienteResumo } from '@/lib/tipos'

export function TabelaPacientes({ lista, legenda }: { lista: PacienteResumo[]; legenda: string }) {
  if (lista.length === 0) return <p className="vazio">Nenhum paciente encontrado.</p>
  return (
    <div className="tabela-envolve">
      <table className="tabela">
        <caption className="so-leitor">{legenda}</caption>
        <thead><tr><th>Nome</th><th>Nascimento</th><th>Celular</th><th>Origem</th><th>Último atendimento</th></tr></thead>
        <tbody>
          {lista.map((p) => (
            <tr key={p.id}>
              <td><Link href={`/pacientes/${p.id}` as never} prefetch={false}>{p.nome}</Link>{!p.ativo && <> <span className="etiqueta">arquivado</span></>}</td>
              <td>{data(p.data_nascimento)}</td>
              <td>{telefoneMascarado(p.celular)}</td>
              <td>{p.origem ?? <span className="etiqueta aviso">não informado</span>}</td>
              <td>{data(p.ultima_visita_atendimento)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Busca por POST (Server Action): o nome digitado não vai para a URL. */
export function BuscaPacientes({ iniciais }: { iniciais: PacienteResumo[] }) {
  const [termo, setTermo] = useState('')
  const [resultado, setResultado] = useState<PacienteResumo[] | null>(null)
  const [pendente, iniciar] = useTransition()
  return (
    <>
      <form className="form-inline" role="search" onSubmit={(e) => {
        e.preventDefault()
        iniciar(async () => setResultado(termo.trim().length >= 2 ? await buscarPacientes(termo) : null))
      }}>
        <div className="campo" style={{ flex: '1 1 320px' }}>
          <label htmlFor="busca">Buscar por nome ou telefone</label>
          <input id="busca" type="search" value={termo} onChange={(e) => setTermo(e.target.value)} autoComplete="off" placeholder="Ex.: Maria Silva ou 9 9123" />
        </div>
        <button className="botao primario" type="submit" disabled={pendente}>{pendente ? 'Buscando…' : 'Buscar'}</button>
        {resultado && <button className="botao secundario" type="button" onClick={() => { setResultado(null); setTermo('') }}>Limpar</button>}
      </form>
      <div style={{ marginTop: 14 }} aria-live="polite">
        {resultado ? (
          <><p className="nota">{resultado.length} resultado(s)</p><TabelaPacientes lista={resultado} legenda="Resultado da busca" /></>
        ) : (
          <><p className="nota">Cadastros mais recentes</p><TabelaPacientes lista={iniciais} legenda="Cadastros mais recentes" /></>
        )}
      </div>
    </>
  )
}
