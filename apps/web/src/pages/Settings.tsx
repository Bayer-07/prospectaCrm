import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, BookOpen, Check, Copy, ExternalLink, KeyRound, Link2, MessageSquareText, MoreHorizontal, Plus, QrCode, RefreshCw, ShieldCheck, Smartphone, Trash2, UserPlus, Users } from 'lucide-react';
import { api, dateTime, initials, type Envelope } from '../lib/api';
import { Button, Empty, Field, Modal, PageLoading, SelectField, Status } from '../components/ui';

type User = { id: string; name: string; email: string; status: string; lastLoginAt?: string; role: { id: string; key: string; name: string }; team?: { id: string; name: string; color: string } };
type RolePermission = { resource: string; action: string; scope: 'ALL' | 'TEAM' | 'OWN' };
type Metadata = { teams: Array<{ id: string; name: string }>; roles: Array<{ id: string; key: string; name: string; permissions: RolePermission[] }> };
type Instance = { id: string; name: string; instanceKey: string; phone?: string; status: string; lastEventAt?: string; teams: Array<{ team: { name: string } }>; warmupProfile: { currentDailyCap: number; sentToday: number; maximumDailyCap: number }; _count?: { conversations: number } };

export function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const tab = requestedTab && ['users', 'roles', 'whatsapp', 'api', 'api-docs', 'security'].includes(requestedTab) ? requestedTab : 'users';
  const selectTab = (next: string) => setSearchParams({ tab: next }, { replace: true });
  return <div className="settings-layout"><aside className="settings-nav"><button className={tab === 'users' ? 'active' : ''} onClick={() => selectTab('users')}><Users size={16} />Usuários e equipes</button><button className={tab === 'roles' ? 'active' : ''} onClick={() => selectTab('roles')}><ShieldCheck size={16} />Papéis e permissões</button><button className={tab === 'whatsapp' ? 'active' : ''} onClick={() => selectTab('whatsapp')}><MessageSquareText size={16} />WhatsApp</button><button className={tab === 'api' ? 'active' : ''} onClick={() => selectTab('api')}><KeyRound size={16} />API e webhooks</button><button className={tab === 'api-docs' ? 'active' : ''} onClick={() => selectTab('api-docs')}><BookOpen size={16} />Documentação Swagger</button><button className={tab === 'security' ? 'active' : ''} onClick={() => selectTab('security')}><ShieldCheck size={16} />Segurança</button></aside><section className="settings-content">{tab === 'users' && <UsersSettings />}{tab === 'roles' && <RolesSettings />}{tab === 'whatsapp' && <WhatsappSettings />}{tab === 'api' && <ApiSettings onOpenDocs={() => selectTab('api-docs')} />}{tab === 'api-docs' && <SwaggerDocsSettings onBack={() => selectTab('api')} />}{tab === 'security' && <SecuritySettings />}</section></div>;
}

function UsersSettings() {
  const client = useQueryClient(); const [modal, setModal] = useState(false); const [link, setLink] = useState('');
  const users = useQuery({ queryKey: ['users'], queryFn: () => api<Envelope<User[]>>('/users') });
  const metadata = useQuery({ queryKey: ['user-metadata'], queryFn: () => api<Envelope<Metadata>>('/users/metadata') });
  if (users.isLoading || metadata.isLoading) return <PageLoading />;
  return <><div className="settings-heading"><div><h2>Usuários e equipes</h2><p>Gerencie quem acessa a plataforma e o escopo de dados.</p></div><Button onClick={() => setModal(true)}><UserPlus size={15} />Convidar usuário</Button></div><div className="settings-table"><table><thead><tr><th>Usuário</th><th>Papel</th><th>Equipe</th><th>Status</th><th>Último acesso</th><th /></tr></thead><tbody>{users.data?.data.map((user) => <tr key={user.id}><td><div className="entity-cell"><span className="contact-avatar">{initials(user.name)}</span><div><strong>{user.name}</strong><small>{user.email}</small></div></div></td><td>{user.role.name}</td><td>{user.team?.name || 'Sem equipe'}</td><td><Status value={user.status} /></td><td>{dateTime(user.lastLoginAt)}</td><td><button className="icon-button"><MoreHorizontal size={17} /></button></td></tr>)}</tbody></table></div>{modal && <InviteModal metadata={metadata.data!.data} onClose={() => setModal(false)} onCreated={(url) => { setModal(false); setLink(url); client.invalidateQueries({ queryKey: ['users'] }); }} />}{link && <LinkModal title="Link de convite criado" link={link} onClose={() => setLink('')} />}</>;
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

function RolePermissionsModal({ role, onClose, onSaved }: { role: Metadata['roles'][number]; onClose(): void; onSaved(): void }) {
  const initial = Object.fromEntries(permissionRows.flatMap(([resource]) => ['read', 'write', ...(resource === 'campaigns' ? ['launch'] : [])].map((action) => {
    const permission = role.permissions.find((item) => (item.resource === resource || item.resource === '*') && (item.action === action || item.action === '*'));
    return [`${resource}:${action}`, permission?.scope || 'NONE'];
  }))) as Record<string, string>;
  const [scopes, setScopes] = useState(initial);
  const mutation = useMutation({ mutationFn: () => api(`/users/roles/${role.id}/permissions`, { method: 'PUT', body: JSON.stringify({ permissions: Object.entries(scopes).filter(([, scope]) => scope !== 'NONE').map(([key, scope]) => { const [resource, action] = key.split(':'); return { resource, action, scope }; }) }) }), onSuccess: onSaved });
  return <Modal title={`Permissões · ${role.name}`} onClose={onClose}><div className="settings-table permissions-table"><table><thead><tr><th>Funcionalidade</th><th>Leitura</th><th>Alteração</th><th>Extra</th></tr></thead><tbody>{permissionRows.map(([resource, label]) => <tr key={resource}><td><strong>{label}</strong></td>{['read', 'write'].map((action) => <td key={action}><select value={scopes[`${resource}:${action}`]} onChange={(event) => setScopes({ ...scopes, [`${resource}:${action}`]: event.target.value })}><option value="NONE">Sem acesso</option><option value="OWN">Próprios</option><option value="TEAM">Equipe</option><option value="ALL">Todos</option></select></td>)}<td>{resource === 'campaigns' ? <select value={scopes['campaigns:launch']} onChange={(event) => setScopes({ ...scopes, 'campaigns:launch': event.target.value })}><option value="NONE">Não inicia</option><option value="OWN">Próprios</option><option value="TEAM">Equipe</option><option value="ALL">Todos</option></select> : '—'}</td></tr>)}</tbody></table></div><div className="modal-actions"><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={mutation.isPending} onClick={() => mutation.mutate()}>Salvar permissões</Button></div></Modal>;
}

function InviteModal({ metadata, onClose, onCreated }: { metadata: Metadata; onClose(): void; onCreated(url: string): void }) {
  const [form, setForm] = useState({ name: '', email: '', roleId: metadata.roles[0]?.id || '', teamId: metadata.teams[0]?.id || '' });
  const mutation = useMutation({ mutationFn: () => api<Envelope<{ inviteUrl: string }>>('/users/invite', { method: 'POST', body: JSON.stringify(form) }), onSuccess: (result) => onCreated(result.data.inviteUrl) });
  return <Modal title="Convidar usuário" onClose={onClose}><form className="modal-form" onSubmit={(event: FormEvent) => { event.preventDefault(); mutation.mutate(); }}><Field label="Nome" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /><Field label="E-mail" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /><div className="form-grid"><SelectField label="Papel" value={form.roleId} onChange={(event) => setForm({ ...form, roleId: event.target.value })}>{metadata.roles.map((role) => <option value={role.id} key={role.id}>{role.name}</option>)}</SelectField><SelectField label="Equipe" value={form.teamId} onChange={(event) => setForm({ ...form, teamId: event.target.value })}>{metadata.teams.map((team) => <option value={team.id} key={team.id}>{team.name}</option>)}</SelectField></div><div className="consent-note"><Link2 size={17} /><p><strong>Convite manual</strong><span>Você receberá um link válido por 72 horas para compartilhar com o usuário.</span></p></div><div className="modal-actions"><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" loading={mutation.isPending}>Gerar convite</Button></div></form></Modal>;
}

function WhatsappSettings() {
  const client = useQueryClient();
  const [modal, setModal] = useState(false);
  const [qr, setQr] = useState('');
  const [deleting, setDeleting] = useState<Instance | null>(null);
  const instances = useQuery({ queryKey: ['instances'], queryFn: () => api<Envelope<Instance[]>>('/whatsapp/instances') });
  const metadata = useQuery({ queryKey: ['user-metadata'], queryFn: () => api<Envelope<Metadata>>('/users/metadata') });
  const connect = useMutation({ mutationFn: (id: string) => api<Envelope<{ qrcode: any }>>(`/whatsapp/instances/${id}/connect`, { method: 'POST' }), onSuccess: (result) => setQr(typeof result.data.qrcode === 'string' ? result.data.qrcode : result.data.qrcode?.base64 || '') });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/whatsapp/instances/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      setDeleting(null);
      void client.invalidateQueries({ queryKey: ['instances'] });
    },
  });
  if (instances.isLoading || metadata.isLoading) return <PageLoading />;
  return <>
    <div className="settings-heading"><div><h2>Números do WhatsApp</h2><p>Instâncias Evolution API acessíveis pelas equipes.</p></div><Button onClick={() => setModal(true)}><Plus size={16} />Adicionar número</Button></div>
    {connect.error && <div className="form-error settings-error">{connect.error.message}</div>}
    <div className="instance-list">{instances.data?.data.length ? instances.data.data.map((instance) => <article key={instance.id}>
      <div className="instance-icon"><Smartphone size={22} /></div>
      <div className="instance-info"><div><strong>{instance.name}</strong><Status value={instance.status} /></div><p>{instance.phone || instance.instanceKey}</p><small>{instance.teams.map((item) => item.team.name).join(', ') || 'Sem equipe'} · Último evento {dateTime(instance.lastEventAt)}</small></div>
      <div className="warmup-meter"><span>Aquecimento</span><div><i style={{ width: `${Math.min((instance.warmupProfile.sentToday / Math.max(instance.warmupProfile.currentDailyCap, 1)) * 100, 100)}%` }} /></div><small>{instance.warmupProfile.sentToday} / {instance.warmupProfile.currentDailyCap} hoje</small></div>
      <div className="instance-actions"><Button variant="secondary" onClick={() => connect.mutate(instance.id)}><QrCode size={16} />{instance.status === 'CONNECTED' ? 'Novo QR' : 'Conectar'}</Button><button className="icon-button danger-icon" onClick={() => setDeleting(instance)} aria-label={`Excluir conexão ${instance.name}`} title="Excluir conexão"><Trash2 size={18} /></button></div>
    </article>) : <Empty icon={<Smartphone />} title="Nenhum número conectado" description="Adicione uma instância Baileys e escaneie o QR Code pelo WhatsApp." />}</div>
    {modal && <InstanceModal teams={metadata.data!.data.teams} onClose={() => setModal(false)} onCreated={(qrcode) => { setModal(false); if (qrcode) setQr(qrcode); void client.invalidateQueries({ queryKey: ['instances'] }); }} />}
    {qr && <QrModal value={qr} onClose={() => setQr('')} />}
    {deleting && <DeleteInstanceModal instance={deleting} loading={remove.isPending} error={remove.error?.message} onClose={() => setDeleting(null)} onConfirm={() => remove.mutate(deleting.id)} />}
  </>;
}

function DeleteInstanceModal({ instance, loading, error, onClose, onConfirm }: { instance: Instance; loading: boolean; error?: string; onClose(): void; onConfirm(): void }) {
  return <Modal title="Excluir conexão do WhatsApp" onClose={onClose}><div className="delete-confirm"><div className="delete-confirm-icon"><Trash2 size={22} /></div><div><h3>Excluir “{instance.name}”?</h3><p>A sessão será removida da Evolution API e deixará de aparecer nas conexões. Conversas já registradas serão preservadas no histórico.</p>{instance._count?.conversations ? <small>{instance._count.conversations} conversa(s) permanecerão no CRM.</small> : null}</div></div>{error && <div className="form-error delete-error">{error}</div>}<div className="modal-actions delete-actions"><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button variant="danger" loading={loading} onClick={onConfirm}><Trash2 size={16} />Excluir conexão</Button></div></Modal>;
}

function InstanceModal({ teams, onClose, onCreated }: { teams: Metadata['teams']; onClose(): void; onCreated(qr?: string): void }) {
  const [form, setForm] = useState({ name: '', instanceKey: '', teamId: teams[0]?.id || '' });
  const mutation = useMutation({ mutationFn: () => api<Envelope<any>>('/whatsapp/instances', { method: 'POST', body: JSON.stringify({ name: form.name, instanceKey: form.instanceKey, teamIds: [form.teamId] }) }), onSuccess: (result) => onCreated(result.data.qrcode?.base64 || result.data.qrcode) });
  return <Modal title="Adicionar número" onClose={onClose}><form className="modal-form" onSubmit={(event: FormEvent) => { event.preventDefault(); mutation.mutate(); }}><Field label="Nome da caixa" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Ex.: Comercial SP" required /><Field label="Identificador da instância" value={form.instanceKey} onChange={(event) => setForm({ ...form, instanceKey: event.target.value.replace(/[^a-zA-Z0-9_-]/g, '') })} placeholder="comercial-sp" required /><SelectField label="Equipe principal" value={form.teamId} onChange={(event) => setForm({ ...form, teamId: event.target.value })}>{teams.map((team) => <option value={team.id} key={team.id}>{team.name}</option>)}</SelectField><div className="risk-note"><AlertTriangle size={16} /><span>A conexão por QR pode sofrer restrições do WhatsApp. Use consentimento e aquecimento.</span></div><div className="modal-actions"><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" loading={mutation.isPending}>Criar e conectar</Button></div></form></Modal>;
}

function QrModal({ value, onClose }: { value: string; onClose(): void }) { return <Modal title="Conectar WhatsApp" onClose={onClose}><div className="qr-content">{value.startsWith('data:image') ? <img src={value} alt="QR Code de conexão" /> : <div className="qr-placeholder"><QrCode size={120} /><small>QR recebido pela Evolution API</small></div>}<h3>Escaneie pelo WhatsApp</h3><p>Abra Aparelhos conectados → Conectar um aparelho. O código expira em aproximadamente 30 segundos.</p></div></Modal>; }

function ApiSettings({ onOpenDocs }: { onOpenDocs(): void }) {
  const [key, setKey] = useState(''); const [webhookSecret, setWebhookSecret] = useState('');
  const createKey = useMutation({ mutationFn: () => api<Envelope<{ token: string }>>('/users/api-keys', { method: 'POST', body: JSON.stringify({ name: 'Integração principal', scopes: ['companies:read', 'companies:write', 'contacts:read', 'contacts:write', 'opportunities:read', 'opportunities:write'] }) }), onSuccess: (result) => setKey(result.data.token) });
  const createWebhook = useMutation({ mutationFn: () => api<Envelope<{ secret: string }>>('/outbound-webhooks', { method: 'POST', body: JSON.stringify({ name: 'Webhook principal', url: 'https://exemplo.com/webhook', events: ['contact.created', 'opportunity.updated'] }) }), onSuccess: (result) => setWebhookSecret(result.data.secret) });
  return <><div className="settings-heading"><div><h2>API e webhooks</h2><p>Integre o CRM com sistemas externos usando escopos e assinaturas.</p></div></div><div className="settings-card"><div className="settings-card-icon"><KeyRound /></div><div><h3>Chaves de API</h3><p>Chaves são exibidas uma única vez. Revogue imediatamente se houver exposição.</p>{key && <code className="secret-output">{key}</code>}</div><Button variant="secondary" onClick={() => createKey.mutate()} loading={createKey.isPending}>Gerar chave</Button></div><div className="settings-card"><div className="settings-card-icon"><RefreshCw /></div><div><h3>Webhooks de saída</h3><p>Eventos assinados em HMAC-SHA256, com retentativas e fila de falhas.</p>{webhookSecret && <code className="secret-output">{webhookSecret}</code>}</div><Button variant="secondary" onClick={() => createWebhook.mutate()} loading={createWebhook.isPending}>Criar exemplo</Button></div><div className="settings-card"><div className="settings-card-icon"><BookOpen /></div><div><h3>Documentação Swagger</h3><p>Explore endpoints, parâmetros e schemas da API diretamente dentro do sistema.</p></div><Button variant="secondary" onClick={onOpenDocs}><BookOpen size={16} />Abrir Swagger</Button></div></>;
}

function SwaggerDocsSettings({ onBack }: { onBack(): void }) {
  return <div className="swagger-settings"><div className="settings-heading"><div><h2>Documentação Swagger</h2><p>Consulte e teste os endpoints disponíveis na API do CRM.</p></div><div className="swagger-actions"><Button variant="secondary" onClick={onBack}>Voltar para API e webhooks</Button><Button variant="secondary" onClick={() => window.open('/docs', '_blank', 'noopener,noreferrer')}><ExternalLink size={16} />Abrir em nova aba</Button></div></div><div className="swagger-frame-shell"><iframe src="/docs" title="Documentação Swagger da API" /></div></div>;
}

function SecuritySettings() { return <><div className="settings-heading"><div><h2>Segurança e retenção</h2><p>Políticas organizacionais aplicadas no servidor.</p></div></div><div className="security-grid"><article><ShieldCheck /><div><strong>Autorização por escopo</strong><p>Papéis customizáveis com acesso a todos, equipe ou registros próprios.</p></div><Status value="active" /></article><article><KeyRound /><div><strong>Sessões seguras</strong><p>Argon2id, cookies HttpOnly, CSRF e expiração em 7 dias.</p></div><Status value="active" /></article><article><MessageSquareText /><div><strong>Retenção de mensagens</strong><p>Conteúdo e mídias são removidos após 24 meses por padrão.</p></div><span className="neutral-pill">24 meses</span></article></div></>; }

function LinkModal({ title, link, onClose }: { title: string; link: string; onClose(): void }) {
  const [copied, setCopied] = useState(false); const copy = async () => { await navigator.clipboard.writeText(link); setCopied(true); };
  return <Modal title={title} onClose={onClose}><div className="link-result"><div><code>{link}</code><button onClick={() => void copy()}>{copied ? <Check size={16} /> : <Copy size={16} />}</button></div><p>Compartilhe este link por um canal seguro. Ele será invalidado após o uso.</p></div></Modal>;
}
