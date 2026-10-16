import { defineConfig } from '@playwright/test'
import fs from 'node:fs'

// Testes ponta a ponta contra um Supabase de TESTE com a semente fictícia (db/tests/seed_ficticio.sql).
// Nunca aponte para produção.
const chromiumLocal = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_URL ?? 'http://localhost:3000',
    locale: 'pt-BR',
    timezoneId: 'America/Cuiaba',
    launchOptions: fs.existsSync(chromiumLocal) ? { executablePath: chromiumLocal } : {},
  },
})
