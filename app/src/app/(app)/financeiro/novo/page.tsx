import { salvarLancamento } from '@/actions/financeiro'
import { Campo, Enviar, Formulario, Marcar, Selecao } from '@/components/form'
import { EscolherPaciente } from '@/components/paciente-picker'
import { Cabecalho, Cartao } from '@/components/ui'
import { apoio } from '@/lib/data/financeiro'
import { hojeISO } from '@/lib/format'
import { exigirSessao } from '@/lib/sessao'
import { supabaseServidor } from '@/lib/supabase/server'
import { FORMAS_PAGAMENTO } from '@/lib/tipos'

export const metadata = { title: 'Novo lançamento' }

export default async function NovoLancamento() {
  await exigirSessao('financeiro')
  const { categorias, caixas } = await apoio(await supabaseServidor())
  const hoje = hojeISO()
  return (
    <>
      <Cabecalho titulo="Novo lançamento" />
      <Cartao>
        <Formulario acao={salvarLancamento}>
          <div className="linha-form">
            <Selecao nome="tipo" rotulo="Tipo" opcoes={[['receita', 'Receita'], ['despesa', 'Despesa']]} />
            <Campo nome="data_lancamento" rotulo="Data do lançamento" tipo="date" obrigatorio padrao={hoje} />
            <Campo nome="data_pagamento" rotulo="Pagamento / vencimento" tipo="date" obrigatorio padrao={hoje} ajuda="Se não foi pago ainda, é o vencimento." />
          </div>
          <EscolherPaciente obrigatorio={false} />
          <div className="linha-form">
            <Campo nome="descricao" rotulo="Descrição" obrigatorio />
            <Campo nome="prestador" rotulo="Prestador / fornecedor" />
            <Selecao nome="categoria_id" rotulo="Categoria" vazio="—" opcoes={categorias.map((c) => [c.id, `${c.nome} (${c.tipo})`] as const)} />
          </div>
          <div className="linha-form">
            <Selecao nome="forma_pagamento" rotulo="Forma" vazio="—" opcoes={FORMAS_PAGAMENTO.map((f) => [f, f] as const)} />
            <Selecao nome="caixa_id" rotulo="Caixa / conta" vazio="—" opcoes={caixas.map((c) => [c.id, c.nome] as const)} />
            <Campo nome="valor" rotulo="Valor bruto (R$)" inputMode="decimal" obrigatorio />
            <Campo nome="valor_liquido" rotulo="Líquido (R$)" inputMode="decimal" ajuda="Após taxa do cartão. Vazio = igual ao bruto." />
          </div>
          <Marcar nome="pago" rotulo="Já foi pago" padrao />
          <div className="form-acoes"><Enviar>Lançar</Enviar></div>
        </Formulario>
      </Cartao>
    </>
  )
}
