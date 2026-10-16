import next from 'eslint-config-next'
import nextTs from 'eslint-config-next/typescript'

const config = [
  ...next,
  ...nextTs,
  { ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts', 'e2e/.auth/**', 'test-results/**', 'playwright-report/**'] },
]
export default config
