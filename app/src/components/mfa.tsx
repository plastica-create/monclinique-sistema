'use client'
import { useState, useTransition } from 'react'
import { iniciarCadastroMfa, verificarMfa } from '@/actions/auth'
import { Campo, Enviar, Formulario } from '@/components/form'

export function VerificarMfa({ factorId }: { factorId: string }) {
  return (
    <Formulario acao={verificarMfa}>
      <input type="hidden" name="factorId" value={factorId} />
      <Campo nome="codigo" rotulo="Código" inputMode="numeric" autoComplete="one-time-code" obrigatorio />
      <Enviar>Verificar</Enviar>
    </Formulario>
  )
}

type Dados = { factorId: string; qr: string; segredo: string }

export function CadastroMfa() {
  const [dados, setDados] = useState<Dados | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()
  if (!dados) {
    return (
      <div className="form">
        {erro && <p className="alerta erro">{erro}</p>}
        <button className="botao primario" disabled={pendente} onClick={() => iniciar(async () => {
          const r = await iniciarCadastroMfa()
          if (r.ok) setDados(r.dados as Dados)
          else setErro(r.erro ?? 'Erro.')
        })}>{pendente ? 'Gerando…' : 'Gerar QR code'}</button>
      </div>
    )
  }
  return (
    <div className="form">
      {/* o QR vem do Supabase como SVG em data: URL */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="qr" src={dados.qr} alt="QR code para o aplicativo autenticador" />
      <p className="nota">Sem câmera? Digite este código no aplicativo:</p>
      <code className="segredo" data-testid="segredo-totp">{dados.segredo}</code>
      <VerificarMfa factorId={dados.factorId} />
    </div>
  )
}
