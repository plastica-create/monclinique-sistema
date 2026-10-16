import { expect, it } from 'vitest'
import { comCabecalho, lerCsv } from './csv'

it('lê CSV com aspas e ponto e vírgula', () => {
  const l = lerCsv('Nome;Telefone;Etapa\n"Silva; Ana";65999990000;Novo\r\nJoão;;"Proposta ""A"""\n')
  expect(l).toEqual([['Nome', 'Telefone', 'Etapa'], ['Silva; Ana', '65999990000', 'Novo'], ['João', '', 'Proposta "A"']])
  expect(comCabecalho(l)[0]).toEqual({ nome: 'Silva; Ana', telefone: '65999990000', etapa: 'Novo' })
})
