import { FormEvent, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import { AlertTriangle, BookOpen, BrainCircuit, Check, Copy, ExternalLink, FileText, KeyRound, LockKeyhole, Mail, MoreHorizontal, Network, Pencil, Play, Plus, QrCode, RefreshCw, RotateCcw, ShieldCheck, Smartphone, Trash2, Unplug, UploadCloud, UserPlus, Users } from 'lucide-react';
import { api, dateTime, type Envelope } from '../lib/api';
import { Button, Empty, Field, Modal, PageLoading, SelectField, Status } from '../components/ui';
import { useAuth } from '../App';
import { toast } from '../lib/toast';
import { UserAvatar } from '../components/UserAvatar';

type Team = { id: string; name: string; color: string; isDefault?: boolean; _count?: { memberships: number; conversations: number; instanceAccess: number } };
type User = { id: string; name: string; email: string; status: string; lastLoginAt?: string; profilePhotoId?: string | null; profilePhoto?: { createdAt?: string } | null; role: { id: string; key: string; name: string }; teams: Team[] };
type RolePermission = { resource: string; action: string; scope: 'ALL' | 'TEAM' | 'OWN' };
type Metadata = { teams: Team[]; roles: Array<{ id: string; key: string; name: string; permissions: RolePermission[] }> };
type Instance = { id: string; name: string; instanceKey: string; phone?: string; status: string; lastEventAt?: string; teams: Array<{ team: { name: string } }>; warmupProfile: { currentDailyCap: number; sentToday: number; maximumDailyCap: number }; _count?: { conversations: number } };
type InviteResult = { userId: string; email: string; teams: Team[]; inviteUrl: string; expiresInHours: number; emailDelivery: 'QUEUED' };
type UserMenu = { user: User; top: number; right: number };
type WebhookActionOption = { value: string; label: string; group: string };
type OutboundWebhook = {
  id: string;
  name: string;
  endpoint: string;
  action: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

function qrImageValue(value: unknown) {
  if (typeof value !== 'string') return '';
  const normalized = value.trim();
  if (normalized.startsWith('data:image/')) return normalized;
  if (/^[a-z0-9+/=\r\n]+$/i.test(normalized) && normalized.length > 256) {
    return `data:image/png;base64,${normalized.replace(/\s/g, '')}`;
  }
  return '';
}

export function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  if (requestedTab === 'api') return <Navigate to="/integracoes/api" replace />;
  if (requestedTab === 'webhooks') return <Navigate to="/integracoes/webhooks" replace />;
  if (requestedTab === 'api-docs') return <Navigate to="/integracoes/swagger" replace />;
  if (requestedTab === 'whatsapp') return <Navigate to="/conexoes" replace />;
  const tab = requestedTab && ['users', 'teams', 'roles'].includes(requestedTab) ? requestedTab : 'users';
  const selectTab = (next: string) => setSearchParams({ tab: next }, { replace: true });
  return <div className="settings-layout"><aside className="settings-nav"><button type="button" className={tab === 'users' ? 'active' : ''} onClick={() => selectTab('users')}><Users size={16} />Usuários</button><button type="button" className={tab === 'teams' ? 'active' : ''} onClick={() => selectTab('teams')}><Network size={16} />Equipes e filas</button><button type="button" className={tab === 'roles' ? 'active' : ''} onClick={() => selectTab('roles')}><ShieldCheck size={16} />Papéis e permissões</button></aside><section className="settings-content">{tab === 'users' && <UsersSettings />}{tab === 'teams' && <TeamsSettings />}{tab === 'roles' && <RolesSettings />}</section></div>;
}

export function ConnectionsPage() {
  return <section className="settings-content connections-settings-page"><WhatsappSettings /></section>;
}

const integrationSections = ['api', 'mcp', 'webhooks', 'swagger', 'ai'] as const;
type IntegrationSection = (typeof integrationSections)[number];

export function IntegrationsPage() {
  const { section } = useParams<{ section?: string }>();
  if (!section) return <Navigate to="/integracoes/api" replace />;
  if (!integrationSections.includes(section as IntegrationSection)) return <Navigate to="/integracoes/api" replace />;
  return <section className="settings-content integration-settings-page">
    {section === 'api' && <ApiSettings />}
    {section === 'mcp' && <McpSettings />}
    {section === 'webhooks' && <WebhookSettings />}
    {section === 'swagger' && <SwaggerDocsSettings />}
    {section === 'ai' && <AiSettings />}
  </section>;
}

type AiSettingsData = {
  enabled: boolean;
  globalInstructions: string;
  fallbackMessage: string;
  model: string;
  models: Array<{ id: string; name: string; description: string }>;
  apiKeyConfigured: boolean;
  apiKeySource: 'organization' | 'environment' | 'none';
  apiKeyLastFour: string | null;
  runtime: { available: boolean; reason?: string; provider: 'openai' };
};
type AiConfigTest = { id: string; status: string; result?: { reply?: string }; error?: string };
type AiKnowledgeDocument = {
  id: string;
  status: 'INDEXING' | 'READY' | 'FAILED' | 'DELETING';
  error?: string | null;
  indexedAt?: string | null;
  createdAt: string;
  mediaAsset: { id: string; filename: string; contentType: string; sizeBytes: number };
  createdBy?: { id: string; name: string } | null;
};
type AiSettingsForm = Pick<AiSettingsData, 'enabled' | 'globalInstructions' | 'fallbackMessage' | 'model'> & {
  apiKey: string;
  removeApiKey: boolean;
};

function AiSettings() {
  const client = useQueryClient();
  const settings = useQuery({ queryKey: ['ai-settings'], queryFn: () => api<Envelope<AiSettingsData>>('/settings/ai') });
  const [testGenerationId, setTestGenerationId] = useState<string | null>(null);
  const [form, setForm] = useState<AiSettingsForm | null>(null);
  const current = form || (settings.data ? {
    enabled: settings.data.data.enabled,
    globalInstructions: settings.data.data.globalInstructions,
    fallbackMessage: settings.data.data.fallbackMessage,
    model: settings.data.data.model,
    apiKey: '',
    removeApiKey: false,
  } : null);
  const save = useMutation({
    mutationFn: () => {
      if (!current) throw new Error('As configurações da IA ainda não foram carregadas');
      const apiKey = current.apiKey.trim();
      return api('/settings/ai', {
        method: 'PATCH',
        body: JSON.stringify({
          enabled: current.enabled,
          globalInstructions: current.globalInstructions,
          fallbackMessage: current.fallbackMessage,
          model: current.model,
          ...(apiKey ? { apiKey } : {}),
          ...(current.removeApiKey ? { removeApiKey: true } : {}),
        }),
      });
    },
    onSuccess: () => {
      toast.success('Configurações da IA atualizadas.');
      setForm(null);
      void client.invalidateQueries({ queryKey: ['ai-settings'] });
      void client.invalidateQueries({ queryKey: ['chatbot-metadata'] });
    },
  });
  const test = useMutation({
    mutationFn: () => api<Envelope<{ id: string }>>('/settings/ai/test', { method: 'POST', body: JSON.stringify({ message: 'Confirme em uma frase que a integração da OpenAI com o BZS One está pronta.' }) }),
    onSuccess: (result) => {
      setTestGenerationId(result.data.id);
      toast.success('Teste iniciado em segundo plano.');
    },
  });
  const testResult = useQuery({
    queryKey: ['ai-config-test', testGenerationId],
    queryFn: () => api<Envelope<AiConfigTest>>(`/settings/ai/tests/${testGenerationId}`),
    enabled: Boolean(testGenerationId),
    refetchInterval: (query) => ['COMPLETED', 'FAILED', 'CANCELLED'].includes(query.state.data?.data.status || '') ? false : 1_500,
  });
  useEffect(() => {
    if (testResult.data?.data.status === 'COMPLETED') toast.success(testResult.data.data.result?.reply || 'A OpenAI respondeu corretamente.');
    if (testResult.data?.data.status === 'FAILED') toast.error(testResult.data.data.error || 'O teste da IA falhou.');
  }, [testResult.data]);
  if (settings.isLoading || !current) return <PageLoading />;
  if (settings.error) return null;
  const runtime = settings.data!.data.runtime;
  let runtimeLabel = 'OpenAI não configurada';
  if (runtime.available) runtimeLabel = 'OpenAI configurada';
  else if (runtime.reason === 'disabled') runtimeLabel = 'IA desativada no servidor';
  const currentTest = testResult.data?.data;
  let testMessage = 'O modelo está processando o teste…';
  if (currentTest?.status === 'COMPLETED') testMessage = currentTest.result?.reply || 'A OpenAI respondeu corretamente.';
  if (currentTest?.status === 'FAILED') testMessage = currentTest.error || 'O teste da IA falhou.';
  const update = (values: Partial<typeof current>) => setForm({ ...current, ...values });
  const credentialStatus = (() => {
    if (current.removeApiKey) return 'A chave salva será removida ao salvar.';
    if (current.apiKey.trim()) return `Nova chave pronta para salvar ••••${current.apiKey.trim().slice(-4)}`;
    if (settings.data!.data.apiKeySource === 'organization') return `Chave salva com final ••••${settings.data!.data.apiKeyLastFour || '••••'}`;
    if (settings.data!.data.apiKeySource === 'environment') return 'Chave fornecida pelas variáveis do servidor.';
    return 'Nenhuma chave configurada.';
  })();
  return <div className="ai-settings-page">
    <div className="settings-heading">
      <div><h2>Inteligência artificial</h2><p>Resumos, sugestões e pré-atendimento processados pela API da OpenAI.</p></div>
      <div className={`ai-runtime-pill ${runtime.available ? 'online' : 'offline'}`}><span />{runtimeLabel}</div>
    </div>
    <div className="ai-settings-grid">
      <article className="ai-status-card">
        <div className="ai-status-icon"><BrainCircuit size={22} /></div>
        <div><span>Modelo configurado</span><strong>{settings.data!.data.models.find((model) => model.id === current.model)?.name || current.model}</strong><small>Processamento em nuvem pela API da OpenAI.</small></div>
      </article>
      <label className="ai-enable-card">
        <div><strong>Habilitar recursos de IA</strong><span>Libera resumos, sugestões e chatbots OpenAI para esta organização.</span></div>
        <input type="checkbox" checked={current.enabled} onChange={(event) => update({ enabled: event.target.checked })} />
      </label>
    </div>
    <section className="ai-provider-card">
      <div className="ai-provider-card-header">
        <div className="ai-provider-icon"><KeyRound size={19} /></div>
        <div><h3>Conexão com a OpenAI</h3><p>Escolha o modelo e armazene a credencial exclusiva desta organização.</p></div>
      </div>
      <div className="ai-provider-grid">
        <SelectField label="Modelo" value={current.model} onChange={(event) => update({ model: event.target.value })}>
          {settings.data!.data.models.map((model) => <option key={model.id} value={model.id}>{model.name} — {model.description}</option>)}
        </SelectField>
        <Field
          label="API Key da OpenAI"
          type="password"
          autoComplete="new-password"
          value={current.apiKey}
          onChange={(event) => update({ apiKey: event.target.value, removeApiKey: false })}
          placeholder={settings.data!.data.apiKeyConfigured ? 'Digite somente para substituir a chave atual' : 'sk-proj-…'}
        />
      </div>
      <div className={`ai-credential-status ${settings.data!.data.apiKeyConfigured && !current.removeApiKey ? 'configured' : ''}`}>
        <LockKeyhole size={15} />
        <span><strong>{credentialStatus}</strong>A chave é criptografada antes de ser salva e nunca volta a aparecer nesta tela.</span>
        {settings.data!.data.apiKeySource === 'organization' && !current.removeApiKey && !current.apiKey && <button type="button" onClick={() => update({ removeApiKey: true })}>Remover chave salva</button>}
        {current.removeApiKey && <button type="button" onClick={() => update({ removeApiKey: false })}>Desfazer</button>}
      </div>
    </section>
    <AiKnowledgeBase enabled={current.enabled} apiKeyConfigured={settings.data!.data.apiKeyConfigured && !current.removeApiKey} />
    <label className="field ai-textarea-field"><span>Instruções gerais da BZS</span><textarea rows={8} maxLength={10_000} value={current.globalInstructions} onChange={(event) => update({ globalInstructions: event.target.value })} placeholder="Tom de voz, produtos, limites comerciais e informações que a IA deve respeitar." /><small>{current.globalInstructions.length.toLocaleString('pt-BR')} / 10.000 caracteres</small></label>
    <label className="field ai-textarea-field"><span>Mensagem de indisponibilidade</span><textarea rows={3} maxLength={1_000} value={current.fallbackMessage} onChange={(event) => update({ fallbackMessage: event.target.value })} /><small>Enviada antes da transferência quando o pré-atendimento não puder continuar.</small></label>
    {testGenerationId && currentTest && <div className={`ai-test-result ${currentTest.status.toLowerCase()}`}><BrainCircuit size={16} /><span>{testMessage}</span></div>}
    <div className="ai-settings-actions"><Button variant="secondary" onClick={() => test.mutate()} loading={test.isPending || Boolean(testGenerationId && !['COMPLETED', 'FAILED', 'CANCELLED'].includes(testResult.data?.data.status || ''))} disabled={!settings.data!.data.enabled || !runtime.available || Boolean(form)} title={form ? 'Salve as alterações antes de testar' : undefined}><Play size={16} />Testar geração</Button><Button onClick={() => save.mutate()} loading={save.isPending}>Salvar configurações</Button></div>
  </div>;
}

const knowledgeMimeByExtension: Record<string, string> = {
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  html: 'text/html', htm: 'text/html', json: 'application/json', md: 'text/markdown', pdf: 'application/pdf',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', txt: 'text/plain',
};

const knowledgeStatusLabels: Record<AiKnowledgeDocument['status'], string> = {
  INDEXING: 'Indexando',
  READY: 'Pronto para uso',
  FAILED: 'Falha na indexação',
  DELETING: 'Removendo',
};

function knowledgeContentType(file: File) {
  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  return file.type || knowledgeMimeByExtension[extension] || 'application/octet-stream';
}

function formatFileSize(bytes: number) {
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(1)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

function AiKnowledgeBase({ enabled, apiKeyConfigured }: Readonly<{ enabled: boolean; apiKeyConfigured: boolean }>) {
  const client = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const documents = useQuery({
    queryKey: ['ai-knowledge-documents'],
    queryFn: () => api<Envelope<AiKnowledgeDocument[]>>('/settings/ai/documents'),
    refetchInterval: (query) => query.state.data?.data.some((document) => ['INDEXING', 'DELETING'].includes(document.status)) ? 3_000 : false,
  });
  const retry = useMutation({
    mutationFn: (id: string) => api(`/settings/ai/documents/${id}/retry`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('Reindexação iniciada.');
      void client.invalidateQueries({ queryKey: ['ai-knowledge-documents'] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/settings/ai/documents/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Documento sendo removido da base de conhecimento.');
      void client.invalidateQueries({ queryKey: ['ai-knowledge-documents'] });
    },
  });
  const addFiles = async (files: File[]) => {
    if (!files.length || uploading) return;
    if (!enabled || !apiKeyConfigured) {
      toast.error('Habilite a IA e salve uma chave da OpenAI antes de adicionar documentos.');
      return;
    }
    setUploading(true);
    let added = 0;
    let failed = 0;
    for (const file of files) {
      try {
        const contentType = knowledgeContentType(file);
        const created = await api<Envelope<{ id: string; uploadUrl: string }>>('/media/uploads', {
          method: 'POST',
          body: JSON.stringify({ filename: file.name, contentType, sizeBytes: file.size }),
        });
        const uploaded = await fetch(created.data.uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: file });
        if (!uploaded.ok) throw new Error(`Falha ao enviar ${file.name} para o armazenamento`);
        await api('/settings/ai/documents', { method: 'POST', body: JSON.stringify({ mediaAssetId: created.data.id }) });
        added += 1;
      } catch {
        failed += 1;
      }
    }
    setUploading(false);
    if (inputRef.current) inputRef.current.value = '';
    const addedLabel = added === 1 ? 'Documento adicionado' : `${added} documentos adicionados`;
    const failedLabel = failed === 1 ? 'Um documento não pôde ser adicionado.' : `${failed} documentos não puderam ser adicionados.`;
    if (added) toast.success(`${addedLabel}. A indexação continuará em segundo plano.`);
    if (failed) toast.error(failedLabel);
    void client.invalidateQueries({ queryKey: ['ai-knowledge-documents'] });
  };
  const items = documents.data?.data || [];
  const readyCount = items.filter((document) => document.status === 'READY').length;
  let documentContent = <div className="ai-knowledge-empty"><BookOpen size={20} /><div><strong>Nenhum documento adicionado</strong><span>A IA continuará usando apenas as instruções gerais e o contexto da conversa.</span></div></div>;
  if (documents.isLoading) {
    documentContent = <div className="ai-knowledge-loading"><RefreshCw className="spin" size={17} />Carregando documentos…</div>;
  } else if (items.length) {
    documentContent = <div className="ai-knowledge-list">
      {items.map((document) => <article key={document.id}>
        <div className="ai-knowledge-file-icon"><FileText size={18} /></div>
        <div className="ai-knowledge-file-main"><strong title={document.mediaAsset.filename}>{document.mediaAsset.filename}</strong><span>{formatFileSize(document.mediaAsset.sizeBytes)} · adicionado por {document.createdBy?.name || 'usuário removido'} em {dateTime(document.createdAt)}</span>{document.error && <small title={document.error}>{document.error}</small>}</div>
        <span className={`ai-knowledge-status ${document.status.toLowerCase()}`}><i />{knowledgeStatusLabels[document.status]}</span>
        <div className="ai-knowledge-actions">
          {document.status === 'FAILED' && <button type="button" onClick={() => retry.mutate(document.id)} disabled={retry.isPending} title="Tentar indexar novamente" aria-label={`Reindexar ${document.mediaAsset.filename}`}><RotateCcw size={16} /></button>}
          <button type="button" className="danger" onClick={() => { if (window.confirm(`Remover “${document.mediaAsset.filename}” da base de conhecimento?`)) remove.mutate(document.id); }} disabled={document.status === 'DELETING' || remove.isPending} title="Remover documento" aria-label={`Remover ${document.mediaAsset.filename}`}><Trash2 size={16} /></button>
        </div>
      </article>)}
    </div>;
  }
  return <section className="ai-knowledge-card">
    <div className="ai-provider-card-header">
      <div className="ai-provider-icon"><BookOpen size={19} /></div>
      <div><h3>Base de conhecimento</h3><p>Documentos consultados nas sugestões de resposta e no pré-atendimento automático.</p></div>
      <span className="ai-knowledge-count">{readyCount} {readyCount === 1 ? 'documento pronto' : 'documentos prontos'}</span>
    </div>
    <button
      type="button"
      className={`ai-knowledge-dropzone ${dragging ? 'dragging' : ''}`}
      onClick={() => inputRef.current?.click()}
      onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
      onDrop={(event) => { event.preventDefault(); setDragging(false); void addFiles([...event.dataTransfer.files]); }}
      disabled={uploading}
    >
      <UploadCloud size={23} />
      <span><strong>{uploading ? 'Enviando documentos…' : 'Arraste documentos ou clique para selecionar'}</strong><small>PDF, Word, PowerPoint PPTX, TXT, Markdown, HTML ou JSON · até 25 MB por arquivo</small></span>
    </button>
    <input ref={inputRef} type="file" multiple hidden accept=".pdf,.doc,.docx,.pptx,.txt,.md,.html,.htm,.json" onChange={(event) => void addFiles(Array.from(event.target.files || []))} />
    <div className="ai-knowledge-privacy"><ShieldCheck size={15} /><span>Os documentos são enviados à OpenAI para indexação vetorial. O BZS One mantém a cópia original no armazenamento interno e remove ambas ao excluir.</span></div>
    {documentContent}
  </section>;
}

function UsersSettings() {
  const client = useQueryClient();
  const { user: currentUser } = useAuth();
  const [modal, setModal] = useState(false);
  const [invite, setInvite] = useState<InviteResult | null>(null);
  const [editing, setEditing] = useState<User | null>(null);
  const [deleting, setDeleting] = useState<User | null>(null);
  const [menu, setMenu] = useState<UserMenu | null>(null);
  const users = useQuery({ queryKey: ['users'], queryFn: () => api<Envelope<User[]>>('/users') });
  const metadata = useQuery({ queryKey: ['user-metadata'], queryFn: () => api<Envelope<Metadata>>('/users/metadata') });
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ['users'] });
    void client.invalidateQueries({ queryKey: ['me'] });
  };
  const openMenu = (event: React.MouseEvent<HTMLButtonElement>, user: User) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const menuHeight = currentUser?.userId === user.id ? 54 : 100;
    const top = rect.bottom + menuHeight + 10 > window.innerHeight ? rect.top - menuHeight - 6 : rect.bottom + 6;
    setMenu({ user, top: Math.max(10, top), right: Math.max(12, window.innerWidth - rect.right) });
  };
  if (users.isLoading || metadata.isLoading) return <PageLoading />;
  if (users.error || metadata.error) return null;
  const settingsMetadata = metadata.data!.data;
  return <>
    <div className="settings-heading">
      <div><h2>Usuários e equipes</h2><p>Gerencie quem acessa a plataforma e o escopo de dados.</p></div>
      <Button onClick={() => setModal(true)}><UserPlus size={15} />Convidar usuário</Button>
    </div>
    <div className="settings-table"><table>
      <thead><tr><th>Usuário</th><th>Papel</th><th>Equipes</th><th>Status</th><th>Último acesso</th><th /></tr></thead>
      <tbody>{users.data?.data.map((user) => <tr key={user.id}>
        <td><div className="entity-cell"><UserAvatar user={user} className="contact-avatar" /><div><strong>{user.name}</strong><small>{user.email}</small></div></div></td>
        <td>{user.role.name}</td>
        <td><div className="team-badge-list">{user.teams.length ? user.teams.map((team) => <span key={team.id} className="team-badge" style={{ '--team-color': team.color } as React.CSSProperties}><i />{team.name}</span>) : <span className="team-badge neutral"><i />Sem equipe</span>}</div></td>
        <td><Status value={user.status} /></td>
        <td>{dateTime(user.lastLoginAt)}</td>
        <td className="user-actions-cell"><button type="button" className="icon-button" onClick={(event) => openMenu(event, user)} aria-label={`Ações de ${user.name}`} aria-haspopup="menu" aria-expanded={menu?.user.id === user.id}><MoreHorizontal size={17} /></button></td>
      </tr>)}</tbody>
    </table></div>
    {menu && <>
      <button type="button" className="action-menu-backdrop" onClick={() => setMenu(null)} aria-label="Fechar menu de ações" />
      <div className="contact-action-menu user-action-menu" role="menu" style={{ top: menu.top, right: menu.right }}>
        <button type="button" role="menuitem" onClick={() => { setEditing(menu.user); setMenu(null); }}><Pencil size={16} />Editar usuário</button>
        {currentUser?.userId !== menu.user.id && <button type="button" className="danger" role="menuitem" onClick={() => { setDeleting(menu.user); setMenu(null); }}><Trash2 size={16} />Excluir usuário</button>}
      </div>
    </>}
    {modal && <InviteModal metadata={settingsMetadata} onClose={() => setModal(false)} onCreated={(result) => { setModal(false); setInvite(result); refresh(); }} />}
    {invite && <InviteSentModal invite={invite} onClose={() => setInvite(null)} />}
    {editing && <EditUserModal user={editing} metadata={settingsMetadata} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />}
    {deleting && <DeleteUserModal user={deleting} onClose={() => setDeleting(null)} onDeleted={() => { setDeleting(null); refresh(); }} />}
  </>;
}

function TeamsSettings() {
  const client = useQueryClient();
  const [editing, setEditing] = useState<Team | null | undefined>(undefined);
  const teams = useQuery({ queryKey: ['teams'], queryFn: () => api<Envelope<Team[]>>('/teams') });
  const remove = useMutation({
    mutationFn: (team: Team) => api(`/teams/${team.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Equipe excluída. Os tickets permaneceram com atendente e status preservados.');
      void client.invalidateQueries({ queryKey: ['teams'] });
      void client.invalidateQueries({ queryKey: ['user-metadata'] });
      void client.invalidateQueries({ queryKey: ['users'] });
      void client.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
  if (teams.isLoading) return <PageLoading />;
  if (teams.error) return null;
  const refresh = () => {
    setEditing(undefined);
    void client.invalidateQueries({ queryKey: ['teams'] });
    void client.invalidateQueries({ queryKey: ['user-metadata'] });
  };
  return <>
    <div className="settings-heading"><div><h2>Equipes e filas</h2><p>Crie setores, escolha uma cor e associe cada usuário a quantas filas precisar.</p></div><Button onClick={() => setEditing(null)}><Plus size={16} />Nova equipe</Button></div>
    <div className="settings-table"><table><thead><tr><th>Equipe</th><th>Usuários</th><th>Tickets</th><th>Conexões</th><th /></tr></thead><tbody>{teams.data?.data.map((team) => <tr key={team.id}>
      <td><div className="team-name-cell"><span className="team-color-dot" style={{ backgroundColor: team.color }} /><div><strong>{team.name}</strong><small>{team.color}{team.isDefault ? ' · fila padrão protegida' : ''}</small></div></div></td>
      <td>{team._count?.memberships || 0}</td><td>{team._count?.conversations || 0}</td><td>{team._count?.instanceAccess || 0}</td>
      <td><div className="table-row-actions"><Button variant="secondary" onClick={() => setEditing(team)}><Pencil size={14} />Editar</Button><button type="button" className="icon-button danger-icon" disabled={team.isDefault || remove.isPending} title={team.isDefault ? 'A equipe Geral não pode ser excluída' : 'Excluir equipe'} onClick={() => { if (window.confirm(`Excluir a equipe “${team.name}”? Os tickets ficarão sem fila.`)) remove.mutate(team); }}><Trash2 size={17} /></button></div></td>
    </tr>)}</tbody></table></div>
    {editing !== undefined && <TeamModal team={editing} onClose={() => setEditing(undefined)} onSaved={refresh} />}
  </>;
}

function TeamModal({ team, onClose, onSaved }: Readonly<{ team: Team | null; onClose(): void; onSaved(): void }>) {
  const [form, setForm] = useState({ name: team?.name || '', color: team?.color || '#64748b' });
  const mutation = useMutation({
    mutationFn: () => api(team ? `/teams/${team.id}` : '/teams', { method: team ? 'PATCH' : 'POST', body: JSON.stringify(form) }),
    onSuccess: () => { toast.success(team ? 'Equipe atualizada.' : 'Equipe criada.'); onSaved(); },
  });
  return <Modal title={team ? 'Editar equipe' : 'Nova equipe'} onClose={onClose}><form className="modal-form" onSubmit={(event: FormEvent) => { event.preventDefault(); mutation.mutate(); }}>
    <Field label="Nome" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
    <label className="field"><span>Cor de identificação</span><div className="team-color-input"><input type="color" value={form.color} onChange={(event) => setForm({ ...form, color: event.target.value })} /><input value={form.color} pattern="#[0-9a-fA-F]{6}" onChange={(event) => setForm({ ...form, color: event.target.value })} required /></div><small>Usada nos tickets e nos usuários.</small></label>
    <div className="modal-actions"><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" loading={mutation.isPending}>Salvar equipe</Button></div>
  </form></Modal>;
}

const permissionRows = [
  ['companies', 'Empresas'], ['contacts', 'Contatos'], ['opportunities', 'Oportunidades'], ['tasks', 'Tarefas'],
  ['conversations', 'Conversas'], ['campaigns', 'Campanhas'], ['workflows', 'Automações'], ['reports', 'Relatórios'],
  ['users', 'Usuários'], ['integrations', 'Integrações'], ['api_keys', 'Chaves de API'], ['webhooks', 'Webhooks'],
] as const;

function RolesSettings() {
  const client = useQueryClient();
  const [editing, setEditing] = useState<Metadata['roles'][number] | null>(null);
  const metadata = useQuery({ queryKey: ['user-metadata'], queryFn: () => api<Envelope<Metadata>>('/users/metadata') });
  if (metadata.isLoading) return <PageLoading />;
  return <><div className="settings-heading"><div><h2>Papéis e permissões</h2><p>Defina funcionalidades e escopo de dados para cada papel.</p></div></div><div className="settings-table"><table><thead><tr><th>Papel</th><th>Tipo</th><th>Permissões</th><th /></tr></thead><tbody>{metadata.data?.data.roles.map((role) => <tr key={role.id}><td><strong>{role.name}</strong></td><td>{role.key === 'admin' ? 'Protegido' : 'Customizável'}</td><td>{role.permissions.some((item) => item.resource === '*') ? 'Acesso global' : `${role.permissions.length} regras`}</td><td><Button variant="secondary" disabled={role.key === 'admin'} onClick={() => setEditing(role)}>Configurar</Button></td></tr>)}</tbody></table></div>{editing && <RolePermissionsModal role={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void client.invalidateQueries({ queryKey: ['user-metadata'] }); }} />}</>;
}

function RolePermissionsModal({ role, onClose, onSaved }: Readonly<{ role: Metadata['roles'][number]; onClose(): void; onSaved(): void }>) {
  const initial = Object.fromEntries(permissionRows.flatMap(([resource]) => ['read', 'write', ...(resource === 'campaigns' ? ['launch'] : [])].map((action) => {
    const permission = role.permissions.find((item) => (item.resource === resource || item.resource === '*') && (item.action === action || item.action === '*'));
    return [`${resource}:${action}`, permission?.scope || 'NONE'];
  }))) as Record<string, string>;
  const [scopes, setScopes] = useState(initial);
  const mutation = useMutation({ mutationFn: () => api(`/users/roles/${role.id}/permissions`, { method: 'PUT', body: JSON.stringify({ permissions: Object.entries(scopes).filter(([, scope]) => scope !== 'NONE').map(([key, scope]) => { const [resource, action] = key.split(':'); return { resource, action, scope }; }) }) }), onSuccess: () => { toast.success('Permissões atualizadas.'); onSaved(); } });
  return <Modal title={`Permissões · ${role.name}`} onClose={onClose}><div className="settings-table permissions-table"><table><thead><tr><th>Funcionalidade</th><th>Leitura</th><th>Alteração</th><th>Extra</th></tr></thead><tbody>{permissionRows.map(([resource, label]) => <tr key={resource}><td><strong>{label}</strong></td>{['read', 'write'].map((action) => <td key={action}><select value={scopes[`${resource}:${action}`]} onChange={(event) => setScopes({ ...scopes, [`${resource}:${action}`]: event.target.value })}><option value="NONE">Sem acesso</option><option value="OWN">Próprios</option><option value="TEAM">Equipe</option><option value="ALL">Todos</option></select></td>)}<td>{resource === 'campaigns' ? <select value={scopes['campaigns:launch']} onChange={(event) => setScopes({ ...scopes, 'campaigns:launch': event.target.value })}><option value="NONE">Não inicia</option><option value="OWN">Próprios</option><option value="TEAM">Equipe</option><option value="ALL">Todos</option></select> : '—'}</td></tr>)}</tbody></table></div><div className="modal-actions"><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={mutation.isPending} onClick={() => mutation.mutate()}>Salvar permissões</Button></div></Modal>;
}

function InviteModal({ metadata, onClose, onCreated }: Readonly<{ metadata: Metadata; onClose(): void; onCreated(result: InviteResult): void }>) {
  const [form, setForm] = useState({ name: '', email: '', roleId: metadata.roles[0]?.id || '', teamIds: metadata.teams.filter((team) => team.isDefault).map((team) => team.id) });
  const mutation = useMutation({ mutationFn: () => api<Envelope<InviteResult>>('/users/invite', { method: 'POST', body: JSON.stringify(form) }), onSuccess: (result) => { toast.success(`Convite enviado para ${result.data.email}.`); onCreated(result.data); } });
  return <Modal title="Convidar usuário" onClose={onClose}><form className="modal-form" onSubmit={(event: FormEvent) => { event.preventDefault(); mutation.mutate(); }}><Field label="Nome" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /><Field label="E-mail" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /><SelectField label="Papel" value={form.roleId} onChange={(event) => setForm({ ...form, roleId: event.target.value })}>{metadata.roles.map((role) => <option value={role.id} key={role.id}>{role.name}</option>)}</SelectField><TeamMultiSelect teams={metadata.teams} value={form.teamIds} onChange={(teamIds) => setForm({ ...form, teamIds })} /><div className="consent-note"><Mail size={17} /><p><strong>Envio automático por e-mail</strong><span>O usuário receberá um convite pessoal para criar a senha. O link será válido por 72 horas.</span></p></div><div className="modal-actions"><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" loading={mutation.isPending}>Enviar convite</Button></div></form></Modal>;
}

function EditUserModal({ user, metadata, onClose, onSaved }: Readonly<{ user: User; metadata: Metadata; onClose(): void; onSaved(): void }>) {
  const [form, setForm] = useState({
    name: user.name,
    email: user.email,
    roleId: user.role.id,
    teamIds: user.teams.map((team) => team.id),
  });
  const mutation = useMutation({
    mutationFn: () => api<Envelope<User>>(`/users/${user.id}`, {
      method: 'PATCH',
      body: JSON.stringify(form),
    }),
    onSuccess: () => { toast.success('Usuário atualizado.'); onSaved(); },
  });
  return <Modal title="Editar usuário" onClose={onClose}>
    <form className="modal-form" onSubmit={(event: FormEvent) => { event.preventDefault(); mutation.mutate(); }}>
      <Field label="Nome" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
      <Field label="E-mail" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
      <SelectField label="Papel" value={form.roleId} onChange={(event) => setForm({ ...form, roleId: event.target.value })}>
          {metadata.roles.map((role) => <option value={role.id} key={role.id}>{role.name}</option>)}
      </SelectField>
      <TeamMultiSelect teams={metadata.teams} value={form.teamIds} onChange={(teamIds) => setForm({ ...form, teamIds })} />
      <div className="modal-actions">
        <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button type="submit" loading={mutation.isPending}><Pencil size={16} />Salvar alterações</Button>
      </div>
    </form>
  </Modal>;
}

function TeamMultiSelect({ teams, value, onChange }: Readonly<{ teams: Team[]; value: string[]; onChange(teamIds: string[]): void }>) {
  return <fieldset className="team-multi-select"><legend>Equipes e filas</legend><div>{teams.map((team) => <label key={team.id}><input type="checkbox" checked={value.includes(team.id)} onChange={(event) => onChange(event.target.checked ? [...value, team.id] : value.filter((id) => id !== team.id))} /><span className="team-color-dot" style={{ backgroundColor: team.color }} /><strong>{team.name}</strong>{team.isDefault && <small>Padrão</small>}</label>)}</div><p>Selecione todas as filas que este usuário poderá visualizar e receber.</p></fieldset>;
}

function DeleteUserModal({ user, onClose, onDeleted }: Readonly<{ user: User; onClose(): void; onDeleted(): void }>) {
  const mutation = useMutation({
    mutationFn: () => api(`/users/${user.id}`, { method: 'DELETE' }),
    onSuccess: () => { toast.success('Usuário excluído e acesso revogado.'); onDeleted(); },
  });
  return <Modal title="Excluir usuário" onClose={onClose}>
    <div className="delete-confirm">
      <div className="delete-confirm-icon"><Trash2 size={22} /></div>
      <div>
        <h3>Excluir “{user.name}”?</h3>
        <p>O acesso será revogado imediatamente. Atendimentos abertos voltarão para a fila e tarefas e carteiras ficarão sem responsável.</p>
        <small>Históricos, mensagens e registros de auditoria serão preservados.</small>
      </div>
    </div>
    <div className="modal-actions delete-actions">
      <Button variant="secondary" onClick={onClose}>Cancelar</Button>
      <Button variant="danger" loading={mutation.isPending} onClick={() => mutation.mutate()}><Trash2 size={16} />Excluir usuário</Button>
    </div>
  </Modal>;
}

function WhatsappSettings() {
  const client = useQueryClient();
  const [modal, setModal] = useState(false);
  const [qr, setQr] = useState('');
  const [disconnecting, setDisconnecting] = useState<Instance | null>(null);
  const [deleting, setDeleting] = useState<Instance | null>(null);
  const instances = useQuery({ queryKey: ['instances'], queryFn: () => api<Envelope<Instance[]>>('/whatsapp/instances') });
  const metadata = useQuery({ queryKey: ['user-metadata'], queryFn: () => api<Envelope<Metadata>>('/users/metadata') });
  const connect = useMutation({
    mutationFn: (id: string) => api<Envelope<{ qrcode: unknown }>>(`/whatsapp/instances/${id}/connect`, { method: 'POST' }),
    onSuccess: (result) => {
      const value = qrImageValue(result.data.qrcode);
      if (!value) {
        toast.error('A Evolution não retornou uma imagem válida para o QR Code.');
        return;
      }
      setQr(value);
      toast.success('QR Code gerado.');
      void client.invalidateQueries({ queryKey: ['instances'] });
    },
  });
  const disconnect = useMutation({
    mutationFn: (id: string) => api(`/whatsapp/instances/${id}/logout`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('Número desconectado do WhatsApp.');
      setDisconnecting(null);
      void client.invalidateQueries({ queryKey: ['instances'] });
      void client.invalidateQueries({ queryKey: ['conversation-instances'] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/whatsapp/instances/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Conexão do WhatsApp excluída.');
      setDeleting(null);
      void client.invalidateQueries({ queryKey: ['instances'] });
      void client.invalidateQueries({ queryKey: ['conversation-instances'] });
    },
  });
  if (instances.isLoading || metadata.isLoading) return <PageLoading />;
  return <>
    <div className="settings-heading"><div><h2>Números do WhatsApp</h2><p>Instâncias Evolution API acessíveis pelas equipes.</p></div><Button onClick={() => setModal(true)}><Plus size={16} />Adicionar número</Button></div>
    <div className="instance-list">{instances.data?.data.length ? instances.data.data.map((instance) => <article key={instance.id}>
      <div className="instance-icon"><Smartphone size={22} /></div>
      <div className="instance-info"><div><strong>{instance.name}</strong><Status value={instance.status} /></div><p>{instance.phone || instance.instanceKey}</p><small>{instance.teams.map((item) => item.team.name).join(', ') || 'Sem equipe'} · Último evento {dateTime(instance.lastEventAt)}</small></div>
      <div className="warmup-meter"><span>Aquecimento</span><div><i style={{ width: `${Math.min((instance.warmupProfile.sentToday / Math.max(instance.warmupProfile.currentDailyCap, 1)) * 100, 100)}%` }} /></div><small>{instance.warmupProfile.sentToday} / {instance.warmupProfile.currentDailyCap} hoje</small></div>
      <div className="instance-actions">
        <Button variant="secondary" onClick={() => connect.mutate(instance.id)} loading={connect.isPending && connect.variables === instance.id}><QrCode size={16} />{instance.status === 'CONNECTED' ? 'Novo QR' : 'Conectar'}</Button>
        {instance.status === 'CONNECTED' && <Button variant="secondary" onClick={() => setDisconnecting(instance)}><Unplug size={16} />Desconectar</Button>}
        <button type="button" className="icon-button danger-icon" onClick={() => setDeleting(instance)} aria-label={`Excluir conexão ${instance.name}`} title="Excluir conexão"><Trash2 size={18} /></button>
      </div>
    </article>) : <Empty icon={<Smartphone />} title="Nenhum número conectado" description="Adicione uma instância Baileys e escaneie o QR Code pelo WhatsApp." />}</div>
    {modal && <InstanceModal teams={metadata.data!.data.teams} onClose={() => setModal(false)} onCreated={(qrcode) => {
      setModal(false);
      if (qrcode) setQr(qrcode);
      void client.invalidateQueries({ queryKey: ['instances'] });
    }} />}
    {qr && <QrModal value={qr} onClose={() => setQr('')} />}
    {disconnecting && <DisconnectInstanceModal instance={disconnecting} loading={disconnect.isPending} onClose={() => setDisconnecting(null)} onConfirm={() => disconnect.mutate(disconnecting.id)} />}
    {deleting && <DeleteInstanceModal instance={deleting} loading={remove.isPending} onClose={() => setDeleting(null)} onConfirm={() => remove.mutate(deleting.id)} />}
  </>;
}

function DisconnectInstanceModal({ instance, loading, onClose, onConfirm }: Readonly<{ instance: Instance; loading: boolean; onClose(): void; onConfirm(): void }>) {
  return <Modal title="Desconectar número do WhatsApp" onClose={onClose}><div className="delete-confirm"><div className="disconnect-confirm-icon"><Unplug size={22} /></div><div><h3>Desconectar “{instance.name}”?</h3><p>O número deixará de receber e enviar mensagens pelo sistema até ser conectado novamente por QR Code.</p><small>A conexão e todo o histórico de conversas serão preservados.</small></div></div><div className="modal-actions delete-actions"><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button variant="danger" loading={loading} onClick={onConfirm}><Unplug size={16} />Desconectar número</Button></div></Modal>;
}

function DeleteInstanceModal({ instance, loading, onClose, onConfirm }: Readonly<{ instance: Instance; loading: boolean; onClose(): void; onConfirm(): void }>) {
  return <Modal title="Excluir conexão do WhatsApp" onClose={onClose}><div className="delete-confirm"><div className="delete-confirm-icon"><Trash2 size={22} /></div><div><h3>Excluir “{instance.name}”?</h3><p>A sessão será removida da Evolution API e deixará de aparecer nas conexões. Conversas já registradas serão preservadas no histórico.</p>{instance._count?.conversations ? <small>{instance._count.conversations} conversa(s) permanecerão no CRM.</small> : null}</div></div><div className="modal-actions delete-actions"><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button variant="danger" loading={loading} onClick={onConfirm}><Trash2 size={16} />Excluir conexão</Button></div></Modal>;
}

function InstanceModal({ teams, onClose, onCreated }: Readonly<{ teams: Metadata['teams']; onClose(): void; onCreated(qr?: string): void }>) {
  const [form, setForm] = useState({ name: '', instanceKey: '', teamId: teams[0]?.id || '' });
  const mutation = useMutation({ mutationFn: () => api<Envelope<any>>('/whatsapp/instances', { method: 'POST', body: JSON.stringify({ name: form.name, instanceKey: form.instanceKey, teamIds: [form.teamId] }) }), onSuccess: (result) => { toast.success('Conexão criada. Escaneie o QR Code.'); onCreated(qrImageValue(result.data.qrcode)); } });
  return <Modal title="Adicionar número" onClose={onClose}><form className="modal-form" onSubmit={(event: FormEvent) => { event.preventDefault(); mutation.mutate(); }}><Field label="Nome da caixa" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Ex.: Comercial SP" required /><Field label="Identificador da instância" value={form.instanceKey} onChange={(event) => setForm({ ...form, instanceKey: event.target.value.replace(/[^a-zA-Z0-9_-]/g, '') })} placeholder="comercial-sp" required /><SelectField label="Equipe principal" value={form.teamId} onChange={(event) => setForm({ ...form, teamId: event.target.value })}>{teams.map((team) => <option value={team.id} key={team.id}>{team.name}</option>)}</SelectField><div className="risk-note"><AlertTriangle size={16} /><span>A conexão por QR pode sofrer restrições do WhatsApp. Use consentimento e aquecimento.</span></div><div className="modal-actions"><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" loading={mutation.isPending}>Criar e conectar</Button></div></form></Modal>;
}

function QrModal({ value, onClose }: Readonly<{ value: string; onClose(): void }>) { return <Modal title="Conectar WhatsApp" onClose={onClose}><div className="qr-content"><img src={value} alt="QR Code de conexão" /><h3>Escaneie pelo WhatsApp</h3><p>Abra Aparelhos conectados → Conectar um aparelho. O código expira em aproximadamente 30 segundos.</p></div></Modal>; }

function ApiSettings() {
  const [key, setKey] = useState('');
  const createKey = useMutation({ mutationFn: () => api<Envelope<{ token: string }>>('/users/api-keys', { method: 'POST', body: JSON.stringify({ name: 'Integração principal', scopes: ['companies:read', 'companies:write', 'contacts:read', 'contacts:write', 'opportunities:read', 'opportunities:write'] }) }), onSuccess: (result) => { toast.success('Chave de API criada. Copie e guarde em local seguro.'); setKey(result.data.token); } });
  return <><div className="settings-heading"><div><h2>API</h2><p>Gerencie as credenciais usadas por sistemas externos para acessar o BZS One.</p></div></div><div className="settings-card"><div className="settings-card-icon"><KeyRound /></div><div><h3>Chaves de API</h3><p>Chaves são exibidas uma única vez. Revogue imediatamente se houver exposição.</p>{key && <code className="secret-output">{key}</code>}</div><Button variant="secondary" onClick={() => createKey.mutate()} loading={createKey.isPending}>Gerar chave</Button></div></>;
}

function McpSettings() {
  const [key, setKey] = useState('');
  const localDefault = `${window.location.protocol}//${window.location.hostname}:3100/mcp`;
  const endpoint = import.meta.env.VITE_MCP_URL
    || (window.location.port === '5173' ? localDefault : `${window.location.origin}/mcp`);
  const createKey = useMutation({
    mutationFn: () => api<Envelope<{ token: string }>>('/users/api-keys', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Servidor MCP',
        scopes: [
          'companies:read', 'companies:write',
          'contacts:read', 'contacts:write',
          'opportunities:read', 'opportunities:write',
          'tasks:read', 'tasks:write',
        ],
      }),
    }),
    onSuccess: (result) => {
      toast.success('Chave MCP criada. Ela será exibida somente agora.');
      setKey(result.data.token);
    },
  });
  const config = JSON.stringify({
    mcpServers: {
      'bzs-one': {
        type: 'http',
        url: endpoint,
        headers: {
          Authorization: `Bearer ${key || 'SUA_CHAVE_MCP'}`,
        },
      },
    },
  }, null, 2);
  const copy = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copiado.`);
  };

  return <div className="mcp-settings">
    <div className="settings-heading">
      <div><h2>Servidor MCP</h2><p>Conecte LLMs ao BZS One com acesso controlado às informações do CRM.</p></div>
      <Button onClick={() => createKey.mutate()} loading={createKey.isPending}><KeyRound size={16} />Gerar chave MCP</Button>
    </div>
    <div className="settings-card mcp-endpoint-card">
      <div className="settings-card-icon"><Network /></div>
      <div><h3>Endpoint Streamable HTTP</h3><p>Use uma chave exclusiva para cada cliente de IA.</p><code className="secret-output">{endpoint}</code></div>
      <Button variant="secondary" onClick={() => void copy(endpoint, 'Endpoint')}><Copy size={16} />Copiar</Button>
    </div>
    {key && <div className="mcp-key-warning">
      <AlertTriangle size={18} />
      <div><strong>Guarde esta chave agora</strong><span>Ela não poderá ser consultada novamente depois que você sair desta tela.</span><code className="secret-output">{key}</code></div>
      <Button variant="secondary" onClick={() => void copy(key, 'Chave')}><Copy size={16} />Copiar chave</Button>
    </div>}
    <div className="mcp-config-card">
      <div><h3>Exemplo de configuração</h3><p>O formato exato pode variar conforme o cliente MCP, mas o endpoint e o cabeçalho Bearer são os mesmos.</p></div>
      <pre><code>{config}</code></pre>
      <Button variant="secondary" onClick={() => void copy(config, 'Configuração')}><Copy size={16} />Copiar configuração</Button>
    </div>
  </div>;
}

function WebhookSettings() {
  const client = useQueryClient();
  const [editor, setEditor] = useState<OutboundWebhook | 'new' | null>(null);
  const [deleting, setDeleting] = useState<OutboundWebhook | null>(null);
  const [webhookSecret, setWebhookSecret] = useState('');
  const webhooks = useQuery({
    queryKey: ['outbound-webhooks'],
    queryFn: () => api<Envelope<OutboundWebhook[]>>('/outbound-webhooks'),
  });
  const actions = useQuery({
    queryKey: ['outbound-webhook-actions'],
    queryFn: () => api<Envelope<WebhookActionOption[]>>('/outbound-webhook-actions'),
  });
  const toggle = useMutation({
    mutationFn: ({ webhook, enabled }: { webhook: OutboundWebhook; enabled: boolean }) =>
      api(`/outbound-webhooks/${webhook.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled }),
      }),
    onSuccess: (_result, variables) => {
      toast.success(variables.enabled ? 'Webhook ativado.' : 'Webhook desativado.');
      void client.invalidateQueries({ queryKey: ['outbound-webhooks'] });
    },
  });
  if (webhooks.isLoading || actions.isLoading) return <PageLoading />;
  if (webhooks.error || actions.error) return null;
  const actionOptions = actions.data?.data || [];
  const actionLabels = new Map(actionOptions.map((action) => [action.value, action.label]));
  const items = webhooks.data?.data || [];
  const refresh = () => void client.invalidateQueries({ queryKey: ['outbound-webhooks'] });
  return <>
    <div className="settings-heading webhook-heading">
      <div><h2>Webhooks</h2><p>Acione endpoints externos quando uma ação acontecer no BZS One.</p></div>
      <Button onClick={() => setEditor('new')}><Plus size={16} />Novo webhook</Button>
    </div>
    {webhookSecret && <div className="webhook-secret">
      <div><strong>Segredo de assinatura</strong><p>Copie agora. Ele não será mostrado novamente.</p></div>
      <code>{webhookSecret}</code>
      <Button variant="secondary" onClick={() => void navigator.clipboard.writeText(webhookSecret).then(() => toast.success('Segredo copiado.'))}><Copy size={15} />Copiar</Button>
      <button type="button" className="icon-button" onClick={() => setWebhookSecret('')} aria-label="Ocultar segredo">×</button>
    </div>}
    {items.length === 0
      ? <Empty icon={<RefreshCw />} title="Nenhum webhook configurado" description="Crie o primeiro webhook e escolha qual ação deve chamar o endpoint." action={<Button onClick={() => setEditor('new')}><Plus size={15} />Criar webhook</Button>} />
      : <div className="webhook-list">{items.map((webhook) => <article className={`webhook-card${webhook.enabled ? ' active' : ''}`} key={webhook.id}>
        <div className="webhook-card-icon"><RefreshCw size={18} /></div>
        <div className="webhook-card-content">
          <div><h3>{webhook.name}</h3><Status value={webhook.enabled ? 'active' : 'inactive'} /></div>
          <p><span className="webhook-method">GET</span><strong>{actionLabels.get(webhook.action) || webhook.action}</strong></p>
          <code title={webhook.endpoint}>{webhook.endpoint}</code>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={webhook.enabled}
          className={`webhook-switch${webhook.enabled ? ' active' : ''}`}
          onClick={() => toggle.mutate({ webhook, enabled: !webhook.enabled })}
          disabled={toggle.isPending}
          title={webhook.enabled ? 'Desativar webhook' : 'Ativar webhook'}
        ><span /></button>
        <div className="webhook-card-actions">
          <button type="button" className="icon-button" onClick={() => setEditor(webhook)} aria-label={`Editar ${webhook.name}`} title="Editar"><Pencil size={16} /></button>
          <button type="button" className="icon-button danger" onClick={() => setDeleting(webhook)} aria-label={`Excluir ${webhook.name}`} title="Excluir"><Trash2 size={16} /></button>
        </div>
      </article>)}</div>}
    {editor && <WebhookEditorModal
      webhook={editor === 'new' ? undefined : editor}
      actions={actionOptions}
      onClose={() => setEditor(null)}
      onSaved={(secret) => {
        setEditor(null);
        if (secret) setWebhookSecret(secret);
        refresh();
      }}
    />}
    {deleting && <DeleteWebhookModal
      webhook={deleting}
      onClose={() => setDeleting(null)}
      onDeleted={() => {
        setDeleting(null);
        refresh();
      }}
    />}
  </>;
}

function WebhookEditorModal({
  webhook,
  actions,
  onClose,
  onSaved,
}: Readonly<{
  webhook?: OutboundWebhook;
  actions: WebhookActionOption[];
  onClose(): void;
  onSaved(secret?: string): void;
}>) {
  const [form, setForm] = useState({
    name: webhook?.name || '',
    endpoint: webhook?.endpoint || '',
    action: webhook?.action || actions[0]?.value || '',
  });
  const mutation = useMutation({
    mutationFn: () => api<Envelope<{ secret?: string }>>(
      webhook ? `/outbound-webhooks/${webhook.id}` : '/outbound-webhooks',
      {
        method: webhook ? 'PATCH' : 'POST',
        body: JSON.stringify(form),
      },
    ),
    onSuccess: (result) => {
      toast.success(webhook ? 'Webhook atualizado.' : 'Webhook criado desativado.');
      onSaved(result.data.secret);
    },
  });
  const groups = [...new Set(actions.map((action) => action.group))];
  const submit = (event: FormEvent) => {
    event.preventDefault();
    mutation.mutate();
  };
  return <Modal title={webhook ? 'Editar webhook' : 'Criar webhook'} onClose={onClose}>
    <form className="modal-form webhook-form" onSubmit={submit}>
      <Field label="Nome do webhook" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Ex.: Novo contato no ERP" required maxLength={120} autoFocus />
      <SelectField label="Ação que fará a chamada" value={form.action} onChange={(event) => setForm({ ...form, action: event.target.value })} required>
        {groups.map((group) => <optgroup key={group} label={group}>
          {actions.filter((action) => action.group === group).map((action) => <option key={action.value} value={action.value}>{action.label}</option>)}
        </optgroup>)}
      </SelectField>
      <Field label="Endpoint da chamada GET" type="url" value={form.endpoint} onChange={(event) => setForm({ ...form, endpoint: event.target.value })} placeholder="https://seu-sistema.com/webhooks/entrada" hint="Parâmetros da ação e do registro serão adicionados à URL automaticamente." required maxLength={2048} />
      {!webhook && <div className="webhook-create-note"><LockKeyhole size={16} /><span>O webhook será criado desativado. Ative-o na listagem quando estiver pronto.</span></div>}
      <div className="modal-actions"><Button variant="secondary" type="button" onClick={onClose}>Cancelar</Button><Button type="submit" loading={mutation.isPending}>{webhook ? 'Salvar alterações' : 'Criar webhook'}</Button></div>
    </form>
  </Modal>;
}

function DeleteWebhookModal({ webhook, onClose, onDeleted }: Readonly<{ webhook: OutboundWebhook; onClose(): void; onDeleted(): void }>) {
  const mutation = useMutation({
    mutationFn: () => api(`/outbound-webhooks/${webhook.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Webhook excluído.');
      onDeleted();
    },
  });
  return <Modal title="Excluir webhook" onClose={onClose}>
    <div className="modal-form">
      <div className="delete-confirmation"><AlertTriangle size={22} /><div><strong>Excluir “{webhook.name}”?</strong><p>O endpoint deixará de receber chamadas e o histórico de tentativas deste webhook será removido.</p></div></div>
      <div className="modal-actions"><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button variant="danger" loading={mutation.isPending} onClick={() => mutation.mutate()}><Trash2 size={15} />Excluir webhook</Button></div>
    </div>
  </Modal>;
}

function SwaggerDocsSettings() {
  return <div className="swagger-settings"><div className="settings-heading"><div><h2>Swagger</h2><p>Consulte e teste os endpoints disponíveis na API do BZS One.</p></div><div className="swagger-actions"><Button variant="secondary" onClick={() => window.open('/docs', '_blank', 'noopener,noreferrer')}><ExternalLink size={16} />Abrir em nova aba</Button></div></div><div className="swagger-frame-shell"><iframe src="/docs" title="Documentação Swagger da API BZS One" /></div></div>;
}

function InviteSentModal({ invite, onClose }: Readonly<{ invite: InviteResult; onClose(): void }>) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(invite.inviteUrl);
    setCopied(true);
  };
  return <Modal title="Convite em envio" onClose={onClose}>
    <div className="invite-sent-result">
      <span><Mail size={24} /></span>
      <div>
        <h3>O convite será entregue em instantes</h3>
        <p>Enviamos o acesso para <strong>{invite.email}</strong>. O link pessoal expira em {invite.expiresInHours} horas.</p>
      </div>
    </div>
    <div className="invite-fallback-link">
      <span>Link manual de contingência</span>
      <div><code>{invite.inviteUrl}</code><button type="button" onClick={() => void copy()} aria-label="Copiar link do convite">{copied ? <Check size={16} /> : <Copy size={16} />}</button></div>
      <p>Use este link apenas se o usuário não receber o e-mail. Ele será invalidado após o primeiro uso.</p>
    </div>
    <div className="modal-actions"><Button onClick={onClose}>Concluir</Button></div>
  </Modal>;
}
