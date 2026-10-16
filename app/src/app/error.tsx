'use client'

export default function Erro({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="principal">
      <h1>Algo deu errado</h1>
      <p>Não foi possível carregar esta tela. Tente de novo; se continuar, avise a administração.</p>
      <button className="botao primario" onClick={reset}>Tentar de novo</button>
    </main>
  )
}
