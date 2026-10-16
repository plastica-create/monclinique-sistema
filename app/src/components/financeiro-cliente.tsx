'use client'
import { useState } from 'react'
import { registrarCopiaCobranca } from '@/actions/financeiro'

/** Copia uma mensagem de cobrança educada (não envia nada; quem cobra é a equipe). */
export function CopiarCobranca({ nome, valor, vencimento }: { nome: string; valor: string; vencimento: string }) {
  const [ok, setOk] = useState(false)
  const texto = `Olá, ${nome.split(' ')[0]}! Tudo bem? Aqui é da Mon Clinique. Consta em aberto uma parcela de ${valor} com vencimento em ${vencimento}. ` +
    'Se já pagou, por favor desconsidere. Qualquer dúvida, estamos à disposição.'
  return (
    <button type="button" className="link-botao" onClick={async () => {
      await navigator.clipboard.writeText(texto)
      await registrarCopiaCobranca(1)
      setOk(true)
      setTimeout(() => setOk(false), 2500)
    }}>{ok ? 'Copiado ✓' : 'Copiar mensagem'}</button>
  )
}
