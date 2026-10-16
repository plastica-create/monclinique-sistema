import { Marca } from '@/components/marca'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth">
      <div className="auth-caixa">
        <Marca href="/login" />
        {children}
      </div>
    </main>
  )
}
