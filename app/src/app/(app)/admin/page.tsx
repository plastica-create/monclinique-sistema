import { alternarMfa, salvarMedico, salvarPerfil } from '@/actions/admin'
import { Campo, Enviar, Formulario, Marcar, Selecao } from '@/components/form'
import { Abas, Cabecalho, Cartao, Etiqueta, Vazio } from '@/components/ui'
import { dataHora } from '@/lib/format'
import { NOME_PAPEL, PAPEIS, type Papel } from '@/lib/roles'
import { exigirSessao } from '@/lib/sessao'
import { supabaseServidor } from '@/lib/supabase/server'

export const metadata = { title: 'Administração' }

const ACOES = ['leitura', 'exportacao', 'update', 'delete'] as const

export default async function Admin({ searchParams }: { searchParams: Promise<{ aba?: string; acao?: string }> }) {
  const s = await exigirSessao('admin')
  const sp = await searchParams
  const aba = sp.aba === 'auditoria' || sp.aba === 'medicos' ? sp.aba : 'equipe'
  const supabase = await supabaseServidor()
  return (
    <>
      <Cabecalho titulo="Administração" />
      <Abas atual={aba} itens={[{ chave: 'equipe', rotulo: 'Equipe e acessos', href: '/admin' }, { chave: 'medicos', rotulo: 'Médicos', href: '/admin?aba=medicos' },
        { chave: 'auditoria', rotulo: 'Auditoria', href: '/admin?aba=auditoria' }]} />
      {aba === 'equipe' && <Equipe supabase={supabase} meuId={s.userId} aal={s.aal} />}
      {aba === 'medicos' && <Medicos supabase={supabase} />}
      {aba === 'auditoria' && <Auditoria supabase={supabase} acao={ACOES.find((a) => a === sp.acao)} />}
    </>
  )
}

type S = Awaited<ReturnType<typeof supabaseServidor>>

async function Equipe({ supabase, meuId, aal }: { supabase: S; meuId: string; aal: string }) {
  const [{ data: perfis }, { data: cfg }] = await Promise.all([
    supabase.from('perfis').select('id, nome, papel, ativo, created_at').order('ativo', { ascending: false }).order('nome'),
    supabase.from('config_seguranca').select('exigir_mfa_admin_medico').maybeSingle(),
  ])
  const opcoesPapel = PAPEIS.map((p) => [p, NOME_PAPEL[p]] as const)
  const mfa = Boolean(cfg?.exigir_mfa_admin_medico)
  return (
    <div className="pilha">
      <Cartao titulo="Pessoas com acesso">
        <div className="tabela-envolve">
          <table className="tabela"><caption className="so-leitor">Perfis</caption>
            <thead><tr><th>Nome</th><th>Papel</th><th>Situação</th><th>Desde</th><th>Editar</th></tr></thead>
            <tbody>{(perfis ?? []).map((p) => (
              <tr key={p.id as string}>
                <td>{p.nome as string}{p.id === meuId && <> <Etiqueta tom="info">você</Etiqueta></>}</td>
                <td>{NOME_PAPEL[p.papel as Papel]}</td>
                <td>{p.ativo ? <Etiqueta tom="ok">ativo</Etiqueta> : <Etiqueta tom="erro">desativado</Etiqueta>}</td>
                <td>{dataHora(p.created_at as string)}</td>
                <td><details><summary className="link-botao">editar</summary>
                  <Formulario acao={salvarPerfil}>
                    <input type="hidden" name="id" value={p.id as string} />
                    <Campo nome="nome" rotulo="Nome" padrao={p.nome as string} />
                    <Selecao nome="papel" rotulo="Papel" padrao={p.papel as string} opcoes={opcoesPapel} />
                    <Marcar nome="ativo" rotulo="Acesso ativo" padrao={Boolean(p.ativo)} />
                    <Enviar>Salvar</Enviar>
                  </Formulario></details></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <p className="nota">Desligamento: desative no mesmo dia. O histórico da pessoa continua na auditoria.</p>
      </Cartao>
      <div className="grade-2">
        <Cartao titulo="Liberar acesso para alguém novo">
          <ol className="nota" style={{ paddingLeft: 18 }}>
            <li>No Supabase: Authentication → Users → Add user (e-mail da pessoa, senha temporária, Auto Confirm).</li>
            <li>Copie o “User UID” e cole abaixo com o papel. Sem esse passo a pessoa entra, mas não vê nada.</li>
          </ol>
          <Formulario acao={salvarPerfil} limparAoSalvar>
            <input type="hidden" name="novo" value="1" />
            <Campo nome="id" rotulo="User UID" obrigatorio placeholder="00000000-0000-0000-0000-000000000000" />
            <Campo nome="nome" rotulo="Nome" obrigatorio />
            <Selecao nome="papel" rotulo="Papel" opcoes={opcoesPapel} padrao="recepcao" />
            <input type="hidden" name="ativo" value="on" />
            <div><Enviar>Liberar acesso</Enviar></div>
          </Formulario>
        </Cartao>
        <Cartao titulo="Segundo fator (MFA)">
          <p>Situação: {mfa ? <Etiqueta tom="ok">obrigatório para administração e médicos</Etiqueta> : <Etiqueta tom="aviso">opcional</Etiqueta>}</p>
          <p className="nota">Ligue só depois que todos os administradores e médicos tiverem cadastrado o aplicativo autenticador em “Minha segurança”.
            Quem não tiver fica sem acesso até cadastrar.{aal !== 'aal2' && ' Sua sessão atual não usou o segundo fator.'}</p>
          <Formulario acao={alternarMfa}>
            <input type="hidden" name="ligar" value={String(!mfa)} />
            <div><Enviar variante={mfa ? 'secundario' : 'primario'}>{mfa ? 'Deixar opcional' : 'Exigir MFA'}</Enviar></div>
          </Formulario>
        </Cartao>
      </div>
    </div>
  )
}

async function Medicos({ supabase }: { supabase: S }) {
  const { data } = await supabase.from('medicos').select('id, nome, crm, uf_crm, especialidade, usuario_id, ativo').order('nome')
  return (
    <div className="grade-2">
      <Cartao titulo="Médicos">
        {(data ?? []).length === 0 ? <Vazio>Nenhum médico.</Vazio> : (data ?? []).map((m) => (
          <details key={m.id as string} className="dobra" style={{ padding: '8px 0', borderBottom: '1px solid var(--linha)' }}>
            <summary>{m.nome as string} {m.crm ? `· CRM ${m.crm}/${m.uf_crm ?? ''}` : <Etiqueta tom="aviso">sem CRM</Etiqueta>} {!m.usuario_id && <Etiqueta>sem login</Etiqueta>} {!m.ativo && <Etiqueta tom="erro">inativo</Etiqueta>}</summary>
            <Formulario acao={salvarMedico}>
              <input type="hidden" name="id" value={m.id as string} />
              <div className="linha-form">
                <Campo nome="nome" rotulo="Nome" padrao={m.nome as string} obrigatorio />
                <Campo nome="crm" rotulo="CRM" padrao={m.crm as string | null} />
                <Campo nome="uf_crm" rotulo="UF do CRM" padrao={m.uf_crm as string | null} />
              </div>
              <div className="linha-form">
                <Campo nome="especialidade" rotulo="Especialidade" padrao={m.especialidade as string | null} />
                <Campo nome="usuario_id" rotulo="User UID do login" padrao={m.usuario_id as string | null} ajuda="Liga o médico ao login dele (o mesmo UID do perfil)." />
              </div>
              <Marcar nome="ativo" rotulo="Ativo" padrao={Boolean(m.ativo)} />
              <div><Enviar>Salvar</Enviar></div>
            </Formulario>
          </details>
        ))}
      </Cartao>
      <Cartao titulo="Novo médico">
        <Formulario acao={salvarMedico} limparAoSalvar>
          <Campo nome="nome" rotulo="Nome" obrigatorio />
          <div className="linha-form"><Campo nome="crm" rotulo="CRM" /><Campo nome="uf_crm" rotulo="UF" padrao="MT" /></div>
          <Campo nome="especialidade" rotulo="Especialidade" />
          <Campo nome="usuario_id" rotulo="User UID do login (opcional)" />
          <div><Enviar>Cadastrar médico</Enviar></div>
        </Formulario>
      </Cartao>
    </div>
  )
}

async function Auditoria({ supabase, acao }: { supabase: S; acao?: (typeof ACOES)[number] }) {
  let q = supabase.from('auditoria').select('id, ocorrido_em, usuario_id, papel, acao, tabela, registro_id, paciente_id, campos_alterados, finalidade, ip')
    .order('id', { ascending: false }).limit(200)
  if (acao) q = q.eq('acao', acao)
  const [{ data }, { data: perfis }] = await Promise.all([q, supabase.from('perfis').select('id, nome')])
  const nomes = new Map((perfis ?? []).map((p) => [p.id as string, p.nome as string]))
  return (
    <Cartao titulo="Últimos 200 eventos" acoes={<Abas atual={acao ?? 'todos'} itens={[{ chave: 'todos', rotulo: 'Todos', href: '/admin?aba=auditoria' },
      ...ACOES.map((a) => ({ chave: a, rotulo: a, href: `/admin?aba=auditoria&acao=${a}` }))]} />}>
      {(data ?? []).length === 0 ? <Vazio>Sem eventos.</Vazio> : (
        <div className="tabela-envolve">
          <table className="tabela"><caption className="so-leitor">Auditoria</caption>
            <thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Tabela</th><th>Campos / finalidade</th><th>Paciente</th></tr></thead>
            <tbody>{(data ?? []).map((e) => (
              <tr key={e.id as number}>
                <td>{dataHora(e.ocorrido_em as string)}</td>
                <td>{nomes.get(e.usuario_id as string) ?? (e.usuario_id ? 'usuário removido' : 'sistema')}<br /><small>{e.papel as string}</small></td>
                <td><Etiqueta tom={e.acao === 'delete' ? 'erro' : e.acao === 'leitura' ? 'info' : 'neutro'}>{e.acao as string}</Etiqueta></td>
                <td>{e.tabela as string}</td>
                <td>{(e.campos_alterados as string[] | null)?.join(', ') ?? (e.finalidade as string | null) ?? '—'}</td>
                <td>{e.paciente_id ? <a href={`/pacientes/${e.paciente_id}`}>abrir</a> : '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <p className="nota">Conteúdo antes/depois não aparece aqui de propósito (pode ter dado pessoal). Consulta completa: SQL Editor do Supabase.</p>
    </Cartao>
  )
}
