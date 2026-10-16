import { salvarPaciente } from '@/actions/pacientes'
import { Campo, Enviar, Formulario, Selecao } from '@/components/form'
import { ORIGENS, type Medico, type Paciente } from '@/lib/tipos'

export function PacienteForm({ paciente, medicos, mostrarDocumentos }: {
  paciente?: Paciente; medicos: Medico[]; mostrarDocumentos: boolean
}) {
  const p = paciente
  return (
    <Formulario acao={salvarPaciente}>
      {p && <input type="hidden" name="id" value={p.id} />}
      <fieldset className="pilha" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="so-leitor">Identificação</legend>
        <div className="linha-form">
          <Campo nome="nome" rotulo="Nome completo" obrigatorio padrao={p?.nome} autoComplete="off" className="largo" />
          <Campo nome="data_nascimento" rotulo="Nascimento" tipo="date" padrao={p?.data_nascimento} />
          <Selecao nome="sexo" rotulo="Sexo" vazio="—" padrao={p?.sexo} opcoes={[['F', 'Feminino'], ['M', 'Masculino'], ['O', 'Outro']]} />
        </div>
        <div className="linha-form">
          <Campo nome="celular" rotulo="Celular (WhatsApp)" tipo="tel" inputMode="tel" padrao={p?.celular} />
          <Campo nome="telefone" rotulo="Telefone" tipo="tel" inputMode="tel" padrao={p?.telefone} />
          <Campo nome="email" rotulo="E-mail" tipo="email" padrao={p?.email} />
        </div>
        <div className="linha-form">
          <Selecao nome="origem" rotulo="Como conheceu a clínica" obrigatorio vazio="Escolha…" padrao={p?.origem}
            opcoes={ORIGENS.map((o) => [o, o] as const)} />
          <Campo nome="indicacao_original" rotulo="Quem indicou / detalhe" padrao={p?.indicacao_original} />
          <Selecao nome="medico_responsavel_id" rotulo="Médico responsável" vazio="—" padrao={p?.medico_responsavel_id}
            opcoes={medicos.map((m) => [m.id, m.nome] as const)} />
        </div>
        {!p && mostrarDocumentos && (
          <div className="linha-form">
            <Campo nome="cpf" rotulo="CPF" inputMode="numeric" ajuda="Só a administração, o financeiro e o médico do paciente conseguem ver depois." />
            <Campo nome="rg" rotulo="RG" />
          </div>
        )}
      </fieldset>
      <details className="dobra">
        <summary>Endereço e outros dados</summary>
        <div className="pilha">
          <div className="linha-form">
            <Campo nome="cep" rotulo="CEP" inputMode="numeric" padrao={p?.cep} />
            <Campo nome="endereco" rotulo="Endereço" padrao={p?.endereco} />
            <Campo nome="numero" rotulo="Número" padrao={p?.numero} />
          </div>
          <div className="linha-form">
            <Campo nome="complemento" rotulo="Complemento" padrao={p?.complemento} />
            <Campo nome="bairro" rotulo="Bairro" padrao={p?.bairro} />
            <Campo nome="cidade" rotulo="Cidade" padrao={p?.cidade ?? 'Cuiabá'} />
            <Campo nome="uf" rotulo="UF" padrao={p?.uf ?? 'MT'} />
          </div>
          <div className="linha-form">
            <Campo nome="estado_civil" rotulo="Estado civil" padrao={p?.estado_civil} />
            <Campo nome="ocupacao" rotulo="Profissão" padrao={p?.ocupacao} />
            <Campo nome="convenio" rotulo="Convênio" padrao={p?.convenio} />
            <Campo nome="instagram" rotulo="Instagram" padrao={p?.instagram} />
          </div>
          <Campo nome="observacao" rotulo="Observação administrativa" tipo="textarea" padrao={p?.observacao}
            ajuda="A recepção lê este campo. Não registre informação clínica aqui: use o prontuário." />
        </div>
      </details>
      <div className="form-acoes"><Enviar>{p ? 'Salvar alterações' : 'Cadastrar paciente'}</Enviar></div>
    </Formulario>
  )
}
