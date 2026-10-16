'use client'
import { useEffect, useRef, useState, useTransition } from 'react'
import { revelarDocumento } from '@/actions/pacientes'
import { abrirAnexo, prepararEnvioAnexo, registrarAnexo } from '@/actions/prontuario'
import { cpfMascarado } from '@/lib/format'
import type { ClasseAnexo } from '@/lib/tipos'

/** CPF/RG mascarados; "Revelar" grava auditoria no servidor antes de devolver e some em 30 s. */
export function RevelarDocumento({ pacienteId }: { pacienteId: string }) {
  const [doc, setDoc] = useState<{ cpf?: string; rg?: string; erro?: string } | null>(null)
  const [pendente, iniciar] = useTransition()
  useEffect(() => {
    if (!doc?.cpf) return
    const t = setTimeout(() => setDoc(null), 30_000)
    return () => clearTimeout(t)
  }, [doc])
  return (
    <div>
      <dl className="dados">
        <div><dt>CPF</dt><dd data-testid="cpf">{doc?.cpf ?? cpfMascarado}</dd></div>
        <div><dt>RG</dt><dd>{doc?.rg ?? '••••••'}</dd></div>
      </dl>
      {doc?.erro && <p className="alerta erro">{doc.erro}</p>}
      {doc?.cpf ? (
        <button className="botao secundario pequeno" onClick={() => setDoc(null)}>Ocultar</button>
      ) : (
        <button className="botao secundario pequeno" disabled={pendente}
          onClick={() => iniciar(async () => setDoc(await revelarDocumento(pacienteId)))}>
          {pendente ? 'Abrindo…' : 'Revelar (fica registrado)'}
        </button>
      )}
    </div>
  )
}

export function EnvioAnexo({ pacienteId, classes }: { pacienteId: string; classes: [ClasseAnexo, string][] }) {
  const [msg, setMsg] = useState<{ tom: 'ok' | 'erro'; texto: string } | null>(null)
  const [pendente, iniciar] = useTransition()
  const form = useRef<HTMLFormElement>(null)
  return (
    <form ref={form} className="form" onSubmit={(e) => {
      e.preventDefault()
      const fd = new FormData(e.currentTarget)
      const arquivo = fd.get('arquivo') as File | null
      if (!arquivo || arquivo.size === 0) return setMsg({ tom: 'erro', texto: 'Escolha um arquivo.' })
      const base = { paciente_id: pacienteId, classe: String(fd.get('classe')) as ClasseAnexo, nome: arquivo.name, mime: arquivo.type as never, tamanho: arquivo.size }
      iniciar(async () => {
        const prep = await prepararEnvioAnexo(base)
        if ('erro' in prep) return setMsg({ tom: 'erro', texto: prep.erro ?? 'Erro.' })
        const r = await fetch(prep.url, { method: 'PUT', headers: { 'content-type': arquivo.type }, body: arquivo })
        if (!r.ok) return setMsg({ tom: 'erro', texto: 'Falha no envio do arquivo.' })
        const reg = await registrarAnexo({ ...base, caminho: prep.caminho, tipo_documento: String(fd.get('tipo_documento') ?? ''),
          data_documento: String(fd.get('data_documento') ?? '') })
        if (reg.erro) return setMsg({ tom: 'erro', texto: reg.erro })
        form.current?.reset()
        setMsg({ tom: 'ok', texto: 'Anexo enviado.' })
      })
    }}>
      {msg && <p className={`alerta ${msg.tom}`}>{msg.texto}</p>}
      <div className="linha-form">
        <div className="campo"><label htmlFor="arquivo">Arquivo (até 50 MB)</label><input id="arquivo" name="arquivo" type="file" required
          accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.doc,.docx,.mp3,.m4a,.wav,.webm,.ogg,.mp4" /></div>
        <div className="campo"><label htmlFor="classe">Tipo de acesso</label>
          <select id="classe" name="classe">{classes.map(([v, r]) => <option key={v} value={v}>{r}</option>)}</select></div>
        <div className="campo"><label htmlFor="tipo_documento">Documento</label>
          <select id="tipo_documento" name="tipo_documento">
            {['exame', 'foto', 'termo', 'receita', 'laudo', 'audio_plaud', 'contrato', 'comprovante', 'outro'].map((t) => <option key={t}>{t}</option>)}
          </select></div>
        <div className="campo"><label htmlFor="data_documento">Data do documento</label><input id="data_documento" name="data_documento" type="date" /></div>
      </div>
      <div><button className="botao primario" type="submit" disabled={pendente}>{pendente ? 'Enviando…' : 'Enviar anexo'}</button></div>
    </form>
  )
}

export function AbrirAnexo({ id, disponivel }: { id: string; disponivel: boolean }) {
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()
  if (!disponivel) return <span className="etiqueta" title="Arquivo do Gestão DS ainda não migrado">legado</span>
  return (
    <>
      <button className="link-botao" disabled={pendente} onClick={() => iniciar(async () => {
        const r = await abrirAnexo(id)
        if (r.url) window.open(r.url, '_blank', 'noopener,noreferrer')
        else setErro(r.erro ?? 'Erro.')
      })}>{pendente ? 'Abrindo…' : 'Abrir'}</button>
      {erro && <small className="erro-campo"> {erro}</small>}
    </>
  )
}
