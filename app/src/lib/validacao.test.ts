import { describe, expect, it } from 'vitest'
import { cpfValido, normalizar, termoBusca, valorReais } from './validacao'

describe('cpfValido', () => {
  it('aceita CPF válido com ou sem máscara', () => {
    expect(cpfValido('529.982.247-25')).toBe(true)
    expect(cpfValido('52998224725')).toBe(true)
  })
  it('recusa dígito errado, repetidos e tamanho errado', () => {
    expect(cpfValido('52998224724')).toBe(false)
    expect(cpfValido('11111111111')).toBe(false)
    expect(cpfValido('123')).toBe(false)
  })
})

describe('normalizar', () => {
  it('tira acento e padroniza', () => expect(normalizar('  José   da  Conceição ')).toBe('JOSE DA CONCEICAO'))
})

describe('valorReais', () => {
  it('entende formato brasileiro', () => {
    expect(valorReais('1.234,56')).toBe(1234.56)
    expect(valorReais('R$ 10')).toBe(10)
    expect(valorReais('99.5')).toBe(99.5)
    expect(valorReais('3.000')).toBe(3000)
    expect(valorReais('1.234.567')).toBe(1234567)
  })
  it('vazio ou inválido vira null', () => {
    expect(valorReais('')).toBeNull()
    expect(valorReais('abc')).toBeNull()
  })
})

describe('termoBusca', () => {
  it('remove caracteres que mudam o filtro do PostgREST', () => expect(termoBusca('ana%,(x)')).toBe('ana x'))
})
