'use client'
import { createContext, useActionState, useContext, useEffect, useRef, type ReactNode } from 'react'
import { useFormStatus } from 'react-dom'
import type { EstadoAcao } from '@/lib/acao'

type Acao = (estado: EstadoAcao, fd: FormData) => Promise<EstadoAcao>
const Ctx = createContext<EstadoAcao>({})

/** Formulário ligado a uma Server Action, com erros por campo e mensagem geral. */
export function Formulario({ acao, children, className, limparAoSalvar, aoSalvar }: {
  acao: Acao; children: ReactNode; className?: string; limparAoSalvar?: boolean; aoSalvar?: () => void
}) {
  const [estado, despachar] = useActionState(acao, {})
  const ref = useRef<HTMLFormElement>(null)
  useEffect(() => {
    if (estado.ok) {
      if (limparAoSalvar) ref.current?.reset()
      aoSalvar?.()
    }
  }, [estado, limparAoSalvar, aoSalvar])
  return (
    <Ctx.Provider value={estado}>
      <form ref={ref} action={despachar} className={className ?? 'form'} noValidate>
        {estado.erro && <p className="alerta erro" role="alert">{estado.erro}</p>}
        {estado.aviso && <p className="alerta aviso" role="alert">{estado.aviso}</p>}
        {estado.ok && estado.mensagem && <p className="alerta ok" role="status">{estado.mensagem}</p>}
        {children}
      </form>
    </Ctx.Provider>
  )
}

export function useEstadoForm() {
  return useContext(Ctx)
}

type CampoProps = {
  nome: string; rotulo: string; tipo?: string; padrao?: string | number | null; obrigatorio?: boolean
  ajuda?: string; placeholder?: string; autoComplete?: string; className?: string; min?: string; max?: string; step?: string
  inputMode?: 'numeric' | 'decimal' | 'tel' | 'email' | 'text'
}

export function Campo({ nome, rotulo, tipo = 'text', padrao, obrigatorio, ajuda, className, ...resto }: CampoProps) {
  const e = useEstadoForm()
  const erro = e.campos?.[nome]
  const valor = e.valores?.[nome] ?? (padrao == null ? undefined : String(padrao))
  const id = `f-${nome}`
  return (
    <div className={`campo ${className ?? ''}`}>
      <label htmlFor={id}>{rotulo}{obrigatorio && <span aria-hidden="true"> *</span>}</label>
      {tipo === 'textarea' ? (
        <textarea id={id} name={nome} defaultValue={valor} required={obrigatorio} aria-invalid={!!erro}
          aria-describedby={erro ? `${id}-erro` : ajuda ? `${id}-ajuda` : undefined} rows={4} placeholder={resto.placeholder} />
      ) : (
        <input id={id} name={nome} type={tipo} defaultValue={valor} required={obrigatorio} aria-invalid={!!erro}
          aria-describedby={erro ? `${id}-erro` : ajuda ? `${id}-ajuda` : undefined} {...resto} />
      )}
      {ajuda && !erro && <small id={`${id}-ajuda`}>{ajuda}</small>}
      {erro && <small id={`${id}-erro`} className="erro-campo">{erro}</small>}
    </div>
  )
}

export function Selecao({ nome, rotulo, opcoes, padrao, obrigatorio, vazio, className }: {
  nome: string; rotulo: string; opcoes: readonly (readonly [string, string])[]; padrao?: string | null
  obrigatorio?: boolean; vazio?: string; className?: string
}) {
  const e = useEstadoForm()
  const erro = e.campos?.[nome]
  const id = `f-${nome}`
  return (
    <div className={`campo ${className ?? ''}`}>
      <label htmlFor={id}>{rotulo}{obrigatorio && <span aria-hidden="true"> *</span>}</label>
      <select id={id} name={nome} defaultValue={e.valores?.[nome] ?? padrao ?? ''} required={obrigatorio} aria-invalid={!!erro}
        aria-describedby={erro ? `${id}-erro` : undefined}>
        {vazio !== undefined && <option value="">{vazio}</option>}
        {opcoes.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
      </select>
      {erro && <small id={`${id}-erro`} className="erro-campo">{erro}</small>}
    </div>
  )
}

export function Marcar({ nome, rotulo, padrao }: { nome: string; rotulo: string; padrao?: boolean }) {
  return (
    <label className="marcar">
      <input type="checkbox" name={nome} defaultChecked={padrao} /> {rotulo}
    </label>
  )
}

export function Enviar({ children, variante = 'primario', nome, valor }: {
  children: ReactNode; variante?: 'primario' | 'secundario' | 'perigo'; nome?: string; valor?: string
}) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className={`botao ${variante}`} disabled={pending} aria-busy={pending} name={nome} value={valor}>
      {pending ? 'Salvando…' : children}
    </button>
  )
}
