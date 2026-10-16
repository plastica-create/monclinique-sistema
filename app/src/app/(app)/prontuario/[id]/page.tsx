import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { editarEvolucao, salvarEvolucao } from '@/actions/prontuario'
import { Campo, Enviar, Formulario, Selecao } from '@/components/form'
import { Cabecalho, Cartao, Etiqueta, Vazio } from '@/components/ui'
import { listarMedicos } from '@/lib/data/comum'
import { dataHora, hojeISO } from '@/lib/format'
import { mensagemErro } from '@/lib/erros'
import { pode } from '@/lib/roles'
import { exigirSessao } from '@/lib/sessao'
import { supabaseServidor } from '@/lib/supabase/server'
import { htmlParaTexto } from '@/lib/texto'
import type { Atendimento } from '@/lib/tipos'

export const metadata = { title: 'Prontuário' }
const POR_PAGINA = 20

export default async function Prontuario({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pagina?: string }> }) {
  const s = await exigirSessao()
  if (!pode.verProntuario(s.papel)) redirect('/inicio?negado=1')
  const { id } = await params
  const pagina = Math.max(1, Number((await searchParams).pagina) || 1)
  const supabase = await supabaseServidor()
  const { data: paciente } = await supabase.from('pacientes').select('id, nome, data_nascimento').eq('id', id).maybeSingle()
  if (!paciente) notFound()

  // Leitura do texto clínico SÓ pela RPC: ela grava a leitura na auditoria.
  const [{ data, error }, medicos] = await Promise.all([
    supabase.rpc('ler_prontuario', { p_paciente_id: id, p_limite: POR_PAGINA + 1, p_offset: (pagina - 1) * POR_PAGINA, p_finalidade: 'tela do prontuário' }),
    listarMedicos(supabase),
  ])
  const erro = error ? mensagemErro(error, 'ler prontuário') : null
  const lista = ((data ?? []) as Atendimento[])
  const temMais = lista.length > POR_PAGINA
  const nomeMedico = new Map(medicos.map((m) => [m.id, m.nome]))
  const meusMedicos = s.papel === 'medico' ? medicos.filter((m) => m.id === s.medicoId) : medicos
  const agora = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Cuiaba', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date())

  return (
    <>
      <Cabecalho titulo="Prontuário" sub={<Link href={`/pacientes/${paciente.id}` as never}>{paciente.nome as string}</Link>} />
      <p className="alerta info">Cada abertura deste prontuário fica registrada na auditoria (quem, quando e para quê).</p>
      {erro && <p className="alerta erro">{erro}</p>}
      <div className="grade-2" style={{ gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)' }}>
        <Cartao titulo="Evoluções">
          {lista.length === 0 ? <Vazio>Nenhuma evolução {s.papel === 'medico' ? 'sua ' : ''}para este paciente.</Vazio> : lista.slice(0, POR_PAGINA).map((a) => {
            const texto = a.texto ?? htmlParaTexto(a.texto_html)
            return (
              <article className="evolucao" key={a.id}>
                <header><b>{a.servico}</b><span>{dataHora(a.inicio)}</span><span>{nomeMedico.get(a.medico_id) ?? ''}</span>
                  {a.tipo_servico && <span>{a.tipo_servico}</span>}
                  {a.legado_cod_repetido && <Etiqueta tom="aviso" >código legado repetido</Etiqueta>}</header>
                <pre>{texto || '(sem texto)'}</pre>
                {(s.papel === 'admin' || a.medico_id === s.medicoId) && (
                  <details><summary className="link-botao">Corrigir texto</summary>
                    <Formulario acao={editarEvolucao}>
                      <input type="hidden" name="id" value={a.id} /><input type="hidden" name="paciente_id" value={id} />
                      <Campo nome="texto" rotulo="Texto" tipo="textarea" padrao={texto} obrigatorio />
                      <Enviar>Salvar correção</Enviar>
                    </Formulario>
                  </details>
                )}
              </article>
            )
          })}
          <div className="form-inline" style={{ marginTop: 16 }}>
            {pagina > 1 && <Link className="botao secundario pequeno" prefetch={false} href={`/prontuario/${id}?pagina=${pagina - 1}` as never}>← Mais recentes</Link>}
            {temMais && <Link className="botao secundario pequeno" prefetch={false} href={`/prontuario/${id}?pagina=${pagina + 1}` as never}>Mais antigas →</Link>}
          </div>
        </Cartao>
        {meusMedicos.length > 0 && (
          <Cartao titulo="Nova evolução">
            <Formulario acao={salvarEvolucao} limparAoSalvar>
              <input type="hidden" name="paciente_id" value={id} />
              <div className="linha-form">
                <Selecao nome="medico_id" rotulo="Médico" padrao={s.medicoId ?? meusMedicos[0]?.id} opcoes={meusMedicos.map((m) => [m.id, m.nome] as const)} />
                <Selecao nome="servico" rotulo="Serviço" opcoes={['Consulta', 'Retorno', 'Procedimento', 'Cirurgia', 'Exame', 'Observação'].map((x) => [x, x] as const)} />
              </div>
              <div className="linha-form">
                <Campo nome="dia" rotulo="Dia" tipo="date" padrao={hojeISO()} obrigatorio />
                <Campo nome="hora" rotulo="Hora" tipo="time" padrao={agora} obrigatorio />
                <Campo nome="tipo_servico" rotulo="Procedimento realizado" />
              </div>
              <div className="campo"><label htmlFor="f-texto">Evolução *</label>
                <textarea id="f-texto" name="texto" className="prontuario" required /></div>
              <div><Enviar>Registrar evolução</Enviar></div>
            </Formulario>
            <p className="nota">Prontuário não pode ser apagado (guarda mínima de 20 anos, Lei 13.787/2018). Correções ficam com a versão anterior na auditoria.</p>
          </Cartao>
        )}
      </div>
    </>
  )
}
