import { expect, type Page } from '@playwright/test'
import crypto from 'node:crypto'

export const SENHA = 'SenhaTeste#2026'

export async function entrar(page: Page, usuario: string, senha = SENHA, esperar = senha === SENHA) {
  await page.goto('/login')
  await page.getByLabel('E-mail').fill(`${usuario}@teste.local`)
  await page.getByLabel('Senha').fill(senha)
  await page.getByRole('button', { name: 'Entrar' }).click()
  if (esperar) await page.waitForURL((u) => !u.pathname.startsWith('/login'))
}

export async function sair(page: Page) {
  await page.getByRole('button', { name: 'Sair' }).first().click()
  await expect(page).toHaveURL(/\/login/)
}

/** Falha o teste se a página logar erro no console ou lançar exceção (inclui violação de CSP). */
export function vigiarErros(page: Page) {
  const erros: string[] = []
  page.on('pageerror', (e) => erros.push(`pageerror: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error') erros.push(`console: ${m.text()}`) })
  return erros
}

/** TOTP (RFC 6238) a partir do segredo base32, para testar o MFA. */
export function totp(segredo: string, agora = Date.now()) {
  const alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const c of segredo.replace(/=+$/, '').toUpperCase()) bits += alfabeto.indexOf(c).toString(2).padStart(5, '0')
  const chave = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)))
  const contador = Buffer.alloc(8)
  contador.writeBigUInt64BE(BigInt(Math.floor(agora / 1000 / 30)))
  const h = crypto.createHmac('sha1', chave).update(contador).digest()
  const o = h[h.length - 1]! & 0xf
  const n = ((h[o]! & 0x7f) << 24) | (h[o + 1]! << 16) | (h[o + 2]! << 8) | h[o + 3]!
  return String(n % 1_000_000).padStart(6, '0')
}
