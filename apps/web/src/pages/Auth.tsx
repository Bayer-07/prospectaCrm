import { FormEvent, useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Eye, EyeOff, MailCheck, Moon, Sun } from 'lucide-react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { api, type Envelope } from '../lib/api';
import { Button, Field, PageLoading } from '../components/ui';
import { useAuth } from '../App';
import { useTheme } from '../lib/theme';
import { publishAuthEvent } from '../lib/auth-session';
import { toast } from '../lib/toast';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const sessionExpired = params.get('reason') === 'expired';
  const { user, loading: authLoading, refresh } = useAuth();
  const { theme, toggleTheme } = useTheme();
  useEffect(() => {
    if (sessionExpired) toast.info('Sua sessão expirou. Entre novamente para continuar.', 'Sessão encerrada');
  }, [sessionExpired]);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setLoading(true);
    try {
      await api<Envelope<{ tokenType: 'Bearer'; expiresAt: string }>>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      publishAuthEvent('login');
      await refresh(); navigate('/');
    } catch { /* o cliente da API exibe o toast padronizado */ } finally { setLoading(false); }
  };
  if (authLoading) return <PageLoading />;
  if (user) return <Navigate to="/" replace />;
  return <main className="auth-page auth-page-simple"><button type="button" className="auth-theme-toggle icon-button" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}>{theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}</button><section className="auth-panel auth-panel-simple"><img className="auth-logo" src="/brand-logo.png" alt="Logo BZS One" /><div className="auth-copy"><span className="eyebrow">BZS One</span><h1>Acesse sua conta</h1><p>Use seu e-mail corporativo e senha.</p></div><form onSubmit={submit} className="auth-form"><Field label="E-mail" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" autoFocus /><label className="field"><span>Senha</span><div className="password-field"><input type={show ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" /><button type="button" onClick={() => setShow(!show)} aria-label="Mostrar senha">{show ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label><div className="auth-form-options"><Link to="/recuperar-senha">Esqueci minha senha</Link></div><Button type="submit" loading={loading}>Entrar <ArrowRight size={17} /></Button></form><p className="auth-internal-note">Uso exclusivo da equipe.</p></section></main>;
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      await api('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setSent(true);
      toast.info('Se o e-mail estiver cadastrado, as instruções de recuperação serão enviadas.', 'Verifique seu e-mail');
    } catch { /* erro exibido globalmente */ } finally {
      setLoading(false);
    }
  };
  return <main className="auth-page auth-page-simple">
    <button type="button" className="auth-theme-toggle icon-button" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}>{theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}</button>
    <section className="auth-panel auth-panel-simple">
      <img className="auth-logo" src="/brand-logo.png" alt="Logo BZS One" />
      {sent
        ? <div className="auth-recovery-result">
          <span><MailCheck size={25} /></span>
          <h1>Verifique seu e-mail</h1>
          <p>Se existir uma conta ativa para <strong>{email}</strong>, enviaremos um link válido por 60 minutos.</p>
          <p>Confira também as pastas de spam e lixo eletrônico.</p>
          <Link to="/login"><ArrowLeft size={16} />Voltar ao login</Link>
        </div>
        : <>
          <div className="auth-copy"><span className="eyebrow">Recuperação de acesso</span><h1>Esqueceu sua senha?</h1><p>Informe o e-mail usado no BZS One.</p></div>
          <form onSubmit={submit} className="auth-form">
            <Field label="E-mail" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" autoFocus />
            <Button type="submit" loading={loading}>Enviar instruções <ArrowRight size={17} /></Button>
          </form>
          <Link className="auth-back-link" to="/login"><ArrowLeft size={15} />Voltar ao login</Link>
        </>}
    </section>
  </main>;
}

function TokenPage({ mode }: Readonly<{ mode: 'invite' | 'reset' }>) {
  const [params] = useSearchParams(); const token = params.get('token') || '';
  const [name, setName] = useState(''); const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const submit = async (event: FormEvent) => { event.preventDefault(); setLoading(true); try { await api(mode === 'invite' ? '/auth/accept-invite' : '/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password, ...(mode === 'invite' ? { name } : {}) }) }); toast.success('Senha definida com sucesso. Redirecionando para o login.'); setTimeout(() => navigate('/login'), 1200); } catch { /* erro exibido globalmente */ } finally { setLoading(false); } };
  return <main className="token-page"><form className="token-card" onSubmit={submit}><img className="token-logo" src="/brand-logo.png" alt="Logo" /><span className="eyebrow">Acesso seguro</span><h1>{mode === 'invite' ? 'Ative sua conta' : 'Defina uma nova senha'}</h1><p>Use pelo menos 5 caracteres para proteger sua conta.</p>{mode === 'invite' && <Field label="Seu nome" value={name} onChange={(event) => setName(event.target.value)} required />}<Field label="Nova senha" type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={5} required autoComplete="new-password" /><Button type="submit" loading={loading}>Salvar senha</Button></form></main>;
}
export const InvitePage = () => <TokenPage mode="invite" />;
export const ResetPasswordPage = () => <TokenPage mode="reset" />;
