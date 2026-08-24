import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { renderTemplateVariables } from '@prospecta/contracts';
import {
  ReactFlow, Background, Controls, MiniMap, Handle, Position, addEdge,
  useEdgesState, useNodesState, type Connection, type Edge, type Node, type NodeProps,
} from '@xyflow/react';
import { ArrowRightLeft, Bell, Bot, Braces, ChevronLeft, CircleStop, Clock3, GitBranch, MessageSquareText, MousePointerClick, Plus, Save, Send, Tag, Trash2, UserRoundCheck, Workflow } from 'lucide-react';
import { api, dateTime, type Envelope } from '../lib/api';
import { Button, Empty, Field, Modal, PageLoading, SelectField, Status } from '../components/ui';
import { WhatsappText } from '../components/WhatsappText';
import { useTheme } from '../lib/theme';
import { toast } from '../lib/toast';
import '@xyflow/react/dist/style.css';

type FlowData = { label?: string; subtitle?: string; [key: string]: unknown };
type WorkflowRecord = { id: string; name: string; description?: string; status: string; publishedVersion?: number; updatedAt: string; versions: Array<{ id: string; version: number; graph: { nodes: Node<FlowData>[]; edges: Edge[] }; publishedAt?: string }>; _count?: { enrollments: number } };
type AutomationMetadata = {
  users: Array<{ id: string; name: string; teamIds: string[] }>;
  teams: Array<{ id: string; name: string; color: string; isDefault?: boolean }>;
  tags: Array<{ id: string; name: string; color: string }>;
  customFields: Array<{ id: string; key: string; label: string; fieldType: string; entityType: string }>;
  instances: Array<{ id: string; name: string; phone?: string; status: string }>;
  pipelines: Array<{ id: string; name: string; stages: Array<{ id: string; name: string; position: number }> }>;
};

const nodeDefinitions = [
  { type: 'trigger', label: 'Gatilho', subtitle: 'Início do fluxo', icon: MousePointerClick, tone: 'violet' },
  { type: 'condition', label: 'Condição', subtitle: 'Cria uma ramificação', icon: GitBranch, tone: 'amber' },
  { type: 'send_whatsapp', label: 'Enviar WhatsApp', subtitle: 'Texto ou mídia', icon: MessageSquareText, tone: 'green' },
  { type: 'wait', label: 'Aguardar', subtitle: 'Pausa programada', icon: Clock3, tone: 'blue' },
  { type: 'update_record', label: 'Atualizar contato', subtitle: 'Campo do CRM', icon: Braces, tone: 'slate' },
  { type: 'move_stage', label: 'Mover etapa', subtitle: 'Oportunidade do contato', icon: ArrowRightLeft, tone: 'slate' },
  { type: 'assign', label: 'Atribuir', subtitle: 'Usuário ou equipe', icon: UserRoundCheck, tone: 'slate' },
  { type: 'assign_queue', label: 'Atribuir fila', subtitle: 'Move o atendimento', icon: UserRoundCheck, tone: 'violet' },
  { type: 'add_tag', label: 'Adicionar tag', subtitle: 'Organizar contato', icon: Tag, tone: 'slate' },
  { type: 'remove_tag', label: 'Remover tag', subtitle: 'Desmarcar contato', icon: Tag, tone: 'slate' },
  { type: 'create_task', label: 'Criar tarefa', subtitle: 'Próxima ação', icon: Plus, tone: 'slate' },
  { type: 'notify', label: 'Notificar', subtitle: 'Alerta interno', icon: Bell, tone: 'slate' },
  { type: 'end', label: 'Fim', subtitle: 'Encerra o fluxo', icon: CircleStop, tone: 'rose' },
];

function FlowNode({ data, type, selected }: NodeProps<Node<FlowData>>) {
  const definition = nodeDefinitions.find((item) => item.type === type) || nodeDefinitions[4];
  return <div className={`flow-node ${definition.tone} ${selected ? 'selected' : ''}`}><Handle type="target" position={Position.Left} /><span><definition.icon size={17} /></span><div><strong>{String(data.label || definition.label)}</strong><small>{String(data.subtitle || definition.subtitle)}</small></div>{type !== 'end' && type !== 'condition' && <Handle type="source" position={Position.Right} />}{type === 'condition' && <><Handle id="true" type="source" position={Position.Right} style={{ top: '35%' }} /><Handle id="false" type="source" position={Position.Right} style={{ top: '70%' }} /></>}</div>;
}

const nodeTypes = Object.fromEntries(nodeDefinitions.map((item) => [item.type, FlowNode]));
const automationMessageVariables = ['saudacao', 'nome', 'telefone', 'email', 'empresa', 'cargo'] as const;
const flowString = (value: unknown, fallback = '') => (
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? String(value)
    : fallback
);

export function AutomationsPage() {
  const client = useQueryClient(); const [selected, setSelected] = useState<WorkflowRecord | null>(null); const [modal, setModal] = useState(false); const [deleting, setDeleting] = useState<WorkflowRecord | null>(null);
  const [filter, setFilter] = useState<'all' | 'PUBLISHED' | 'DRAFT'>('all');
  const query = useQuery({ queryKey: ['workflows'], queryFn: () => api<Envelope<WorkflowRecord[]>>('/workflows') });
  const metadata = useQuery({ queryKey: ['workflow-metadata'], queryFn: () => api<Envelope<AutomationMetadata>>('/workflows/metadata') });
  if (query.isLoading || metadata.isLoading) return <PageLoading />;
  if (selected) return <WorkflowBuilder workflowId={selected.id} metadata={metadata.data!.data} onBack={() => { setSelected(null); client.invalidateQueries({ queryKey: ['workflows'] }); }} />;
  const allWorkflows = query.data?.data || [];
  const workflows = filter === 'all' ? allWorkflows : allWorkflows.filter((workflow) => workflow.status === filter);
  return <div className="automations-page">
    <div className="toolbar">
      <fieldset className="segmented" aria-label="Filtrar automações" style={{ margin: 0, minWidth: 0 }}>
        <button type="button" className={filter === 'all' ? 'active' : ''} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>Todas</button>
        <button type="button" className={filter === 'PUBLISHED' ? 'active' : ''} aria-pressed={filter === 'PUBLISHED'} onClick={() => setFilter('PUBLISHED')}>Publicadas</button>
        <button type="button" className={filter === 'DRAFT' ? 'active' : ''} aria-pressed={filter === 'DRAFT'} onClick={() => setFilter('DRAFT')}>Rascunhos</button>
      </fieldset>
      <Button onClick={() => setModal(true)}><Plus size={15} />Nova automação</Button>
    </div>
    {workflows.length
      ? <div className="workflow-grid">{workflows.map((workflow) => <div className="workflow-card-shell" key={workflow.id}><button type="button" className="workflow-card-main" onClick={() => setSelected(workflow)}><div className="workflow-icon"><Workflow size={20} /></div><div className="workflow-card-header"><Status value={workflow.status} /><span>v{workflow.versions[0]?.version || 1}</span></div><h3>{workflow.name}</h3><p>{workflow.description || 'Automação de WhatsApp e CRM'}</p><footer><span>{workflow._count?.enrollments || 0} inscrições</span><span>Atualizada {dateTime(workflow.updatedAt)}</span></footer></button><button type="button" className="workflow-card-delete" title={`Excluir automação ${workflow.name}`} aria-label={`Excluir automação ${workflow.name}`} onClick={() => setDeleting(workflow)}><Trash2 size={16} /></button></div>)}</div>
      : <Empty icon={<Bot />} title={allWorkflows.length ? 'Nenhuma automação neste filtro' : 'Crie sua primeira automação'} description="Monte jornadas com gatilhos, condições, mensagens e ações no CRM." action={<Button onClick={() => setModal(true)}>Nova automação</Button>} />}
    {modal && <CreateWorkflowModal onClose={() => setModal(false)} onCreated={(workflow) => { setModal(false); setSelected(workflow); }} />}
    {deleting && <DeleteWorkflowModal workflow={deleting} onClose={() => setDeleting(null)} onDeleted={() => { setDeleting(null); void client.invalidateQueries({ queryKey: ['workflows'] }); }} />}
  </div>;
}

function DeleteWorkflowModal({ workflow, onClose, onDeleted }: Readonly<{ workflow: WorkflowRecord; onClose(): void; onDeleted(): void }>) {
  const mutation = useMutation({
    mutationFn: () => api(`/workflows/${workflow.id}`, { method: 'DELETE' }),
    onSuccess: () => { toast.success('Automação excluída.'); onDeleted(); },
  });
  return <Modal title="Excluir automação" onClose={() => !mutation.isPending && onClose()}><div className="delete-confirm"><div className="delete-confirm-icon"><Trash2 size={22} /></div><div><h3>Excluir “{workflow.name}”?</h3><p>A automação deixará de aparecer e suas execuções ativas serão interrompidas. O histórico já registrado será preservado para auditoria.</p></div></div><div className="modal-actions delete-actions"><Button variant="secondary" disabled={mutation.isPending} onClick={onClose}>Cancelar</Button><Button variant="danger" loading={mutation.isPending} onClick={() => mutation.mutate()}><Trash2 size={16} />Excluir automação</Button></div></Modal>;
}

function CreateWorkflowModal({ onClose, onCreated }: Readonly<{ onClose(): void; onCreated(workflow: WorkflowRecord): void }>) {
  const [name, setName] = useState(''); const [description, setDescription] = useState('');
  const mutation = useMutation({ mutationFn: () => api<Envelope<WorkflowRecord>>('/workflows', { method: 'POST', body: JSON.stringify({ name, description }) }), onSuccess: (result) => { toast.success('Automação criada.'); onCreated(result.data); } });
  return <Modal title="Nova automação" onClose={onClose}><form className="modal-form" onSubmit={(event: FormEvent) => { event.preventDefault(); mutation.mutate(); }}><Field label="Nome da automação" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Cadência de novos leads" required /><Field label="Descrição" value={description} onChange={(event) => setDescription(event.target.value)} /><div className="modal-actions"><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" loading={mutation.isPending}>Criar e editar</Button></div></form></Modal>;
}

function WorkflowBuilder({ workflowId, metadata, onBack }: Readonly<{ workflowId: string; metadata: AutomationMetadata; onBack(): void }>) {
  const { theme } = useTheme();
  const query = useQuery({ queryKey: ['workflow', workflowId], queryFn: () => api<Envelope<WorkflowRecord>>(`/workflows/${workflowId}`) });
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<FlowData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  useEffect(() => { if (query.data?.data.versions[0]) { setNodes(query.data.data.versions[0].graph.nodes || []); setEdges(query.data.data.versions[0].graph.edges || []); } }, [query.data, setNodes, setEdges]);
  const graph = useMemo(() => ({ nodes, edges }), [nodes, edges]);
  const save = useMutation({ mutationFn: () => api(`/workflows/${workflowId}/draft`, { method: 'PATCH', body: JSON.stringify({ graph }) }), onSuccess: () => { toast.success('Automação salva.'); return query.refetch(); } });
  const publish = useMutation({ mutationFn: async () => {
    await api(`/workflows/${workflowId}/draft`, { method: 'PATCH', body: JSON.stringify({ graph }) });
    return api(`/workflows/${workflowId}/publish`, { method: 'POST' });
  }, onSuccess: () => { toast.success('Automação publicada.'); return query.refetch(); } });
  const onConnect = useCallback((connection: Connection) => setEdges((current) => addEdge({ ...connection, animated: true, style: { stroke: '#7c6ff2' } }, current)), [setEdges]);
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) || null;
  const updateSelected = (changes: Partial<FlowData>) => setNodes((current) => current.map((node) => node.id === selectedNodeId ? { ...node, data: { ...node.data, ...changes } } : node));
  const deleteSelected = () => {
    if (!selectedNode || selectedNode.type === 'trigger') return;
    setNodes((current) => current.filter((node) => node.id !== selectedNode.id));
    setEdges((current) => current.filter((edge) => edge.source !== selectedNode.id && edge.target !== selectedNode.id));
    setSelectedNodeId(null);
  };
  const addNode = (type: string) => {
    const definition = nodeDefinitions.find((item) => item.type === type)!;
    const id = `${type}-${Date.now()}`;
    setNodes((current) => [...current, {
      id,
      type,
      position: { x: 280 + current.length * 32, y: 100 + current.length * 72 },
      data: {
        label: definition.label,
        subtitle: definition.subtitle,
        ...(type === 'wait' ? { seconds: 1 } : {}),
        ...(type === 'send_whatsapp' ? { text: 'Olá {{nome}}, tudo bem?' } : {}),
        ...(type === 'condition' ? { field: 'consentStatus', operator: 'equals', value: 'GRANTED' } : {}),
        ...(type === 'update_record' ? { field: 'source', value: 'Automação' } : {}),
        ...(type === 'move_stage' ? { stageId: metadata.pipelines[0]?.stages[0]?.id || '' } : {}),
        ...(type === 'assign_queue' ? { teamId: metadata.teams[0]?.id || '' } : {}),
        ...(type === 'create_task' ? { title: 'Acompanhar contato', dueInHours: 24 } : {}),
        ...(type === 'notify' ? { title: 'Contato em automação', body: 'O contato chegou a esta etapa do fluxo.' } : {}),
      },
    }]);
    setSelectedNodeId(id);
  };
  if (query.isLoading) return <PageLoading />;
  const workflow = query.data!.data;
  return <div className="workflow-builder">
    <header className="builder-header"><div><button type="button" className="icon-button" onClick={onBack}><ChevronLeft size={18} /></button><div><h2>{workflow.name}</h2><span><Status value={workflow.status} /> · Versão {workflow.versions[0]?.version}</span></div></div><div><Button variant="secondary" onClick={() => save.mutate()} loading={save.isPending}><Save size={15} />Salvar</Button><Button onClick={() => publish.mutate()} loading={publish.isPending}><Send size={15} />Publicar</Button></div></header>
    <div className="builder-body automation-builder-body">
      <aside className="node-palette"><span className="nav-section">Blocos</span>{nodeDefinitions.filter((item) => item.type !== 'trigger').map((item) => <button type="button" key={item.type} onClick={() => addNode(item.type)}><span className={item.tone}><item.icon size={15} /></span><div><strong>{item.label}</strong><small>{item.subtitle}</small></div></button>)}</aside>
      <div className="flow-canvas"><ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onNodeClick={(_, node) => setSelectedNodeId(node.id)} onPaneClick={() => setSelectedNodeId(null)} nodeTypes={nodeTypes} fitView colorMode={theme}><Background gap={20} size={1} color={theme === 'dark' ? '#38414a' : '#e4e2ee'} /><Controls /><MiniMap pannable zoomable nodeColor="#7c6ff2" maskColor={theme === 'dark' ? 'rgba(25,29,34,.72)' : 'rgba(245,244,249,.75)'} /></ReactFlow></div>
      <AutomationNodeInspector node={selectedNode} metadata={metadata} onChange={updateSelected} onDelete={deleteSelected} />
    </div>
  </div>;
}

function AutomationNodeInspector({ node, metadata, onChange, onDelete }: Readonly<{ node: Node<FlowData> | null; metadata: AutomationMetadata; onChange(changes: Partial<FlowData>): void; onDelete(): void }>) {
  if (!node) return <aside className="node-inspector empty"><Workflow size={24} /><strong>Configure a automação</strong><p>Clique em um bloco para editar sua mensagem ou suas configurações.</p></aside>;
  const definition = nodeDefinitions.find((item) => item.type === node.type) || nodeDefinitions[4];
  const message = flowString(node.data.text);
  const contactCustomFields = metadata.customFields.filter((field) => ['contact', 'contato'].includes(field.entityType.toLocaleLowerCase('pt-BR')));
  const updateMessage = (value: string) => onChange({
    text: value,
    subtitle: value.trim() ? value.trim().replace(/\s+/g, ' ').slice(0, 42) : 'Mensagem vazia',
  });
  return <aside className="node-inspector automation-node-inspector">
    <div className="inspector-title"><span className={definition.tone}><definition.icon size={16} /></span><div><strong>{definition.label}</strong><small>{definition.subtitle}</small></div></div>
    <label className="field"><span>Nome do bloco</span><input value={flowString(node.data.label)} onChange={(event) => onChange({ label: event.target.value })} /></label>
    {node.type === 'trigger' && <div className="inspector-note">O fluxo inicia por inscrição manual, pelo comando <strong>@</strong> no chat ou pelos demais gatilhos configurados no sistema.</div>}
    {node.type === 'send_whatsapp' && <>
      <SelectField label="Número de envio" value={flowString(node.data.instanceId)} onChange={(event) => onChange({ instanceId: event.target.value })}><option value="">Usar o número da conversa</option>{metadata.instances.map((instance) => <option key={instance.id} value={instance.id}>{instance.name}{instance.phone ? ` · ${instance.phone}` : ''}{instance.status !== 'CONNECTED' ? ' · Desconectado' : ''}</option>)}</SelectField>
      <label className="field automation-message-field"><span>Mensagem do WhatsApp</span><textarea rows={8} autoFocus value={message} onChange={(event) => updateMessage(event.target.value)} placeholder="Digite a mensagem que será enviada…" /><small>{message.length} caracteres</small></label>
      <div className="automation-variable-row"><span>Variáveis</span>{automationMessageVariables.map((variable) => <button key={variable} type="button" onClick={() => updateMessage(`${message}${message && !message.endsWith(' ') ? ' ' : ''}{{${variable}}}`)}>{`{{${variable}}}`}</button>)}</div>
      <div className="automation-message-preview"><span>Prévia para o contato</span><div>{message.trim() ? <WhatsappText text={renderTemplateVariables(message, { nome: 'Adriana' })} /> : <em>Digite uma mensagem para visualizar.</em>}</div></div>
      <p className="inspector-note">Quando iniciada pelo comando <strong>@</strong> no chat, esta mensagem será enviada exclusivamente para o contato daquela conversa.</p>
    </>}
    {node.type === 'condition' && <>
      <SelectField label="Campo do contato" value={flowString(node.data.field)} onChange={(event) => onChange({ field: event.target.value })}><option value="">Selecione</option><option value="name">Nome</option><option value="email">E-mail</option><option value="phone">Telefone</option><option value="jobTitle">Cargo</option><option value="source">Origem</option><option value="consentStatus">Consentimento</option>{contactCustomFields.map((field) => <option key={field.id} value={`customFields.${field.key}`}>{field.label}</option>)}</SelectField>
      <SelectField label="Regra" value={flowString(node.data.operator, 'equals')} onChange={(event) => onChange({ operator: event.target.value })}><option value="equals">É igual a</option><option value="not_equals">É diferente de</option><option value="contains">Contém</option><option value="is_empty">Está vazio</option></SelectField>
      {node.data.operator !== 'is_empty' && <label className="field"><span>Valor esperado</span><input value={flowString(node.data.value)} onChange={(event) => onChange({ value: event.target.value })} placeholder="Ex.: GRANTED" /></label>}
      <div className="inspector-note">Conecte as saídas <strong>Sim</strong> e <strong>Não</strong> aos próximos blocos.</div>
    </>}
    {node.type === 'wait' && <label className="field"><span>Tempo de espera em segundos</span><input type="number" min={1} step={1} value={Number(node.data.seconds ?? (Number(node.data.minutes || 1) * 60))} onChange={(event) => onChange({ seconds: Math.max(1, Number(event.target.value)), minutes: undefined })} /><small>O fluxo continua automaticamente depois deste período.</small></label>}
    {node.type === 'update_record' && <>
      <SelectField label="Campo a atualizar" value={flowString(node.data.field)} onChange={(event) => onChange({ field: event.target.value })}><option value="">Selecione</option><option value="name">Nome</option><option value="email">E-mail</option><option value="jobTitle">Cargo</option><option value="source">Origem</option>{contactCustomFields.map((field) => <option key={field.id} value={field.key}>{field.label}</option>)}</SelectField>
      <label className="field"><span>Novo valor</span><input value={flowString(node.data.value)} onChange={(event) => onChange({ value: event.target.value })} /></label>
    </>}
    {node.type === 'move_stage' && <SelectField label="Etapa de destino" value={flowString(node.data.stageId)} onChange={(event) => onChange({ stageId: event.target.value })}><option value="">Selecione</option>{metadata.pipelines.map((pipeline) => <optgroup key={pipeline.id} label={pipeline.name}>{pipeline.stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</optgroup>)}</SelectField>}
    {node.type === 'assign' && <>
      <SelectField label="Responsável" value={flowString(node.data.userId)} onChange={(event) => onChange({ userId: event.target.value })}><option value="">Não alterar</option>{metadata.users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</SelectField>
      <SelectField label="Equipe" value={flowString(node.data.teamId)} onChange={(event) => onChange({ teamId: event.target.value })}><option value="">Não alterar</option>{metadata.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</SelectField>
    </>}
    {node.type === 'assign_queue' && <><SelectField label="Fila de destino" value={flowString(node.data.teamId)} onChange={(event) => onChange({ teamId: event.target.value })}><option value="">Selecione</option>{metadata.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</SelectField><div className="inspector-note">Exige um ticket no contexto. Se a automação começou sem atendimento, use antes um bloco <strong>Enviar WhatsApp</strong> para criar e guardar a conversa.</div></>}
    {(node.type === 'add_tag' || node.type === 'remove_tag') && <SelectField label={node.type === 'add_tag' ? 'Tag a adicionar' : 'Tag a remover'} value={flowString(node.data.tagId)} onChange={(event) => onChange({ tagId: event.target.value })}><option value="">Selecione</option>{metadata.tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}</SelectField>}
    {node.type === 'create_task' && <>
      <label className="field"><span>Título da tarefa</span><input value={flowString(node.data.title)} onChange={(event) => onChange({ title: event.target.value })} /></label>
      <label className="field"><span>Prazo em horas</span><input type="number" min={1} step={1} value={Number(node.data.dueInHours || 24)} onChange={(event) => onChange({ dueInHours: Math.max(1, Number(event.target.value)) })} /></label>
      <SelectField label="Responsável pela tarefa" value={flowString(node.data.assigneeId)} onChange={(event) => onChange({ assigneeId: event.target.value })}><option value="">Responsável do contato</option>{metadata.users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</SelectField>
    </>}
    {node.type === 'notify' && <>
      <SelectField label="Notificar" value={flowString(node.data.userId)} onChange={(event) => onChange({ userId: event.target.value })}><option value="">Responsável do contato</option>{metadata.users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</SelectField>
      <label className="field"><span>Título</span><input value={flowString(node.data.title)} onChange={(event) => onChange({ title: event.target.value })} /></label>
      <label className="field"><span>Mensagem interna</span><textarea rows={4} value={flowString(node.data.body)} onChange={(event) => onChange({ body: event.target.value })} /></label>
    </>}
    {node.type === 'end' && <div className="inspector-note">A execução deste contato será concluída neste ponto.</div>}
    {node.type !== 'trigger' && <Button variant="ghost" className="delete-node" onClick={onDelete}><Trash2 size={15} />Excluir bloco</Button>}
  </aside>;
}
