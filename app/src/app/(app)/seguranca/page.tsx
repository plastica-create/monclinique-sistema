import { removerFatorMfa } from '@/actions/auth'
import { Enviar, Formulario } from '@/components/form'
import { CadastroMfa } from '@/components/mfa'
import { Cabecalho, Cartao, Etiqueta } from '@/components/ui'
import { dataHora } from '@/lib/format'
import { exigirSessao } from '@/lib/sessao'
import { supabaseServidor } from '@/lib/supabase/server'

export const metadata = { title: 'Minha segurança' }

export default async function Seguranca() {
  const s = await exigirSessao()
  const supabase = await supabaseServidor()
  const { data } = await supabase.auth.mfa.listFactors()
  const fatores = (data?.totp ?? []).filter((f) => f.status === 'verified')
  return (
    <>
      <Cabecalho titulo="Minha segurança" sub={s.email} />
      <div className="grade-2">
        <Cartao titulo="Segundo fator (aplicativo autenticador)">
          {fatores.length === 0 ? (
            <><p>Você ainda não tem segundo fator. {s.papel === 'admin' || s.papel === 'medico' ? <b>Para o seu perfil ele é necessário.</b> : 'Recomendado.'}</p><CadastroMfa /></>
          ) : (
            <>
              <p><Etiqueta tom="ok">ativo</Etiqueta> Sessão atual: {s.aal === 'aal2' ? 'verificada com o código' : 'só com senha'}.</p>
              {fatores.map((f) => (
                <Formulario key={f.id} acao={removerFatorMfa} className="form-inline">
                  <input type="hidden" name="factorId" value={f.id} />
                  <span>{f.friendly_name ?? 'Autenticador'} · desde {dataHora(f.created_at)}</span>
                  <Enviar variante="secundario">Remover</Enviar>
                </Formulario>
              ))}
            </>
          )}
        </Cartao>
        <Cartao titulo="Senha">
          <p>Para trocar a senha, saia e use “Esqueci a senha” na tela de login. O link chega no seu e-mail.</p>
        </Cartao>
      </div>
    </>
  )
}
