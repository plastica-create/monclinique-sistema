import { expect, it } from 'vitest'
import { htmlParaTexto } from './texto'

it('converte HTML legado em texto sem tags', () => {
  expect(htmlParaTexto('<p>Paciente <b>bem</b></p><p>Retorno&nbsp;30d</p><script>x()</script>')).toBe('Paciente bem\nRetorno 30d')
  expect(htmlParaTexto(null)).toBe('')
})
