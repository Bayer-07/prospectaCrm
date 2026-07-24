import { FormEvent, useState } from 'react';
import { ArrowRight, Eye, EyeOff, Moon, Sun } from 'lucide-react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { api, type Envelope } from '../lib/api';
import { Button, Field, PageLoading } from '../components/ui';
import { useAuth } from '../App';
import { useTheme } from '../lib/theme';
import { publishAuthEvent } from '../lib/auth-session';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user, loading: authLoading, refresh } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setLoading(true); setError('');
    try {
      await api<Envelope<{ tokenType: 'Bearer'; expiresAt: string }>>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      publishAuthEvent('login');
      await refresh(); navigate('/');
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível entrar'); } finally { setLoading(false); }
  };
  if (authLoading) return <PageLoading />;
  if (user) return <Navigate to="/" replace />;
  return <main className="auth-page auth-page-simple"><button className="auth-theme-toggle icon-button" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}>{theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}</button><section className="auth-panel auth-panel-simple"><img className="auth-logo" src="/brand-logo.png" alt="Logo BZS One" /><div className="auth-copy"><span className="eyebrow">BZS One</span><h1>Acesse sua conta</h1><p>Use seu e-mail corporativo e senha.</p></div>{params.get('reason') === 'expired' && <div className="form-message">Sua sessão expirou. Entre novamente para continuar.</div>}<form onSubmit={submit} className="auth-form"><Field label="E-mail" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" autoFocus /><label className="field"><span>Senha</span><div className="password-field"><input type={show ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" /><button type="button" onClick={() => setShow(!show)} aria-label="Mostrar senha">{show ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>{error && <div className="form-error">{error}</div>}<Button type="submit" loading={loading}>Entrar <ArrowRight size={17} /></Button></form><p className="auth-internal-note">Uso exclusivo da equipe.</p></section></main>;
}

function TokenPage({ mode }: { mode: 'invite' | 'reset' }) {
  const [params] = useSearchParams(); const token = params.get('token') || '';
  const [name, setName] = useState(''); const [password, setPassword] = useState('');
  const [message, setMessage] = useState(''); const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const submit = async (event: FormEvent) => { event.preventDefault(); setLoading(true); try { await api(mode === 'invite' ? '/auth/accept-invite' : '/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password, ...(mode === 'invite' ? { name } : {}) }) }); setMessage('Senha definida com sucesso. Redirecionando…'); setTimeout(() => navigate('/login'), 1200); } catch (error) { setMessage(error instanceof Error ? error.message : 'Link inválido'); } finally { setLoading(false); } };
  return <main className="token-page"><form className="token-card" onSubmit={submit}><img className="token-logo" src="/brand-logo.png" alt="Logo" /><span className="eyebrow">Acesso seguro</span><h1>{mode === 'invite' ? 'Ative sua conta' : 'Defina uma nova senha'}</h1><p>Use pelo menos 12 caracteres para proteger sua conta.</p>{mode === 'invite' && <Field label="Seu nome" value={name} onChange={(event) => setName(event.target.value)} required />}<Field label="Nova senha" type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={12} required />{message && <div className="form-message">{message}</div>}<Button type="submit" loading={loading}>Salvar senha</Button></form></main>;
}
export const InvitePage = () => <TokenPage mode="invite" />;
export const ResetPasswordPage = () => <TokenPage mode="reset" />;
