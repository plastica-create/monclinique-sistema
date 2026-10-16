import { registrarConsentimento, revogarConsentimento } from '@/actions/prontuario'
import { Campo, Enviar, Formulario, Selecao } from '@/components/form'
import { Etiqueta } from '@/components/ui'
import { dataHora } from '@/lib/format'
import { ROTULO_CANAL, ROTULO_CONSENT, type Consentimento } from '@/lib/tipos'

export function Consentimentos({ pacienteId, lista, podeEditar }: { pacienteId: string; lista: Consentimento[]; podeEditar: boolean }) {
  return (
    <div className="pilha">
      {lista.length === 0 ? <p className="vazio">Nenhum consentimento registrado.</p> : (
        <div className="tabela-envolve">
          <table className="tabela">
            <caption className="so-leitor">Consentimentos</caption>
            <thead><tr><th>Tipo</th><th>Situação</th><th>Termo</th><th>Canal</th><th>Quando</th>{podeEditar && <th />}</tr></thead>
            <tbody>
              {lista.map((c) => (
                <tr key={c.id}>
                  <td>{ROTULO_CONSENT[c.tipo]}</td>
                  <td>{c.revogado_em ? <Etiqueta tom="erro">revogado</Etiqueta> : c.aceito ? <Etiqueta tom="ok">vigente</Etiqueta> : <Etiqueta tom="aviso">recusou</Etiqueta>}</td>
                  <td>{c.versao_termo}</td>
                  <td>{ROTULO_CANAL[c.canal]}</td>
                  <td>{dataHora(c.aceito_em)}{c.revogado_em && <><br /><small>revogado {dataHora(c.revogado_em)}</small></>}</td>
                  {podeEditar && (
                    <td>{!c.revogado_em && c.aceito && (
                      <details><summary className="link-botao">Revogar</summary>
                        <Formulario acao={revogarConsentimento}>
                          <input type="hidden" name="id" value={c.id} /><input type="hidden" name="paciente_id" value={pacienteId} />
                          <Campo nome="motivo" rotulo="Motivo" obrigatorio />
                          <Enviar variante="perigo">Confirmar revogação</Enviar>
                        </Formulario>
                      </details>)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {podeEditar && (
        <details className="dobra"><summary>Registrar consentimento ou recusa</summary>
          <Formulario acao={registrarConsentimento} limparAoSalvar>
            <input type="hidden" name="paciente_id" value={pacienteId} />
            <div className="linha-form">
              <Selecao nome="tipo" rotulo="Tipo" obrigatorio opcoes={Object.entries(ROTULO_CONSENT)} />
              <Selecao nome="aceito" rotulo="Resposta" opcoes={[['sim', 'Aceitou'], ['nao', 'Recusou']]} />
              <Selecao nome="canal" rotulo="Canal" opcoes={Object.entries(ROTULO_CANAL)} />
              <Campo nome="versao_termo" rotulo="Versão do termo" obrigatorio placeholder="ex.: tcle-imagem-2026-10-v1" />
            </div>
            <Campo nome="observacao" rotulo="Observação" />
            <div><Enviar>Registrar</Enviar></div>
          </Formulario>
        </details>
      )}
    </div>
  )
}
