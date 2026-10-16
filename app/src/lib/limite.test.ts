import { expect, it } from 'vitest'
import { bloqueado, limparFalhas, registrarFalha } from './limite'

it('bloqueia depois de 5 falhas e libera após a janela', () => {
  const t0 = 1_000_000
  for (let i = 0; i < 5; i++) registrarFalha('x', t0 + i)
  expect(bloqueado('x', t0 + 10)).toBe(true)
  expect(bloqueado('x', t0 + 16 * 60 * 1000)).toBe(false)
  limparFalhas('x')
})
