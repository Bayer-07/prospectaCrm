import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { api, type Envelope } from './lib/api';
import type { UserContext } from './lib/types';
import { PageLoading } from './components/ui';
import {
  publishAuthEvent,
  redirectToLogin,
  subscribeToAuthEvents,
} from './lib/auth-session';

const Shell = lazy(() => import('./components/Shell').then((module) => ({ default: module.Shell })));
const LoginPage = lazy(() => import('./pages/Auth').then((module) => ({ default: module.LoginPage })));
const ForgotPasswordPage = lazy(() => import('./pages/Auth').then((module) => ({ default: module.ForgotPasswordPage })));
const InvitePage = lazy(() => import('./pages/Auth').then((module) => ({ default: module.InvitePage })));
const ResetPasswordPage = lazy(() => import('./pages/Auth').then((module) => ({ default: module.ResetPasswordPage })));
const DashboardPage = lazy(() => import('./pages/Dashboard').then((module) => ({ default: module.DashboardPage })));
const PipelinePage = lazy(() => import('./pages/Pipeline').then((module) => ({ default: module.PipelinePage })));
const CompaniesPage = lazy(() => import('./pages/Companies').then((module) => ({ default: module.CompaniesPage })));
const ContactsPage = lazy(() => import('./pages/Contacts').then((module) => ({ default: module.ContactsPage })));
const TasksPage = lazy(() => import('./pages/Tasks').then((module) => ({ default: module.TasksPage })));
const ActivitiesPage = lazy(() => import('./pages/Activities').then((module) => ({ default: module.ActivitiesPage })));
const InboxPage = lazy(() => import('./pages/Inbox').then((module) => ({ default: module.InboxPage })));
const CampaignsPage = lazy(() => import('./pages/Campaigns').then((module) => ({ default: module.CampaignsPage })));
const ChatbotsPage = lazy(() => import('./pages/Chatbots').then((module) => ({ default: module.ChatbotsPage })));
const AutomationsPage = lazy(() => import('./pages/Automations').then((module) => ({ default: module.AutomationsPage })));
const QuickRepliesPage = lazy(() => import('./pages/QuickReplies').then((module) => ({ default: module.QuickRepliesPage })));
const ReportsPage = lazy(() => import('./pages/Reports').then((module) => ({ default: module.ReportsPage })));
const SettingsPage = lazy(() => import('./pages/Settings').then((module) => ({ default: module.SettingsPage })));
const ConnectionsPage = lazy(() => import('./pages/Settings').then((module) => ({ default: module.ConnectionsPage })));
const IntegrationsPage = lazy(() => import('./pages/Settings').then((module) => ({ default: module.IntegrationsPage })));
const EmailPage = lazy(() => import('./pages/Email').then((module) => ({ default: module.EmailPage })));

type AuthValue = { user: UserContext | null; loading: boolean; refresh(): Promise<unknown>; logout(): Promise<void> };
const AuthContext = createContext<AuthValue | null>(null);
export const useAuth = () => useContext(AuthContext)!;

function AuthProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['me'],
    queryFn: () => api<Envelope<UserContext>>('/auth/me'),
    retry: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: 'always',
  });
  const refresh = useCallback(() => query.refetch(), [query.refetch]);
  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' });
    publishAuthEvent('logout');
    queryClient.clear();
    redirectToLogin('logout');
  }, [queryClient]);
  useEffect(() => subscribeToAuthEvents((event) => {
    queryClient.clear();
    if (event.type === 'login') {
      if (window.location.pathname === '/login') window.location.replace('/');
      else window.location.reload();
      return;
    }
    redirectToLogin(event.type);
  }), [queryClient]);
  useEffect(() => {
    const expiresAt = query.data?.data.sessionExpiresAt;
    if (!expiresAt) return undefined;
    const delay = new Date(expiresAt).getTime() - Date.now();
    if (delay <= 0) {
      publishAuthEvent('expired');
      queryClient.clear();
      redirectToLogin('expired');
      return undefined;
    }
    const timeout = window.setTimeout(() => {
      publishAuthEvent('expired');
      queryClient.clear();
      redirectToLogin('expired');
    }, Math.min(delay, 2_147_000_000));
    return () => window.clearTimeout(timeout);
  }, [query.data?.data.sessionExpiresAt, queryClient]);
  const value = useMemo<AuthValue>(() => ({ user: query.data?.data || null, loading: query.isLoading, refresh, logout }), [query.data?.data, query.isLoading, refresh, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function Protected() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <PageLoading />;
  return user ? <Outlet /> : <Navigate to="/login" state={{ from: location.pathname }} replace />;
}

const routeTitles: Record<string, string> = { '/': 'Visão geral', '/pipeline': 'Pipeline', '/empresas': 'Empresas', '/contatos': 'Contatos', '/tarefas': 'Tarefas', '/atividades': 'Atividades', '/inbox': 'Inbox', '/respostas-rapidas': 'Respostas rápidas', '/chatbots': 'Chatbots', '/campanhas': 'Campanhas', '/automacoes': 'Automações', '/relatorios': 'Relatórios', '/email': 'E-mail', '/conexoes': 'Conexões', '/configuracoes': 'Configurações', '/integracoes': 'Integrações', '/integracoes/api': 'API', '/integracoes/mcp': 'Servidor MCP', '/integracoes/webhooks': 'Webhooks', '/integracoes/swagger': 'Swagger', '/integracoes/ai': 'Inteligência artificial' };

function RouteTitle() {
  const location = useLocation();
  useEffect(() => {
    document.title = `${routeTitles[location.pathname] || 'Início'} · BZS One`;
  }, [location.pathname]);
  return null;
}

export function App() {
  return <AuthProvider><RouteTitle /><Suspense fallback={<PageLoading />}><Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/recuperar-senha" element={<ForgotPasswordPage />} />
    <Route path="/aceitar-convite" element={<InvitePage />} />
    <Route path="/redefinir-senha" element={<ResetPasswordPage />} />
    <Route element={<Protected />}>
      <Route element={<Shell />}>
        <Route index element={<DashboardPage />} />
        <Route path="pipeline" element={<PipelinePage />} />
        <Route path="empresas" element={<CompaniesPage />} />
        <Route path="contatos" element={<ContactsPage />} />
        <Route path="tarefas" element={<TasksPage />} />
        <Route path="atividades" element={<ActivitiesPage />} />
        <Route path="inbox/:conversationId?" element={<InboxPage />} />
        <Route path="respostas-rapidas" element={<QuickRepliesPage />} />
        <Route path="campanhas" element={<CampaignsPage />} />
        <Route path="chatbots" element={<ChatbotsPage />} />
        <Route path="automacoes" element={<AutomationsPage />} />
        <Route path="relatorios" element={<ReportsPage />} />
        <Route path="email" element={<EmailPage />} />
        <Route path="conexoes" element={<ConnectionsPage />} />
        <Route path="configuracoes" element={<SettingsPage />} />
        <Route path="integracoes/:section?" element={<IntegrationsPage />} />
      </Route>
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></Suspense></AuthProvider>;
}
