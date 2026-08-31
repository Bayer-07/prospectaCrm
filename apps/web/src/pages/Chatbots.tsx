import { Fragment, FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ReactFlow, Background, Controls, MiniMap, Handle, Position, addEdge,
  useEdgesState, useNodesState, type Connection, type Edge, type Node, type NodeProps,
} from '@xyflow/react';
import {
  Archive, Bot, BrainCircuit, ChevronDown, ChevronLeft, ChevronUp, CircleStop, Clock3, GitBranch, Globe2, HelpCircle, MessageSquareText,
  Pause, Play, Plus, Save, Send, Tag, Trash2, UserRoundCheck,
} from 'lucide-react';
import { api, dateTime, type Envelope } from '../lib/api';
import { Button, Empty, Field, Modal, PageLoading, SelectField, Status } from '../components/ui';
import { useTheme } from '../lib/theme';
import { toast } from '../lib/toast';
import '@xyflow/react/dist/style.css';

type HttpResponseRoute = { id: string; label: string; path: string; operator: string; value?: string };
type FlowData = { label?: string; subtitle?: string; text?: string; operator?: string; value?: string; tagId?: string; responseRoutes?: HttpResponseRoute[]; [key: string]: unknown };
type InstanceOption = { id: string; name: string; phone?: string; status: string };
type TagOption = { id: string; name: string; color: string };
type TeamOption = { id: string; name: string; color: string; isDefault?: boolean };
type Metadata = { instances: InstanceOption[]; tags: TagOption[]; teams: TeamOption[]; responseProviders: Array<{ key: string; name: string; available: boolean }> };
type ChatbotRecord = {
  id: string; name: string; description?: string; status: string; responseProvider: string; publishedVersion?: number; updatedAt: string;
  instance: InstanceOption; versions: Array<{ id: string; version: number; graph: { nodes: Node<FlowData>[]; edges: Edge[] }; publishedAt?: string }>;
  _count?: { sessions: number };
};

const nodeDefinitions = [
  { type: 'trigger', label: 'Mensagem recebida', subtitle: 'Entrada do chatbot', icon: Play, tone: 'violet' },
  { type: 'message', label: 'Enviar mensagem', subtitle: 'Resposta automática', icon: MessageSquareText, tone: 'green' },
  { type: 'question', label: 'Fazer pergunta', subtitle: 'Aguarda a resposta', icon: HelpCircle, tone: 'blue' },
  { type: 'wait', label: 'Aguardar', subtitle: 'Pausa programada', icon: Clock3, tone: 'blue' },
  { type: 'http_request', label: 'Requisição HTTP', subtitle: 'Consulta uma API', icon: Globe2, tone: 'green' },
  { type: 'ai_conversation', label: 'Atendimento por IA', subtitle: 'Pré-atendimento local', icon: BrainCircuit, tone: 'violet' },
  { type: 'condition', label: 'Condição', subtitle: 'Ramifica pela resposta', icon: GitBranch, tone: 'amber' },
  { type: 'add_tag', label: 'Adicionar tag', subtitle: 'Organiza o contato', icon: Tag, tone: 'slate' },
  { type: 'assign_queue', label: 'Atribuir fila', subtitle: 'Define o setor', icon: UserRoundCheck, tone: 'violet' },
  { type: 'handoff', label: 'Transferir', subtitle: 'Aguardando atendente', icon: UserRoundCheck, tone: 'violet' },
  { type: 'close', label: 'Encerrar ticket', subtitle: 'Fecha a conversa', icon: Archive, tone: 'rose' },
  { type: 'end', label: 'Finalizar bot', subtitle: 'Encerra o fluxo', icon: CircleStop, tone: 'rose' },
] as const;

function ChatbotNode({ data, type, selected }: NodeProps<Node<FlowData>>) {
  const definition = nodeDefinitions.find((item) => item.type === type) || nodeDefinitions[1];
  const terminal = ['handoff', 'close', 'end'].includes(type || '');
  const httpRoutes = type === 'http_request' && Array.isArray(data.responseRoutes) ? data.responseRoutes : [];
  const httpHandleCount = httpRoutes.length + 1;
  return <div className={`flow-node chatbot-node ${definition.tone} ${selected ? 'selected' : ''}`} style={type === 'http_request' ? { minHeight: Math.max(72, httpHandleCount * 30) } : undefined}>
    {type !== 'trigger' && <Handle type="target" position={Position.Left} />}
    <span><definition.icon size={17} /></span>
    <div><strong>{String(data.label || definition.label)}</strong><small>{String(data.subtitle || definition.subtitle)}</small></div>
    {!terminal && type !== 'condition' && type !== 'http_request' && <Handle type="source" position={Position.Right} />}
    {type === 'condition' && <><Handle id="true" type="source" position={Position.Right} style={{ top: '34%' }} title="Sim" /><Handle id="false" type="source" position={Position.Right} style={{ top: '72%' }} title="Não" /><i className="branch-label branch-yes">Sim</i><i className="branch-label branch-no">Não</i></>}
    {type === 'http_request' && <>{httpRoutes.map((route, index) => { const top = `${((index + 1) / (httpHandleCount + 1)) * 100}%`; return <Fragment key={route.id}><Handle id={route.id} type="source" position={Position.Right} style={{ top }} title={route.label} /><i className="branch-label http-route-label" style={{ top }}>{route.label}</i></Fragment>; })}<Handle id="default" type="source" position={Position.Right} style={{ top: `${(httpHandleCount / (httpHandleCount + 1)) * 100}%` }} title="Outros / erro" /><i className="branch-label http-default-label" style={{ top: `${(httpHandleCount / (httpHandleCount + 1)) * 100}%` }}>Outros / erro</i></>}
  </div>;
}

const nodeTypes = Object.fromEntries(nodeDefinitions.map((item) => [item.type, ChatbotNode]));

export function ChatbotsPage() {
  const client = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modal, setModal] = useState(false);
  const [deleting, setDeleting] = useState<ChatbotRecord | null>(null);
  const [filter, setFilter] = useState<'all' | 'PUBLISHED' | 'DRAFT' | 'PAUSED'>('all');
  const query = useQuery({ queryKey: ['chatbots'], queryFn: () => api<Envelope<ChatbotRecord[]>>('/chatbots') });
  const metadata = useQuery({ queryKey: ['chatbot-metadata'], queryFn: () => api<Envelope<Metadata>>('/chatbots/metadata') });
  if (query.isLoading || metadata.isLoading) return <PageLoading />;
  if (selectedId) return <ChatbotBuilder chatbotId={selectedId} metadata={metadata.data!.data} onBack={() => { setSelectedId(null); void client.invalidateQueries({ queryKey: ['chatbots'] }); }} />;
  const all = query.data?.data || [];
  const chatbots = filter === 'all' ? all : all.filter((chatbot) => chatbot.status === filter);
  return <div className="automations-page chatbot-page"><div className="toolbar"><div className="segmented"><button type="button" className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>Todos</button><button type="button" className={filter === 'PUBLISHED' ? 'active' : ''} onClick={() => setFilter('PUBLISHED')}>Ativos</button><button type="button" className={filter === 'DRAFT' ? 'active' : ''} onClick={() => setFilter('DRAFT')}>Rascunhos</button><button type="button" className={filter === 'PAUSED' ? 'active' : ''} onClick={() => setFilter('PAUSED')}>Pausados</button></div><Button onClick={() => setModal(true)}><Plus size={15} />Novo chatbot</Button></div>
    {chatbots.length ? <div className="workflow-grid chatbot-grid">{chatbots.map((chatbot) => <div className="workflow-card-shell" key={chatbot.id}><button type="button" className="workflow-card-main" onClick={() => setSelectedId(chatbot.id)}><div className="workflow-icon"><Bot size={20} /></div><div className="workflow-card-header"><Status value={chatbot.status} /><span>v{chatbot.versions[0]?.version || 1}</span></div><h3>{chatbot.name}</h3><p>{chatbot.description || 'Atendimento automático por regras'}</p><footer><span>{chatbot.instance.name} · {chatbot._count?.sessions || 0} atendimentos</span><span>Atualizado {dateTime(chatbot.updatedAt)}</span></footer></button><button type="button" className="workflow-card-delete" title={`Excluir chatbot ${chatbot.name}`} aria-label={`Excluir chatbot ${chatbot.name}`} onClick={() => setDeleting(chatbot)}><Trash2 size={16} /></button></div>)}</div> : <Empty icon={<Bot />} title={all.length ? 'Nenhum chatbot neste filtro' : 'Crie seu primeiro chatbot'} description="Monte o atendimento em um mapa visual e transfira para a equipe quando necessário." action={<Button onClick={() => setModal(true)}>Novo chatbot</Button>} />}
    {modal && <CreateChatbotModal metadata={metadata.data!.data} onClose={() => setModal(false)} onCreated={(chatbot) => { setModal(false); setSelectedId(chatbot.id); }} />}
    {deleting && <DeleteChatbotModal chatbot={deleting} onClose={() => setDeleting(null)} onDeleted={() => { setDeleting(null); void client.invalidateQueries({ queryKey: ['chatbots'] }); }} />}</div>;
}

function DeleteChatbotModal({ chatbot, onClose, onDeleted }: Readonly<{ chatbot: ChatbotRecord; onClose(): void; onDeleted(): void }>) {
  const mutation = useMutation({
    mutationFn: () => api(`/chatbots/${chatbot.id}`, { method: 'DELETE' }),
    onSuccess: () => { toast.success('Chatbot excluído.'); onDeleted(); },
  });
  return <Modal title="Excluir chatbot" onClose={() => !mutation.isPending && onClose()}><div className="delete-confirm"><div className="delete-confirm-icon"><Trash2 size={22} /></div><div><h3>Excluir “{chatbot.name}”?</h3><p>O chatbot deixará de responder e não aparecerá mais na listagem. Atendimentos e execuções anteriores serão preservados para auditoria.</p></div></div><div className="modal-actions delete-actions"><Button variant="secondary" disabled={mutation.isPending} onClick={onClose}>Cancelar</Button><Button variant="danger" loading={mutation.isPending} onClick={() => mutation.mutate()}><Trash2 size={16} />Excluir chatbot</Button></div></Modal>;
}

function CreateChatbotModal({ metadata, onClose, onCreated }: Readonly<{ metadata: Metadata; onClose(): void; onCreated(chatbot: ChatbotRecord): void }>) {
  const [name, setName] = useState(''); const [description, setDescription] = useState(''); const [instanceId, setInstanceId] = useState(metadata.instances[0]?.id || '');
  const [responseProvider, setResponseProvider] = useState('RULES');
  const mutation = useMutation({ mutationFn: () => api<Envelope<ChatbotRecord>>('/chatbots', { method: 'POST', body: JSON.stringify({ name, description, instanceId, responseProvider }) }), onSuccess: (result) => { toast.success('Chatbot criado.'); onCreated(result.data); } });
  return <Modal title="Novo chatbot" onClose={onClose}><form className="modal-form" onSubmit={(event: FormEvent) => { event.preventDefault(); mutation.mutate(); }}><Field label="Nome do chatbot" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Atendimento comercial" required /><Field label="Descrição" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Quando e como este bot deve atender" /><SelectField label="Número do WhatsApp" value={instanceId} onChange={(event) => setInstanceId(event.target.value)} required><option value="">Selecione um número</option>{metadata.instances.map((instance) => <option key={instance.id} value={instance.id}>{instance.name}{instance.phone ? ` · ${instance.phone}` : ''}</option>)}</SelectField><SelectField label="Motor de resposta" value={responseProvider} onChange={(event) => setResponseProvider(event.target.value)}>{metadata.responseProviders.map((provider) => <option key={provider.key} value={provider.key} disabled={!provider.available}>{provider.name}{provider.available ? '' : ' · indisponível'}</option>)}</SelectField>{!metadata.instances.length && <p className="form-hint">Conecte um número do WhatsApp antes de criar o chatbot.</p>}<div className="modal-actions"><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" loading={mutation.isPending} disabled={!instanceId}>Criar e editar</Button></div></form></Modal>;
}

function ChatbotBuilder({ chatbotId, metadata, onBack }: Readonly<{ chatbotId: string; metadata: Metadata; onBack(): void }>) {
  const { theme } = useTheme();
  const query = useQuery({ queryKey: ['chatbot', chatbotId], queryFn: () => api<Envelope<ChatbotRecord>>(`/chatbots/${chatbotId}`) });
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<FlowData>>([]); const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]); const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  useEffect(() => { if (query.data?.data.versions[0]) { setNodes(query.data.data.versions[0].graph.nodes || []); setEdges(query.data.data.versions[0].graph.edges || []); } }, [query.data, setNodes, setEdges]);
  const graph = useMemo(() => ({ nodes, edges }), [nodes, edges]);
  const save = useMutation({ mutationFn: () => api(`/chatbots/${chatbotId}/draft`, { method: 'PATCH', body: JSON.stringify({ graph }) }), onSuccess: () => { toast.success('Chatbot salvo.'); return query.refetch(); } });
  const publish = useMutation({ mutationFn: async () => { await api(`/chatbots/${chatbotId}/draft`, { method: 'PATCH', body: JSON.stringify({ graph }) }); return api(`/chatbots/${chatbotId}/publish`, { method: 'POST' }); }, onSuccess: () => { toast.success('Chatbot publicado.'); return query.refetch(); } });
  const changeStatus = useMutation({ mutationFn: (status: string) => api(`/chatbots/${chatbotId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }), onSuccess: (_result, status) => { toast.success(status === 'PAUSED' ? 'Chatbot pausado.' : 'Chatbot ativado.'); return query.refetch(); } });
  const onConnect = useCallback((connection: Connection) => setEdges((current) => addEdge({ ...connection, animated: true, style: { stroke: '#2da6dc' } }, current)), [setEdges]);
  const addNode = (type: string) => {
    const definition = nodeDefinitions.find((item) => item.type === type)!;
    const id = `${type}-${Date.now()}`;
    const data: FlowData = { label: definition.label, subtitle: definition.subtitle };
    if (type === 'message') {
      data.text = 'Olá, {{nome}}! Como posso ajudar?';
    }
    if (type === 'question') {
      data.text = 'Por favor, conte brevemente o que você precisa.';
      data.responseVariable = 'resposta_cliente';
    }
    if (type === 'wait') {
      data.seconds = 1;
    }
    if (type === 'http_request') {
      data.method = 'GET';
      data.url = 'https://api.exemplo.com/recurso';
      data.headers = '{\n  "Content-Type": "application/json"\n}';
      data.body = '';
      data.timeoutSeconds = 15;
      data.variableName = 'resposta';
      data.responseRoutes = [{ id: 'success', label: 'Sucesso', path: 'status', operator: 'between', value: '200,299' }];
    }
    if (type === 'ai_conversation') {
      data.objective = 'Entender a necessidade do contato e coletar informações para a equipe.';
      data.instructions = 'Seja objetivo, cordial e não assuma compromissos comerciais.';
      data.transferCriteria = 'Pedido de atendente, dúvida fora do escopo, baixa confiança ou necessidade de negociação.';
      data.maxInteractions = 6;
      data.minimumConfidence = 65;
      data.fallbackMessage = '';
    }
    if (type === 'condition') {
      data.operator = 'contains';
      data.value = 'vendas';
    }
    if (type === 'assign_queue') data.teamId = metadata.teams[0]?.id || '';
    setNodes((current) => [...current, { id, type, position: { x: 300 + current.length * 45, y: 90 + (current.length % 5) * 110 }, data }]);
    setSelectedNodeId(id);
  };
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) || null;
  const updateSelected = (changes: Partial<FlowData>) => {
    if (selectedNodeId && changes.responseRoutes) {
      const validHandles = new Set([...changes.responseRoutes.map((route) => route.id), 'default']);
      setEdges((current) => current.filter((edge) => edge.source !== selectedNodeId || validHandles.has(edge.sourceHandle || '')));
    }
    setNodes((current) => current.map((node) => node.id === selectedNodeId ? { ...node, data: { ...node.data, ...changes } } : node));
  };
  const deleteSelected = () => {
    if (!selectedNode || selectedNode.type === 'trigger') return;
    setNodes((current) => current.filter((node) => node.id !== selectedNode.id));
    setEdges((current) => current.filter((edge) => edge.source !== selectedNode.id && edge.target !== selectedNode.id));
    setSelectedNodeId(null);
  };
  if (query.isLoading) return <PageLoading />;
  const chatbot = query.data!.data;
  return <div className="workflow-builder chatbot-builder"><header className="builder-header"><div><button type="button" className="icon-button" onClick={onBack}><ChevronLeft size={18} /></button><div><h2>{chatbot.name}</h2><span><Status value={chatbot.status} /> · {chatbot.instance.name} · {chatbot.responseProvider === 'OPENAI' ? 'OpenAI' : 'Regras'} · Versão {chatbot.versions[0]?.version}</span></div></div><div>{chatbot.status === 'PUBLISHED' && <Button variant="secondary" onClick={() => changeStatus.mutate('PAUSED')} loading={changeStatus.isPending}><Pause size={15} />Pausar</Button>}{chatbot.status === 'PAUSED' && chatbot.publishedVersion && <Button variant="secondary" onClick={() => changeStatus.mutate('PUBLISHED')} loading={changeStatus.isPending}><Play size={15} />Ativar</Button>}<Button variant="secondary" onClick={() => save.mutate()} loading={save.isPending}><Save size={15} />Salvar</Button><Button onClick={() => publish.mutate()} loading={publish.isPending}><Send size={15} />Publicar</Button></div></header><div className="builder-body chatbot-builder-body"><aside className="node-palette"><span className="nav-section">Blocos</span>{nodeDefinitions.filter((item) => item.type !== 'trigger' && (item.type !== 'ai_conversation' || chatbot.responseProvider === 'OPENAI')).map((item) => <button type="button" key={item.type} onClick={() => addNode(item.type)}><span className={item.tone}><item.icon size={15} /></span><div><strong>{item.label}</strong><small>{item.subtitle}</small></div></button>)}</aside><div className="flow-canvas"><ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onNodeClick={(_, node) => setSelectedNodeId(node.id)} onPaneClick={() => setSelectedNodeId(null)} nodeTypes={nodeTypes} fitView colorMode={theme}><Background gap={22} size={1} color={theme === 'dark' ? '#38414a' : '#dfe5ea'} /><Controls /><MiniMap pannable zoomable nodeColor="#2da6dc" maskColor={theme === 'dark' ? 'rgba(25,29,34,.72)' : 'rgba(245,247,249,.75)'} /></ReactFlow></div><NodeInspector node={selectedNode} tags={metadata.tags} teams={metadata.teams} onChange={updateSelected} onDelete={deleteSelected} /></div></div>;
}

function HttpRequestInspector({ node, onChange, onDelete }: Readonly<{ node: Node<FlowData>; onChange(changes: Partial<FlowData>): void; onDelete(): void }>) {
  const definition = nodeDefinitions.find((item) => item.type === 'http_request')!;
  const routes = Array.isArray(node.data.responseRoutes) ? node.data.responseRoutes : [];
  const updateRoute = (index: number, changes: Partial<HttpResponseRoute>) => onChange({
    responseRoutes: routes.map((route, routeIndex) => routeIndex === index ? { ...route, ...changes } : route),
  });
  const removeRoute = (index: number) => onChange({ responseRoutes: routes.filter((_, routeIndex) => routeIndex !== index) });
  const moveRoute = (index: number, offset: number) => {
    const destination = index + offset;
    if (destination < 0 || destination >= routes.length) return;
    const reordered = [...routes];
    [reordered[index], reordered[destination]] = [reordered[destination]!, reordered[index]!];
    onChange({ responseRoutes: reordered });
  };
  const addRoute = () => onChange({
    responseRoutes: [...routes, {
      id: `route-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      label: `Resposta ${routes.length + 1}`,
      path: 'body.status',
      operator: 'equals',
      value: '',
    }],
  });
  return <aside className="node-inspector http-node-inspector"><div className="inspector-title"><span className={definition.tone}><definition.icon size={16} /></span><div><strong>{definition.label}</strong><small>{definition.subtitle}</small></div></div>
    <label className="field"><span>Nome do bloco</span><input value={String(node.data.label || '')} onChange={(event) => onChange({ label: event.target.value })} /></label>
    <SelectField label="Método" value={String(node.data.method || 'GET')} onChange={(event) => onChange({ method: event.target.value })}><option>GET</option><option>POST</option><option>PUT</option><option>PATCH</option><option>DELETE</option></SelectField>
    <label className="field"><span>URL pública</span><input type="url" maxLength={2_048} value={String(node.data.url || '')} onChange={(event) => onChange({ url: event.target.value })} placeholder="https://api.exemplo.com/clientes/{{telefone}}" /><small>URLs internas e credenciais diretamente na URL são bloqueadas.</small></label>
    <label className="field"><span>Cabeçalhos em JSON</span><textarea rows={4} maxLength={32_000} value={String(node.data.headers || '')} onChange={(event) => onChange({ headers: event.target.value })} spellCheck={false} placeholder={'{\n  "Authorization": "Bearer token"\n}'} /><small>Você pode usar variáveis nos valores dos cabeçalhos.</small></label>
    {String(node.data.method || 'GET') !== 'GET' && <label className="field"><span>Body</span><textarea rows={6} maxLength={256 * 1024} value={String(node.data.body || '')} onChange={(event) => onChange({ body: event.target.value })} spellCheck={false} placeholder={'{\n  "telefone": "{{telefone}}"\n}'} /><small>Limite de 256 KB após substituir as variáveis.</small></label>}
    <div className="form-grid"><label className="field"><span>Variável temporária</span><input value={String(node.data.variableName || 'resposta')} onChange={(event) => onChange({ variableName: event.target.value })} placeholder="resposta" /></label><label className="field"><span>Tempo limite (s)</span><input type="number" min={1} max={60} value={Number(node.data.timeoutSeconds || 15)} onChange={(event) => onChange({ timeoutSeconds: Math.min(60, Math.max(1, Number(event.target.value))) })} /></label></div>
    <div className="inspector-note">Use variáveis coletadas nas perguntas na URL, nos cabeçalhos ou no body, como <code>{'{{cnpj}}'}</code>. O retorno também fica disponível durante a sessão, por exemplo <code>{'{{resposta.nome}}'}</code>.</div>
    <div className="http-routes-heading"><div><strong>Rotas da resposta</strong><small>A primeira regra correspondente define a saída.</small></div><Button type="button" variant="secondary" disabled={routes.length >= 8} onClick={addRoute}><Plus size={14} />Adicionar</Button></div>
    <div className="http-route-list">{routes.map((route, index) => <div className="http-route-card" key={route.id}><div className="http-route-title"><strong>{index + 1}</strong><input aria-label={`Nome da rota ${index + 1}`} value={route.label} maxLength={50} onChange={(event) => updateRoute(index, { label: event.target.value })} /><span className="http-route-order"><button type="button" className="icon-button" disabled={index === 0} aria-label={`Subir rota ${route.label}`} onClick={() => moveRoute(index, -1)}><ChevronUp size={13} /></button><button type="button" className="icon-button" disabled={index === routes.length - 1} aria-label={`Descer rota ${route.label}`} onClick={() => moveRoute(index, 1)}><ChevronDown size={13} /></button></span><button type="button" className="icon-button" aria-label={`Excluir rota ${route.label}`} onClick={() => removeRoute(index)}><Trash2 size={14} /></button></div><label className="field"><span>Campo</span><input value={route.path} onChange={(event) => updateRoute(index, { path: event.target.value })} placeholder="status, error ou body.campo" /></label><SelectField label="Comparação" value={route.operator} onChange={(event) => updateRoute(index, { operator: event.target.value })}><option value="equals">É igual a</option><option value="not_equals">É diferente de</option><option value="contains">Contém</option><option value="exists">Existe</option><option value="not_exists">Não existe</option><option value="greater_than">É maior que</option><option value="less_than">É menor que</option><option value="between">Está entre</option></SelectField>{!['exists', 'not_exists'].includes(route.operator) && <label className="field"><span>Valor esperado</span><input value={route.value || ''} onChange={(event) => updateRoute(index, { value: event.target.value })} placeholder={route.operator === 'between' ? '200,299' : 'Ex.: aprovado'} /></label>}</div>)}</div>
    <div className="inspector-note">A saída <strong>Outros / erro</strong> trata respostas sem correspondência, indisponibilidade e tempo esgotado.</div>
    <Button variant="ghost" className="delete-node" onClick={onDelete}><Trash2 size={15} />Excluir bloco</Button>
  </aside>;
}

function NodeInspector({ node, tags, teams, onChange, onDelete }: Readonly<{ node: Node<FlowData> | null; tags: TagOption[]; teams: TeamOption[]; onChange(changes: Partial<FlowData>): void; onDelete(): void }>) {
  if (!node) return <aside className="node-inspector empty"><Bot size={24} /><strong>Configure o mapa</strong><p>Clique em um bloco para editar suas regras e mensagens.</p></aside>;
  const definition = nodeDefinitions.find((item) => item.type === node.type)!;
  if (node.type === 'http_request') return <HttpRequestInspector node={node} onChange={onChange} onDelete={onDelete} />;
  if (node.type === 'ai_conversation') return <aside className="node-inspector"><div className="inspector-title"><span className={definition.tone}><definition.icon size={16} /></span><div><strong>{definition.label}</strong><small>{definition.subtitle}</small></div></div><label className="field"><span>Nome do bloco</span><input value={String(node.data.label || '')} onChange={(event) => onChange({ label: event.target.value })} /></label><label className="field"><span>Objetivo do atendimento</span><textarea rows={4} maxLength={2_000} value={String(node.data.objective || '')} onChange={(event) => onChange({ objective: event.target.value })} placeholder="O que a IA deve descobrir ou resolver?" /></label><label className="field"><span>Instruções específicas</span><textarea rows={5} maxLength={5_000} value={String(node.data.instructions || '')} onChange={(event) => onChange({ instructions: event.target.value })} placeholder="Tom, limites e informações deste fluxo." /></label><label className="field"><span>Critérios de transferência</span><textarea rows={4} maxLength={3_000} value={String(node.data.transferCriteria || '')} onChange={(event) => onChange({ transferCriteria: event.target.value })} placeholder="Quando chamar um atendente?" /></label><div className="form-grid"><label className="field"><span>Limite de interações</span><input type="number" min={1} max={20} value={Number(node.data.maxInteractions || 6)} onChange={(event) => onChange({ maxInteractions: Math.min(20, Math.max(1, Number(event.target.value))) })} /></label><label className="field"><span>Confiança mínima (%)</span><input type="number" min={0} max={100} value={Number(node.data.minimumConfidence ?? 65)} onChange={(event) => onChange({ minimumConfidence: Math.min(100, Math.max(0, Number(event.target.value))) })} /></label></div><label className="field"><span>Mensagem de indisponibilidade</span><textarea rows={3} maxLength={1_000} value={String(node.data.fallbackMessage || '')} onChange={(event) => onChange({ fallbackMessage: event.target.value })} placeholder="Vazio para usar a configuração global." /></label><div className="inspector-note">Quando decidir transferir, o fluxo segue para o próximo bloco. Conecte a saída a <strong>Transferir</strong>.</div><Button variant="ghost" className="delete-node" onClick={onDelete}><Trash2 size={15} />Excluir bloco</Button></aside>;
  return <aside className="node-inspector"><div className="inspector-title"><span className={definition.tone}><definition.icon size={16} /></span><div><strong>{definition.label}</strong><small>{definition.subtitle}</small></div></div><label className="field"><span>Nome do bloco</span><input value={String(node.data.label || '')} onChange={(event) => onChange({ label: event.target.value })} /></label>{node.type === 'trigger' && <><SelectField label="Ativar quando a mensagem" value={String(node.data.operator || 'contains')} onChange={(event) => onChange({ operator: event.target.value })}><option value="contains">Contém</option><option value="equals">É igual a</option><option value="starts_with">Começa com</option><option value="ends_with">Termina com</option></SelectField><label className="field"><span>Palavras de entrada</span><textarea value={String(node.data.value || '')} onChange={(event) => onChange({ value: event.target.value })} placeholder="Deixe vazio para qualquer mensagem" /><small>Separe alternativas por vírgula.</small></label></>}{(node.type === 'message' || node.type === 'question') && <label className="field"><span>{node.type === 'question' ? 'Pergunta' : 'Mensagem'}</span><textarea rows={6} value={String(node.data.text || '')} onChange={(event) => onChange({ text: event.target.value })} /><small>Variáveis: {'{{saudacao}}'}, {'{{nome}}'}, {'{{telefone}}'}, {'{{email}}'}, {'{{empresa}}'}, {'{{cargo}}'} e {'{{mensagem}}'}. Variáveis capturadas também podem ser usadas aqui.</small></label>}{node.type === 'question' && <label className="field"><span>Salvar resposta na variável</span><input value={String(node.data.responseVariable || '')} onChange={(event) => onChange({ responseVariable: event.target.value })} placeholder="Ex.: cnpj" maxLength={50} /><small>Use letras, números e _. Depois acesse com {'{{cnpj}}'} nos próximos blocos.</small></label>}{node.type === 'wait' && <label className="field"><span>Tempo de espera em segundos</span><input type="number" min={1} step={1} value={Number(node.data.seconds || 1)} onChange={(event) => onChange({ seconds: Math.max(1, Number(event.target.value)) })} /><small>O chatbot continua automaticamente depois deste período.</small></label>}{node.type === 'condition' && <><SelectField label="A resposta" value={String(node.data.operator || 'contains')} onChange={(event) => onChange({ operator: event.target.value })}><option value="contains">Contém</option><option value="equals">É igual a</option><option value="starts_with">Começa com</option><option value="ends_with">Termina com</option></SelectField><label className="field"><span>Valor esperado</span><textarea value={String(node.data.value || '')} onChange={(event) => onChange({ value: event.target.value })} placeholder="Ex.: vendas, comercial" /><small>A saída Sim é usada quando a regra corresponde.</small></label></>}{node.type === 'add_tag' && <SelectField label="Tag" value={String(node.data.tagId || '')} onChange={(event) => onChange({ tagId: event.target.value })}><option value="">Selecione</option>{tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}</SelectField>}{node.type === 'assign_queue' && <><SelectField label="Fila de destino" value={String(node.data.teamId || '')} onChange={(event) => onChange({ teamId: event.target.value })}><option value="">Selecione</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</SelectField><div className="inspector-note">A fila é atribuída e o chatbot continua para o próximo bloco.</div></>}{node.type === 'handoff' && <div className="inspector-note">O bot para de responder e o ticket fica na aba <strong>Aguardando</strong>, preservando a fila escolhida.</div>}{node.type === 'close' && <div className="inspector-note">O fluxo termina e o ticket vai para <strong>Encerradas</strong>.</div>}{node.type === 'end' && <div className="inspector-note">O bot termina, mas o ticket continua aguardando atendimento.</div>}{node.type !== 'trigger' && <Button variant="ghost" className="delete-node" onClick={onDelete}><Trash2 size={15} />Excluir bloco</Button>}</aside>;
}
