import Link from 'next/link'
import { notFound } from 'next/navigation'
import { arquivarPaciente } from '@/actions/pacientes'
import { Consentimentos } from '@/components/consentimentos'
import { Enviar, Formulario } from '@/components/form'
import { AbrirAnexo, EnvioAnexo, RevelarDocumento } from '@/components/paciente-cliente'
import { Botao, Cabecalho, Cartao, Etiqueta, Vazio } from '@/components/ui'
import * as agenda from '@/lib/data/agenda'
import * as fin from '@/lib/data/financeiro'
import * as orc from '@/lib/data/orcamentos'
import { documentosExistem, obter } from '@/lib/data/pacientes'
import { data, dataHora, idade, moeda, telefone } from '@/lib/format'
import { pode } from '@/lib/roles'
import { exigirSessao } from '@/lib/sessao'
import { supabaseServidor } from '@/lib/supabase/server'
import { ROTULO_CLASSE, ROTULO_STATUS_AG, ROTULO_STATUS_ORC, ROTULO_TIPO_AG, type Anexo, type ClasseAnexo, type Consentimento } from '@/lib/tipos'

export const metadata = { title: 'Paciente' }

const CLASSES_POR_PAPEL: Record<string, ClasseAnexo[]> = {
  admin: ['clinico', 'administrativo', 'financeiro'], medico: ['clinico', 'administrativo'],
  comercial: ['administrativo'], recepcao: ['administrativo'], financeiro: ['financeiro'],
}

export default async function PacientePage({ params }: { params: Promise<{ id: string }> }) {
  const s = await exigirSessao('pacientes')
  const { id } = await params
  const supabase = await supabaseServidor()
  const p = await obter(supabase, id)
  if (!p) notFound()

  const [docVisivel, ags, orcs, lancs, { data: consent }, { data: anexos }, { data: medico }] = await Promise.all([
    pode.verDocumentos(s.papel) ? documentosExistem(supabase, id) : Promise.resolve(false),
    pode.agendar(s.papel) ? agenda.doPaciente(supabase, id, 10) : Promise.resolve([]),
    pode.verModulo(s.papel, 'orcamentos') ? orc.doPaciente(supabase, id) : Promise.resolve([]),
    pode.editarFinanceiro(s.papel) ? fin.doPaciente(supabase, id) : Promise.resolve([]),
    pode.consentimentos(s.papel)
      ? supabase.from('consentimentos').select('id, paciente_id, tipo, versao_termo, aceito, aceito_em, canal, revogado_em, motivo_revogacao, observacao').eq('paciente_id', id).order('aceito_em', { ascending: false })
      : Promise.resolve({ data: [] }),
    supabase.from('anexos').select('id, paciente_id, classe, tipo_documento, nome_arquivo, storage_path, mime_type, tamanho_bytes, data_documento, arquivo_disponivel, created_at')
      .eq('paciente_id', id).order('created_at', { ascending: false }).limit(200),
    p.medico_responsavel_id ? supabase.from('medicos').select('nome').eq('id', p.medico_responsavel_id).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const anos = idade(p.data_nascimento)
  const aReceber = lancs.filter((l) => l.tipo === 'receita' && !l.pago).reduce((t, l) => t + Number(l.valor), 0)
  const classes = (CLASSES_POR_PAPEL[s.papel] ?? []).map((c) => [c, ROTULO_CLASSE[c]] as [ClasseAnexo, string])

  return (
    <>
      <Cabecalho titulo={p.nome}
        sub={<>{anos != null && `${anos} anos · `}{p.origem ?? 'origem não informada'}{!p.ativo && <> · <Etiqueta>arquivado</Etiqueta></>}</>}
        acoes={<>
          {pode.verProntuario(s.papel) && <Botao href={`/prontuario/${p.id}`}>Prontuário</Botao>}
          {pode.agendar(s.papel) && <Botao href={`/agenda/novo?paciente=${p.id}`} variante="secundario">Agendar</Botao>}
          {pode.editarOrcamento(s.papel) && <Botao href={`/orcamentos/novo?paciente=${p.id}`} variante="secundario">Orçamento</Botao>}
          {pode.cadastrarPaciente(s.papel) && <Botao href={`/pacientes/${p.id}/editar`} variante="secundario">Editar</Botao>}
        </>} />

      <div className="grade-2">
        <Cartao titulo="Cadastro">
          <dl className="dados">
            <div><dt>Nascimento</dt><dd>{data(p.data_nascimento)}</dd></div>
            <div><dt>Celular</dt><dd>{telefone(p.celular)}</dd></div>
            <div><dt>Telefone</dt><dd>{telefone(p.telefone)}</dd></div>
            <div><dt>E-mail</dt><dd>{p.email ?? '—'}</dd></div>
            <div><dt>Cidade</dt><dd>{[p.cidade, p.uf].filter(Boolean).join(' / ') || '—'}</dd></div>
            <div><dt>Médico responsável</dt><dd>{(medico as { nome?: string } | null)?.nome ?? '—'}</dd></div>
            <div><dt>Indicação</dt><dd>{p.indicacao_original ?? '—'}</dd></div>
            <div><dt>Cadastrado em</dt><dd>{data(p.data_cadastro)}</dd></div>
            <div><dt>Último atendimento</dt><dd>{data(p.ultima_visita_atendimento)}</dd></div>
            {p.cod_legado_gestaods && <div><dt>Código Gestão DS</dt><dd>{p.cod_legado_gestaods}</dd></div>}
          </dl>
          {p.observacao && <p className="nota"><b>Observação:</b> {p.observacao}</p>}
          {pode.cadastrarPaciente(s.papel) && (
            <Formulario acao={arquivarPaciente} className="form-inline">
              <input type="hidden" name="id" value={p.id} /><input type="hidden" name="ativo" value={String(!p.ativo)} />
              <Enviar variante="secundario">{p.ativo ? 'Arquivar cadastro' : 'Reativar cadastro'}</Enviar>
            </Formulario>
          )}
        </Cartao>

        <Cartao titulo="Documentos">
          {docVisivel ? <RevelarDocumento pacienteId={p.id} /> : pode.verDocumentos(s.papel)
            ? <Vazio>Sem CPF/RG cadastrado.</Vazio>
            : <p>CPF cadastrado: <b>{p.tem_cpf ? 'sim' : 'não'}</b>. <span className="nota">O seu perfil grava, mas não lê CPF/RG.</span></p>}
        </Cartao>

        {pode.agendar(s.papel) && (
          <Cartao titulo="Agenda" acoes={<Link href={`/agenda/novo?paciente=${p.id}` as never}>Novo agendamento</Link>}>
            {ags.length === 0 ? <Vazio>Sem agendamentos.</Vazio> : (
              <table className="tabela"><caption className="so-leitor">Agendamentos</caption>
                <tbody>{ags.map((a) => (
                  <tr key={a.id}><td>{dataHora(a.data_hora)}</td><td>{ROTULO_TIPO_AG[a.tipo]}</td><td>{a.medico?.nome}</td>
                    <td><Etiqueta tom={a.status === 'finalizado' ? 'ok' : a.status === 'cancelado' || a.status === 'faltou' ? 'erro' : 'info'}>{ROTULO_STATUS_AG[a.status]}</Etiqueta></td></tr>
                ))}</tbody></table>)}
          </Cartao>
        )}

        {pode.verModulo(s.papel, 'orcamentos') && (
          <Cartao titulo="Orçamentos">
            {orcs.length === 0 ? <Vazio>Sem orçamentos.</Vazio> : (
              <table className="tabela"><caption className="so-leitor">Orçamentos</caption>
                <tbody>{orcs.map((o) => (
                  <tr key={o.id}><td><Link href={`/orcamentos/${o.id}` as never}>{o.titulo ?? o.numero ?? 'Orçamento'}</Link></td><td>{data(o.data_emissao)}</td>
                    <td className="num">{moeda(o.valor_liquido)}</td>
                    <td><Etiqueta tom={o.status === 'ganho' ? 'ok' : o.status === 'perda' ? 'erro' : 'ouro'}>{ROTULO_STATUS_ORC[o.status]}</Etiqueta></td></tr>
                ))}</tbody></table>)}
          </Cartao>
        )}

        {pode.editarFinanceiro(s.papel) && (
          <Cartao titulo="Financeiro" acoes={aReceber > 0 ? <Etiqueta tom="aviso">a receber {moeda(aReceber)}</Etiqueta> : undefined}>
            {lancs.length === 0 ? <Vazio>Sem lançamentos.</Vazio> : (
              <table className="tabela"><caption className="so-leitor">Lançamentos</caption>
                <tbody>{lancs.slice(0, 15).map((l) => (
                  <tr key={l.id}><td>{data(l.data_pagamento)}</td><td>{l.descricao}</td><td className="num">{moeda(l.valor)}</td>
                    <td>{l.pago ? <Etiqueta tom="ok">pago</Etiqueta> : <Etiqueta tom="aviso">em aberto</Etiqueta>}</td></tr>
                ))}</tbody></table>)}
          </Cartao>
        )}

        {pode.consentimentos(s.papel) && (
          <Cartao titulo="Consentimentos (LGPD)">
            <Consentimentos pacienteId={p.id} lista={(consent ?? []) as Consentimento[]} podeEditar />
          </Cartao>
        )}

        <Cartao titulo="Anexos">
          {(anexos ?? []).length === 0 ? <Vazio>Nenhum anexo que o seu perfil possa ver.</Vazio> : (
            <table className="tabela"><caption className="so-leitor">Anexos</caption>
              <tbody>{(anexos as Anexo[]).map((a) => (
                <tr key={a.id}><td>{a.nome_arquivo ?? a.tipo_documento ?? 'arquivo'}</td><td>{ROTULO_CLASSE[a.classe]}</td>
                  <td>{data(a.data_documento ?? a.created_at)}</td><td><AbrirAnexo id={a.id} disponivel={a.arquivo_disponivel} /></td></tr>
              ))}</tbody></table>)}
          {classes.length > 0 && <details className="dobra" style={{ marginTop: 12 }}><summary>Enviar anexo</summary><EnvioAnexo pacienteId={p.id} classes={classes} /></details>}
        </Cartao>
      </div>
    </>
  )
}
