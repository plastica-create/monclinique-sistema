import { expect, test } from '@playwright/test'
import { entrar, sair, totp, vigiarErros } from './ajuda'

// Rodar com a semente fictícia recém-aplicada (db/tests/seed_ficticio.sql) e os usuários *@teste.local.
const sufixo = Date.now().toString().slice(-6)

test.describe('acesso e segurança', () => {
  test('sem login vai para o login, com cabeçalhos de segurança', async ({ page }) => {
    const r = await page.goto('/pacientes')
    await expect(page).toHaveURL(/\/login$/)
    const h = r!.headers()
    expect(h['content-security-policy']).toContain("frame-ancestors 'none'")
    expect(h['content-security-policy']).toMatch(/script-src 'self' 'nonce-/)
    expect(h['x-frame-options']).toBe('DENY')
    expect(h['cache-control']).toContain('no-store')
  })

  test('senha errada não entra', async ({ page }) => {
    await entrar(page, 'recepcao', 'senha-errada-123')
    await expect(page.locator('p.alerta')).toContainText('E-mail ou senha incorretos')
  })

  test('cookie de sessão é httpOnly', async ({ page, context }) => {
    await entrar(page, 'recepcao')
    await expect(page).toHaveURL(/\/inicio/)
    const cookies = await context.cookies()
    const sessao = cookies.filter((c) => c.name.startsWith('sb-'))
    expect(sessao.length).toBeGreaterThan(0)
    for (const c of sessao) expect(c.httpOnly).toBe(true)
    expect(await page.evaluate(() => document.cookie)).not.toContain('sb-')
  })

  test('login sem perfil não vê nada', async ({ page }) => {
    await entrar(page, 'semperfil')
    await expect(page).toHaveURL(/\/sem-acesso/)
    await page.goto('/pacientes')
    await expect(page).toHaveURL(/\/sem-acesso/)
  })
})

const MATRIZ: Record<string, { ve: string[]; naoVe: string[] }> = {
  admin: { ve: ['Agenda', 'Pacientes', 'Orçamentos', 'Financeiro', 'Leads', 'Administração'], naoVe: [] },
  medico: { ve: ['Agenda', 'Pacientes', 'Orçamentos'], naoVe: ['Financeiro', 'Leads', 'Administração'] },
  comercial: { ve: ['Agenda', 'Pacientes', 'Orçamentos', 'Leads'], naoVe: ['Financeiro', 'Administração'] },
  recepcao: { ve: ['Agenda', 'Pacientes'], naoVe: ['Orçamentos', 'Financeiro', 'Leads', 'Administração'] },
  financeiro: { ve: ['Pacientes', 'Orçamentos', 'Financeiro'], naoVe: ['Agenda', 'Leads', 'Administração'] },
}

for (const [papel, m] of Object.entries(MATRIZ)) {
  test(`menu e telas do papel ${papel}`, async ({ page }) => {
    const erros = vigiarErros(page)
    await entrar(page, papel)
    await expect(page).toHaveURL(/\/inicio/)
    const menu = page.getByRole('navigation', { name: 'Principal' })
    for (const item of m.ve) {
      await expect(menu.getByRole('link', { name: item })).toBeVisible()
    }
    for (const item of m.naoVe) await expect(menu.getByRole('link', { name: item })).toHaveCount(0)
    // abre cada tela permitida sem erro
    for (const item of m.ve) {
      await menu.getByRole('link', { name: item }).click()
      await expect(page.locator('h1')).toBeVisible()
      await expect(page.getByText('Algo deu errado')).toHaveCount(0)
    }
    // tela proibida pela URL volta para o início com aviso
    if (m.naoVe.includes('Financeiro')) {
      await page.goto('/financeiro')
      await expect(page).toHaveURL(/\/inicio\?negado=1/)
    }
    expect(erros).toEqual([])
  })
}

test('recepção cadastra paciente, recebe aviso de duplicado e agenda', async ({ page }) => {
  const erros = vigiarErros(page)
  const nome = `Paciente E2E ${sufixo}`
  await entrar(page, 'recepcao')
  await page.goto('/pacientes/novo')
  await page.getByRole('button', { name: 'Cadastrar paciente' }).click()
  await expect(page.getByText('Informe o nome.')).toBeVisible()
  await expect(page.getByText('Escolha a origem do paciente.')).toBeVisible()

  await page.getByLabel('Nome completo').fill(nome)
  await page.getByLabel('Nascimento').fill('1990-05-20')
  await page.getByLabel('Celular (WhatsApp)').fill('(65) 99876-1234')
  await page.getByLabel('Como conheceu a clínica').selectOption('Instagram')
  await page.getByLabel('CPF').fill('529.982.247-25')
  await page.getByRole('button', { name: 'Cadastrar paciente' }).click()
  await expect(page.locator('h1')).toHaveText(nome)
  // recepção não lê CPF
  await expect(page.getByText('CPF cadastrado: sim')).toBeVisible()
  await expect(page.getByText('Revelar')).toHaveCount(0)

  // mesmo nome + nascimento = aviso de duplicado
  await page.goto('/pacientes/novo')
  await page.getByLabel('Nome completo').fill(nome.toUpperCase())
  await page.getByLabel('Nascimento').fill('1990-05-20')
  await page.getByLabel('Como conheceu a clínica').selectOption('Google')
  await page.getByRole('button', { name: 'Cadastrar paciente' }).click()
  await expect(page.locator('p.alerta')).toContainText('Já existe um cadastro')

  // busca sem acento e por telefone
  await page.goto('/pacientes')
  await page.getByLabel('Buscar por nome ou telefone').fill(`paciente e2e ${sufixo}`)
  await page.getByRole('button', { name: 'Buscar' }).click()
  await expect(page.getByRole('link', { name: nome })).toBeVisible()
  await page.getByLabel('Buscar por nome ou telefone').fill('98761234')
  await page.getByRole('button', { name: 'Buscar' }).click()
  await expect(page.getByRole('link', { name: nome })).toBeVisible()
  expect(page.url()).not.toContain('e2e')   // termo não vai para a URL

  // agenda para amanhã
  await page.getByRole('link', { name: nome }).click()
  await page.getByRole('link', { name: 'Agendar' }).click()
  const amanha = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
  await page.getByLabel('Dia').fill(amanha)
  await page.getByLabel('Hora').fill('06:05')
  await page.getByRole('button', { name: 'Agendar' }).click()
  await expect(page).toHaveURL(new RegExp(`/agenda\\?dia=${amanha}`))
  const item = page.locator('.ag-item', { hasText: nome })
  await expect(item).toBeVisible()
  // futuro: só confirmar/cancelar
  await expect(item.getByRole('button', { name: 'Compareceu' })).toHaveCount(0)
  await item.getByRole('button', { name: 'Confirmar' }).click()
  await expect(item.getByText('Confirmado')).toBeVisible()
  await item.getByText('Cancelar', { exact: true }).click()
  await item.getByLabel('Motivo').fill('Paciente pediu para remarcar')
  await item.getByRole('button', { name: 'Cancelar agendamento' }).click()
  await expect(item.getByText('Cancelado', { exact: true })).toBeVisible()
  expect(erros).toEqual([])
})

test('recepção dá baixa em agendamento passado', async ({ page }) => {
  await entrar(page, 'recepcao')
  await page.goto('/agenda?visao=pendentes')
  const primeiro = page.locator('.ag-item').first()
  await expect(primeiro).toBeVisible()
  const antes = await page.locator('.ag-item').count()
  await primeiro.getByRole('button', { name: 'Compareceu' }).click()
  await expect(page.locator('.ag-item')).toHaveCount(antes - 1)
})

test('admin revela CPF, abre prontuário, registra evolução e vê a auditoria', async ({ page }) => {
  const erros = vigiarErros(page)
  await entrar(page, 'admin')
  await page.goto('/pacientes')
  await page.getByLabel('Buscar por nome ou telefone').fill('Teste 1')
  await page.getByRole('button', { name: 'Buscar' }).click()
  await page.locator('table a').first().click()
  await expect(page.getByTestId('cpf')).toHaveText('•••.•••.•••-••')
  await page.getByRole('button', { name: /Revelar/ }).click()
  await expect(page.getByTestId('cpf')).toHaveText(/^\d{3}\.\d{3}\.\d{3}-\d{2}$/)

  await page.getByRole('link', { name: 'Prontuário' }).click()
  await expect(page.getByText('fica registrada na auditoria')).toBeVisible()
  const texto = `Evolução E2E ${sufixo}: paciente estável.`
  await page.getByLabel('Evolução *').fill(texto)
  await page.getByRole('button', { name: 'Registrar evolução' }).click()
  await expect(page.getByText('Evolução registrada.')).toBeVisible()
  await expect(page.locator('.evolucao pre', { hasText: texto })).toBeVisible()

  await page.goto('/admin?aba=auditoria&acao=leitura')
  await expect(page.locator('td', { hasText: 'tela do prontuário' }).first()).toBeVisible()
  await expect(page.locator('td', { hasText: 'tela do paciente' }).first()).toBeVisible()
  expect(erros).toEqual([])
})

test('médico só vê o próprio prontuário e não lê financeiro', async ({ page }) => {
  await entrar(page, 'medico2')
  await page.goto('/pacientes')
  const linhas = await page.locator('table tbody tr').count()
  expect(linhas).toBeGreaterThan(0)
  await page.locator('table a').first().click()
  await expect(page.getByText('Financeiro', { exact: true })).toHaveCount(0)
  await page.getByRole('link', { name: 'Prontuário' }).click()
  await expect(page.getByText('Algo deu errado')).toHaveCount(0)
})

test('comercial cria orçamento, adiciona item e registra perda', async ({ page }) => {
  const erros = vigiarErros(page)
  await entrar(page, 'comercial')
  await page.goto('/orcamentos/novo')
  await page.locator('#busca-paciente').fill('Teste 2')
  await page.getByRole('button', { name: 'Buscar' }).click()
  await page.getByRole('listbox').getByRole('button').first().click()
  await page.getByLabel('Título').fill(`Orçamento E2E ${sufixo}`)
  await page.getByLabel('Valor bruto (R$)').fill('10.000,00')
  await page.getByLabel('Valor com desconto (R$)').fill('12.000,00')
  await page.getByRole('button', { name: 'Criar orçamento' }).click()
  await expect(page.getByText('O líquido não pode passar do bruto.')).toBeVisible()
  await page.getByLabel('Valor com desconto (R$)').fill('9.000,00')
  await page.getByRole('button', { name: 'Criar orçamento' }).click()
  await expect(page.locator('h1')).toHaveText(`Orçamento E2E ${sufixo}`)

  await page.getByText('Adicionar item').click()
  await page.getByLabel('Descrição').fill('Honorários')
  await page.getByLabel('Quantidade').fill('2')
  await page.getByLabel('Valor unitário (R$)').fill('3.000')
  await page.getByLabel('Desconto (R$)').fill('500')
  await page.getByRole('button', { name: 'Adicionar' }).click()
  await expect(page.getByText('Item adicionado')).toBeVisible()
  await expect(page.getByText('R$ 6.000,00').first()).toBeVisible()
  await expect(page.getByText('R$ 5.500,00').first()).toBeVisible()

  await page.getByLabel('Contato feito').fill('Ligou, vai pensar')
  await page.getByRole('button', { name: 'Registrar contato' }).click()
  await expect(page.getByText('Contato registrado.')).toBeVisible()

  await page.getByRole('button', { name: 'Registrar perda' }).click()
  await expect(page.getByText('Escolha o motivo da perda.')).toBeVisible()
  await page.getByLabel('Motivo da perda').selectOption('Preço')
  await page.getByRole('button', { name: 'Registrar perda' }).click()
  // o bloco de andamento troca para "Reabrir" e o status vira Perda com o motivo
  await expect(page.getByRole('button', { name: 'Reabrir orçamento' })).toBeVisible()
  await expect(page.getByText(/· Preço/)).toBeVisible()
  expect(erros).toEqual([])
})

test('financeiro lança receita, vê vencidos e conciliação', async ({ page }) => {
  const erros = vigiarErros(page)
  await entrar(page, 'financeiro')
  await page.goto('/financeiro/novo')
  await page.getByLabel('Descrição').fill(`Receita E2E ${sufixo}`)
  await page.getByLabel('Valor bruto (R$)').fill('1.234,56')
  await page.getByLabel('Líquido (R$)').fill('1.200,00')
  await page.getByLabel('Forma').selectOption('Cartão de crédito')
  await page.getByRole('button', { name: 'Lançar' }).click()
  await expect(page).toHaveURL(/\/financeiro\?mes=/)
  await expect(page.getByText(`Receita E2E ${sufixo}`)).toBeVisible()

  await page.goto('/financeiro?visao=vencidos')
  await expect(page.getByText('Total vencido')).toBeVisible()
  await page.goto('/financeiro?visao=conciliacao')
  await page.getByText('editar').first().click()
  await page.getByLabel('Contabilidade (R$)').first().fill('100,00')
  await page.getByRole('button', { name: 'Salvar' }).first().click()
  await expect(page.getByText('Valores salvos.')).toBeVisible()
  // financeiro não vê agenda nem prontuário
  await page.goto('/agenda')
  await expect(page).toHaveURL(/negado=1/)
  expect(erros).toEqual([])
})

test('comercial importa leads por CSV com pré-visualização', async ({ page }) => {
  await entrar(page, 'comercial')
  await page.goto('/leads')
  await page.getByLabel(/Cole o CSV/).fill(`nome;telefone;origem;etapa;valor;id\nLead CSV ${sufixo};65 99999-0001;Instagram;Novo;1.500,00;csv-${sufixo}\n;sem nome;;;;\n`)
  await page.getByRole('button', { name: 'Pré-visualizar' }).click()
  await expect(page.locator('p.alerta')).toContainText('1 lead(s) prontos')
  await expect(page.locator('p.alerta')).toContainText('1 linha(s) ignoradas')
  await page.getByRole('button', { name: 'Importar' }).click()
  await expect(page.getByText('1 lead(s) importados')).toBeVisible()
  await page.reload()
  await expect(page.getByText(`Lead CSV ${sufixo}`)).toBeVisible()
})

test('médica cadastra o segundo fator e passa a precisar do código', async ({ page }) => {
  await entrar(page, 'medico2')
  await page.goto('/seguranca')
  await page.getByRole('button', { name: 'Gerar QR code' }).click()
  const segredo = (await page.getByTestId('segredo-totp').textContent())!.trim()
  await page.getByLabel('Código').fill(totp(segredo))
  await page.getByRole('button', { name: 'Verificar' }).click()
  await expect(page).toHaveURL(/\/inicio/)
  await page.goto('/seguranca')
  await expect(page.getByText('verificada com o código')).toBeVisible()
  await sair(page)

  await entrar(page, 'medico2')
  await expect(page).toHaveURL(/\/mfa/)
  await page.goto('/pacientes')
  await expect(page).toHaveURL(/\/mfa/)
  await page.getByLabel('Código').fill('000000')
  await page.getByRole('button', { name: 'Verificar' }).click()
  await expect(page.getByText('Código incorreto ou expirado.')).toBeVisible()
  await page.getByLabel('Código').fill(totp(segredo))
  await page.getByRole('button', { name: 'Verificar' }).click()
  await expect(page).toHaveURL(/\/inicio/)

  // remove o fator para o teste poder rodar de novo
  await page.goto('/seguranca')
  await page.getByRole('button', { name: 'Remover' }).click()
  await expect(page.getByText('Segundo fator removido.')).toBeVisible()
})
