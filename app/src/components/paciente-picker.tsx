'use client'
import { useState, useTransition } from 'react'
import { buscarPacientes } from '@/actions/pacientes'
import { useEstadoForm } from '@/components/form'
import { data } from '@/lib/format'

/** Escolha de paciente por busca (POST). Grava o id num input escondido "paciente_id". */
export function EscolherPaciente({ inicial, obrigatorio = true }: { inicial?: { id: string; nome: string } | null; obrigatorio?: boolean }) {
  const estado = useEstadoForm()
  const [escolhido, setEscolhido] = useState(inicial ?? null)
  const [termo, setTermo] = useState('')
  const [lista, setLista] = useState<{ id: string; nome: string; data_nascimento: string | null }[]>([])
  const [pendente, iniciar] = useTransition()
  const erro = estado.campos?.paciente_id
  const idValor = escolhido?.id ?? estado.valores?.paciente_id ?? ''
  return (
    <div className="campo">
      <label htmlFor="busca-paciente">Paciente{obrigatorio && <span aria-hidden="true"> *</span>}</label>
      <input type="hidden" name="paciente_id" value={idValor} />
      {escolhido ? (
        <div className="form-inline"><b>{escolhido.nome}</b>
          <button type="button" className="link-botao" onClick={() => { setEscolhido(null); setLista([]) }}>trocar</button></div>
      ) : (
        <>
          <div className="form-inline">
            <input id="busca-paciente" value={termo} onChange={(e) => setTermo(e.target.value)} placeholder="Nome ou telefone" autoComplete="off"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); iniciar(async () => setLista(await buscarPacientes(termo))) } }}
              aria-invalid={!!erro} style={{ flex: 1 }} />
            <button type="button" className="botao secundario" disabled={pendente}
              onClick={() => iniciar(async () => setLista(await buscarPacientes(termo)))}>{pendente ? '…' : 'Buscar'}</button>
          </div>
          {lista.length > 0 && (
            <ul className="lista-escolha" role="listbox" aria-label="Pacientes encontrados">
              {lista.map((p) => (
                <li key={p.id}><button type="button" className="link-botao" onClick={() => setEscolhido({ id: p.id, nome: p.nome })}>
                  {p.nome}</button> <small>{data(p.data_nascimento)}</small></li>
              ))}
            </ul>
          )}
        </>
      )}
      {erro && <small className="erro-campo">{erro}</small>}
    </div>
  )
}
