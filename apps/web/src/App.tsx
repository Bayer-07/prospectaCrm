import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { api, type Envelope } from './lib/api';
import type { UserContext } from './lib/types';
import { PageLoading } from './components/ui';

const Shell = lazy(() => import('./components/Shell').then((module) => ({ default: module.Shell })));
const LoginPage = lazy(() => import('./pages/Auth').then((module) => ({ default: module.LoginPage })));
const InvitePage = lazy(() => import('./pages/Auth').then((module) => ({ default: module.InvitePage })));
const ResetPasswordPage = lazy(() => import('./pages/Auth').then((module) => ({ default: module.ResetPasswordPage })));
const DashboardPage = lazy(() => import('./pages/Dashboard').then((module) => ({ default: module.DashboardPage })));
const PipelinePage = lazy(() => import('./pages/Pipeline').then((module) => ({ default: module.PipelinePage })));
const CompaniesPage = lazy(() => import('./pages/Companies').then((module) => ({ default: module.CompaniesPage })));
const ContactsPage = lazy(() => import('./pages/Contacts').then((module) => ({ default: module.ContactsPage })));
const TasksPage = lazy(() => import('./pages/Tasks').then((module) => ({ default: module.TasksPage })));
const InboxPage = lazy(() => import('./pages/Inbox').then((module) => ({ default: module.InboxPage })));
const CampaignsPage = lazy(() => import('./pages/Campaigns').then((module) => ({ default: module.CampaignsPage })));
const ChatbotsPage = lazy(() => import('./pages/Chatbots').then((module) => ({ default: module.ChatbotsPage })));
const AutomationsPage = lazy(() => import('./pages/Automations').then((module) => ({ default: module.AutomationsPage })));
const ReportsPage = lazy(() => import('./pages/Reports').then((module) => ({ default: module.ReportsPage })));
const SettingsPage = lazy(() => import('./pages/Settings').then((module) => ({ default: module.SettingsPage })));
const EmailPage = lazy(() => import('./pages/Email').then((module) => ({ default: module.EmailPage })));

type AuthValue = { user: UserContext | null; loading: boolean; refresh(): Promise<unknown>; logout(): Promise<void> };
const AuthContext = createContext<AuthValue | null>(null);
export const useAuth = () => useContext(AuthContext)!;

function AuthProvider({ children }: { children: React.ReactNode }) {
  const query = useQuery({ queryKey: ['me'], queryFn: () => api<Envelope<UserContext>>('/auth/me'), retry: false });
  const refresh = useCallback(() => query.refetch(), [query.refetch]);
  const logout = useCallback(async () => { await api('/auth/logout', { method: 'POST' }); sessionStorage.removeItem('prospecta_csrf'); await query.refetch(); }, [query.refetch]);
  const value = useMemo<AuthValue>(() => ({ user: query.data?.data || null, loading: query.isLoading, refresh, logout }), [query.data?.data, query.isLoading, refresh, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function Protected() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <PageLoading />;
  return user ? <Outlet /> : <Navigate to="/login" state={{ from: location.pathname }} replace />;
}

const routeTitles: Record<string, string> = { '/': 'Visão geral', '/pipeline': 'Pipeline', '/empresas': 'Empresas', '/contatos': 'Contatos', '/tarefas': 'Tarefas', '/inbox': 'Inbox', '/chatbots': 'Chatbots', '/campanhas': 'Campanhas', '/automacoes': 'Automações', '/relatorios': 'Relatórios', '/email': 'E-mail', '/configuracoes': 'Configurações' };

function RouteTitle() {
  const location = useLocation();
  useEffect(() => {
    document.title = `${routeTitles[location.pathname] || 'Prospecta'} · CRM`;
  }, [location.pathname]);
  return null;
}

export function App() {
  return <AuthProvider><RouteTitle /><Suspense fallback={<PageLoading />}><Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/aceitar-convite" element={<InvitePage />} />
    <Route path="/redefinir-senha" element={<ResetPasswordPage />} />
    <Route element={<Protected />}>
      <Route element={<Shell />}>
        <Route index element={<DashboardPage />} />
        <Route path="pipeline" element={<PipelinePage />} />
        <Route path="empresas" element={<CompaniesPage />} />
        <Route path="contatos" element={<ContactsPage />} />
        <Route path="tarefas" element={<TasksPage />} />
        <Route path="inbox/:conversationId?" element={<InboxPage />} />
        <Route path="campanhas" element={<CampaignsPage />} />
        <Route path="chatbots" element={<ChatbotsPage />} />
        <Route path="automacoes" element={<AutomationsPage />} />
        <Route path="relatorios" element={<ReportsPage />} />
        <Route path="email" element={<EmailPage />} />
        <Route path="configuracoes" element={<SettingsPage />} />
      </Route>
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></Suspense></AuthProvider>;
}
