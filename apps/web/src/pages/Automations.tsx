import { FormEvent, createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { renderTemplateVariables } from '@prospecta/contracts';
import {
  ReactFlow, Background, Controls, MiniMap, Handle, Position, addEdge,
  useEdgesState, useNodesState, type Connection, type Edge, type Node, type NodeProps, type ReactFlowInstance,
} from '@xyflow/react';
import { ArrowRightLeft, Bell, Bot, Braces, ChevronLeft, CircleStop, Clock3, GitBranch, LayoutDashboard, MessageSquareText, MousePointerClick, Pause, Play, Plus, Save, Send, Tag, Trash2, UserRoundCheck, Workflow } from 'lucide-react';
import { api, dateTime, type Envelope } from '../lib/api';
import { Button, Empty, Field, Modal, PageLoading, Status } from '../components/ui';
import { ConnectionPicker } from '../components/ConnectionPicker';
import { WhatsappText } from '../components/WhatsappText';
import { useTheme } from '../lib/theme';
import { toast } from '../lib/toast';
import '@xyflow/react/dist/style.css';

type FlowData = { label?: string; subtitle?: string; [key: string]: unknown };
type WorkflowGraph = { nodes: Node<FlowData>[]; edges: Edge[] };
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
] as const;

const AUTOMATION_NODE_DRAG_TYPE = 'application/x-bzs-automation-node';
const automationMessageVariables = ['saudacao', 'nome', 'telefone', 'email', 'empresa', 'cargo'] as const;
const flowString = (value: unknown, fallback = '') => (
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? String(value)
    : fallback
);

function graphSnapshot(graph: WorkflowGraph) {
  return JSON.stringify({
    nodes: graph.nodes.map((node) => {
      const snapshot = { ...node };
      delete snapshot.selected;
      delete snapshot.dragging;
      delete snapshot.measured;
      delete snapshot.resizing;
      return snapshot;
    }),
    edges: graph.edges.map((edge) => {
      const snapshot = { ...edge };
      delete snapshot.selected;
      return snapshot;
    }),
  });
}

function estimatedAutomationNodeHeight(node: Node<FlowData>) {
  if (node.measured?.height) return node.measured.height;
  const textLength = String(node.data.text || '').length;
  const textLines = Math.max(1, Math.ceil(textLength / 46));
  if (node.type === 'send_whatsapp') return 300 + Math.max(0, textLines - 4) * 18;
  if (node.type === 'condition') return 260;
  if (node.type === 'notify') return 250;
  if (node.type === 'create_task') return 220;
  if (node.type === 'update_record' || node.type === 'move_stage' || node.type === 'assign' || node.type === 'assign_queue') return 190;
  if (node.type === 'add_tag' || node.type === 'remove_tag' || node.type === 'wait') return 165;
  if (node.type === 'trigger') return 165;
  return 145;
}

function layoutAutomationNodes(nodes: Node<FlowData>[], edges: Edge[]) {
  if (!nodes.length) return nodes;
  const nodeIds = new Set(nodes.map((node) => node.id));
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  const edgeOrder = new Map<string, number>();
  nodes.forEach((node) => { outgoing.set(node.id, []); incoming.set(node.id, []); });
  edges.forEach((edge, index) => {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) return;
    outgoing.get(edge.source)!.push(edge.target);
    incoming.get(edge.target)!.push(edge.source);
    if (!edgeOrder.has(edge.target)) edgeOrder.set(edge.target, index);
  });
  const ranks = new Map<string, number>();
  const trigger = nodes.find((node) => node.type === 'trigger');
  const queue = [trigger?.id || nodes[0]!.id];
  ranks.set(queue[0]!, 0);
  while (queue.length) {
    const current = queue.shift()!;
    const nextRank = ranks.get(current)! + 1;
    outgoing.get(current)?.forEach((target) => {
      if (ranks.has(target)) return;
      ranks.set(target, nextRank);
      queue.push(target);
    });
  }
  const maxRank = Math.max(...ranks.values(), 0);
  nodes.forEach((node, index) => {
    if (!ranks.has(node.id)) ranks.set(node.id, maxRank + 1 + Math.floor(index / 6));
  });
  const layers = new Map<number, Node<FlowData>[]>();
  nodes.forEach((node) => {
    const rank = ranks.get(node.id)!;
    const layer = layers.get(rank) || [];
    layer.push(node);
    layers.set(rank, layer);
  });
  const originalOrder = new Map(nodes.map((node, index) => [node.id, index]));
  layers.forEach((layer) => layer.sort((left, right) => (left.position.y - right.position.y) || (originalOrder.get(left.id)! - originalOrder.get(right.id)!)));
  const medianNeighborRank = (nodeId: string, neighbors: Map<string, string[]>, neighborOrder: Map<string, number>) => {
    const positions = (neighbors.get(nodeId) || []).map((neighborId) => neighborOrder.get(neighborId)).filter((position): position is number => position !== undefined).sort((left, right) => left - right);
    if (!positions.length) return null;
    return positions[Math.floor((positions.length - 1) / 2)]!;
  };
  const currentLayerOrder = (rank: number) => new Map((layers.get(rank) || []).map((node, index) => [node.id, index]));
  for (let iteration = 0; iteration < 6; iteration += 1) {
    for (let rank = 1; rank <= maxRank; rank += 1) {
      const layer = layers.get(rank);
      if (!layer) continue;
      const previousOrder = currentLayerOrder(rank - 1);
      layer.sort((left, right) => {
        const leftMedian = medianNeighborRank(left.id, incoming, previousOrder);
        const rightMedian = medianNeighborRank(right.id, incoming, previousOrder);
        if (leftMedian !== null && rightMedian !== null && leftMedian !== rightMedian) return leftMedian - rightMedian;
        if (leftMedian !== null) return -1;
        if (rightMedian !== null) return 1;
        return (edgeOrder.get(left.id) ?? originalOrder.get(left.id)!) - (edgeOrder.get(right.id) ?? originalOrder.get(right.id)!);
      });
    }
    for (let rank = maxRank - 1; rank >= 1; rank -= 1) {
      const layer = layers.get(rank);
      if (!layer) continue;
      const nextOrder = currentLayerOrder(rank + 1);
      layer.sort((left, right) => {
        const leftMedian = medianNeighborRank(left.id, outgoing, nextOrder);
        const rightMedian = medianNeighborRank(right.id, outgoing, nextOrder);
        if (leftMedian !== null && rightMedian !== null && leftMedian !== rightMedian) return leftMedian - rightMedian;
        if (leftMedian !== null) return -1;
        if (rightMedian !== null) return 1;
        return (edgeOrder.get(left.id) ?? originalOrder.get(left.id)!) - (edgeOrder.get(right.id) ?? originalOrder.get(right.id)!);
      });
    }
  }
  const gapX = 150;
  const gapY = 46;
  const columnWidth = 320 + gapX;
  const layerHeights = new Map<number, number>();
  let canvasHeight = 0;
  layers.forEach((layer, rank) => {
    const height = layer.reduce((total, node) => total + estimatedAutomationNodeHeight(node), 0) + Math.max(0, layer.length - 1) * gapY;
    layerHeights.set(rank, height);
    canvasHeight = Math.max(canvasHeight, height);
  });
  const positions = new Map<string, { x: number; y: number }>();
  layers.forEach((layer, rank) => {
    const layerHeight = layerHeights.get(rank)!;
    let y = 40 + (canvasHeight - layerHeight) / 2;
    layer.forEach((node) => {
      positions.set(node.id, { x: 40 + rank * columnWidth, y });
      y += estimatedAutomationNodeHeight(node) + gapY;
    });
  });
  return nodes.map((node) => ({ ...node, position: positions.get(node.id) || node.position }));
}

function validationNodeIds(error: unknown, graph: WorkflowGraph) {
  const message = error instanceof Error ? error.message.toLocaleLowerCase() : '';
  if (!message) return [];
  const labeledNodes = graph.nodes.filter((node) => {
    const label = String(node.data?.label || '').trim().toLocaleLowerCase();
    return label.length > 2 && message.includes(label);
  });
  if (labeledNodes.length) return labeledNodes.map((node) => node.id);
  const matches = (types: string[]) => graph.nodes.filter((node) => types.includes(node.type || '')).map((node) => node.id);
  if (message.includes('mensagem do bloco')) return matches(['send_whatsapp']);
  if (message.includes('campo do bloco condição')) return matches(['condition']);
  if (message.includes('tempo de espera')) return matches(['wait']);
  if (message.includes('campo que será atualizado')) return matches(['update_record']);
  if (message.includes('etapa de destino')) return matches(['move_stage']);
  if (message.includes('usuário ou equipe')) return matches(['assign']);
  if (message.includes('fila de destino') || message.includes('fila usada')) return matches(['assign_queue']);
  if (message.includes('tag da automação')) return matches(['add_tag', 'remove_tag']);
  if (message.includes('todos os blocos precisam estar conectados')) {
    const trigger = graph.nodes.find((node) => node.type === 'trigger');
    if (!trigger) return [];
    const reachable = new Set<string>();
    const visit = (id: string) => {
      if (reachable.has(id)) return;
      reachable.add(id);
      graph.edges.filter((edge) => edge.source === id).forEach((edge) => visit(edge.target));
    };
    visit(trigger.id);
    return graph.nodes.filter((node) => !reachable.has(node.id)).map((node) => node.id);
  }
  return [];
}

type AutomationNodeContextValue = {
  metadata: AutomationMetadata;
  onChange(nodeId: string, changes: Partial<FlowData>): void;
  onDelete(nodeId: string): void;
};

const AutomationNodeContext = createContext<AutomationNodeContextValue | null>(null);

function stopNodeInteraction(event: React.PointerEvent<HTMLElement>) {
  event.stopPropagation();
}

function InlineField({ label, hint, className, children }: Readonly<{ label: string; hint?: string; className?: string; children: React.ReactNode }>) {
  return <label className={`chatbot-node-field nodrag${className ? ` ${className}` : ''}`} onPointerDown={stopNodeInteraction}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

function AutoResizeTextarea({ value, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const resize = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = '0px';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, []);
  useLayoutEffect(() => resize(), [resize, value]);
  return <textarea {...props} ref={textareaRef} value={value} />;
}

function AutomationNode({ id, data, type, selected }: NodeProps<Node<FlowData>>) {
  const definition = nodeDefinitions.find((item) => item.type === type) || nodeDefinitions[1];
  const editor = useContext(AutomationNodeContext);
  const metadata = editor?.metadata;
  const update = (changes: Partial<FlowData>) => editor?.onChange(id, changes);
  const contactCustomFields = metadata?.customFields.filter((field) => ['contact', 'contato'].includes(field.entityType.toLocaleLowerCase('pt-BR'))) || [];
  const message = flowString(data.text);
  const updateMessage = (value: string) => update({ text: value, subtitle: value.trim() ? value.trim().replace(/\s+/g, ' ').slice(0, 42) : 'Mensagem vazia' });
  const terminal = type === 'end';
  return <div className={`flow-node chatbot-node ${definition.tone} ${selected ? 'selected' : ''}`}>
    {type !== 'trigger' && <Handle type="target" position={Position.Left} />}
    <div className="chatbot-node-header">
      <span className="chatbot-node-icon"><definition.icon size={17} /></span>
      <div className="chatbot-node-heading"><strong>{definition.label}</strong><small>{String(data.subtitle || definition.subtitle)}</small></div>
      {editor && type !== 'trigger' && <button type="button" className="chatbot-node-delete nodrag" aria-label={`Excluir bloco ${definition.label}`} onPointerDown={stopNodeInteraction} onClick={() => editor.onDelete(id)}><Trash2 size={14} /></button>}
    </div>
    <div className="chatbot-node-body">
      {type === 'trigger' && <p className="chatbot-node-note">O fluxo inicia por inscrição manual, pelo comando <strong>@</strong> no chat ou pelos demais gatilhos configurados no sistema.</p>}
      {type === 'send_whatsapp' && <>
        <InlineField label="Número de envio"><ConnectionPicker options={metadata?.instances || []} value={flowString(data.instanceId)} onChange={(value) => update({ instanceId: value })} allowEmpty emptyLabel="Usar o número da conversa" ariaLabel="Número de envio" /></InlineField>
        <InlineField label="Mensagem do WhatsApp" hint={`${message.length} caracteres`}><AutoResizeTextarea rows={5} value={message} onChange={(event) => updateMessage(event.target.value)} placeholder="Digite a mensagem que será enviada…" /></InlineField>
        <div className="automation-variable-row"><span>Variáveis</span>{automationMessageVariables.map((variable) => <button type="button" className="nodrag" key={variable} onPointerDown={stopNodeInteraction} onClick={() => updateMessage(`${message}${message && !message.endsWith(' ') ? ' ' : ''}{{${variable}}}`)}>{`{{${variable}}}`}</button>)}</div>
        <div className="automation-message-preview"><span>Prévia para o contato</span><div>{message.trim() ? <WhatsappText text={renderTemplateVariables(message, { nome: 'Adriana' })} /> : <em>Digite uma mensagem para visualizar.</em>}</div></div>
        <p className="chatbot-node-note">Quando iniciada pelo comando <strong>@</strong> no chat, esta mensagem será enviada exclusivamente para o contato daquela conversa.</p>
      </>}
      {type === 'condition' && <>
        <InlineField label="Campo do contato"><select value={flowString(data.field)} onChange={(event) => update({ field: event.target.value })}><option value="">Selecione</option><option value="name">Nome</option><option value="email">E-mail</option><option value="phone">Telefone</option><option value="jobTitle">Cargo</option><option value="source">Origem</option><option value="consentStatus">Consentimento</option>{contactCustomFields.map((field) => <option key={field.id} value={`customFields.${field.key}`}>{field.label}</option>)}</select></InlineField>
        <InlineField label="Regra"><select value={flowString(data.operator, 'equals')} onChange={(event) => update({ operator: event.target.value })}><option value="equals">É igual a</option><option value="not_equals">É diferente de</option><option value="contains">Contém</option><option value="is_empty">Está vazio</option></select></InlineField>
        {data.operator !== 'is_empty' && <InlineField label="Valor esperado"><input value={flowString(data.value)} onChange={(event) => update({ value: event.target.value })} placeholder="Ex.: GRANTED" /></InlineField>}
        <p className="chatbot-node-note">Conecte as saídas <strong>Sim</strong> e <strong>Não</strong> aos próximos blocos.</p>
      </>}
      {type === 'wait' && <InlineField label="Tempo de espera em segundos" hint="O fluxo continua automaticamente depois deste período."><input type="number" min={1} step={1} value={Number(data.seconds ?? (Number(data.minutes || 1) * 60))} onChange={(event) => update({ seconds: Math.max(1, Number(event.target.value)), minutes: undefined })} /></InlineField>}
      {type === 'update_record' && <>
        <InlineField label="Campo a atualizar"><select value={flowString(data.field)} onChange={(event) => update({ field: event.target.value })}><option value="">Selecione</option><option value="name">Nome</option><option value="email">E-mail</option><option value="jobTitle">Cargo</option><option value="source">Origem</option>{contactCustomFields.map((field) => <option key={field.id} value={field.key}>{field.label}</option>)}</select></InlineField>
        <InlineField label="Novo valor"><input value={flowString(data.value)} onChange={(event) => update({ value: event.target.value })} /></InlineField>
      </>}
      {type === 'move_stage' && <InlineField label="Etapa de destino"><select value={flowString(data.stageId)} onChange={(event) => update({ stageId: event.target.value })}><option value="">Selecione</option>{metadata?.pipelines.map((pipeline) => <optgroup key={pipeline.id} label={pipeline.name}>{pipeline.stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</optgroup>)}</select></InlineField>}
      {type === 'assign' && <>
        <InlineField label="Responsável"><select value={flowString(data.userId)} onChange={(event) => update({ userId: event.target.value })}><option value="">Não alterar</option>{metadata?.users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></InlineField>
        <InlineField label="Equipe"><select value={flowString(data.teamId)} onChange={(event) => update({ teamId: event.target.value })}><option value="">Não alterar</option>{metadata?.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></InlineField>
      </>}
      {type === 'assign_queue' && <><InlineField label="Fila de destino"><select value={flowString(data.teamId)} onChange={(event) => update({ teamId: event.target.value })}><option value="">Selecione</option>{metadata?.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></InlineField><p className="chatbot-node-note">Exige um ticket no contexto. Se a automação começou sem atendimento, use antes um bloco <strong>Enviar WhatsApp</strong> para criar e guardar a conversa.</p></>}
      {(type === 'add_tag' || type === 'remove_tag') && <InlineField label={type === 'add_tag' ? 'Tag a adicionar' : 'Tag a remover'}><select value={flowString(data.tagId)} onChange={(event) => update({ tagId: event.target.value })}><option value="">Selecione</option>{metadata?.tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}</select></InlineField>}
      {type === 'create_task' && <>
        <InlineField label="Título da tarefa"><input value={flowString(data.title)} onChange={(event) => update({ title: event.target.value })} /></InlineField>
        <InlineField label="Prazo em horas"><input type="number" min={1} step={1} value={Number(data.dueInHours || 24)} onChange={(event) => update({ dueInHours: Math.max(1, Number(event.target.value)) })} /></InlineField>
        <InlineField label="Responsável pela tarefa"><select value={flowString(data.assigneeId)} onChange={(event) => update({ assigneeId: event.target.value })}><option value="">Responsável do contato</option>{metadata?.users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></InlineField>
      </>}
      {type === 'notify' && <>
        <InlineField label="Notificar"><select value={flowString(data.userId)} onChange={(event) => update({ userId: event.target.value })}><option value="">Responsável do contato</option>{metadata?.users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></InlineField>
        <InlineField label="Título"><input value={flowString(data.title)} onChange={(event) => update({ title: event.target.value })} /></InlineField>
        <InlineField label="Mensagem interna"><AutoResizeTextarea rows={4} value={flowString(data.body)} onChange={(event) => update({ body: event.target.value })} /></InlineField>
      </>}
      {type === 'end' && <p className="chatbot-node-note">A execução deste contato será concluída neste ponto.</p>}
    </div>
    {!terminal && type !== 'condition' && <Handle type="source" position={Position.Right} />}
    {type === 'condition' && <><Handle id="true" type="source" position={Position.Right} style={{ top: '34%' }} title="Sim" /><Handle id="false" type="source" position={Position.Right} style={{ top: '72%' }} title="Não" /><i className="branch-label branch-yes">Sim</i><i className="branch-label branch-no">Não</i></>}
  </div>;
}

const nodeTypes = Object.fromEntries(nodeDefinitions.map((item) => [item.type, AutomationNode]));

export function AutomationsPage() {
  const client = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get('edit');
  const [modal, setModal] = useState(false);
  const [deleting, setDeleting] = useState<WorkflowRecord | null>(null);
  const [filter, setFilter] = useState<'all' | 'PUBLISHED' | 'DRAFT' | 'PAUSED'>('all');
  const query = useQuery({ queryKey: ['workflows'], queryFn: () => api<Envelope<WorkflowRecord[]>>('/workflows') });
  const metadata = useQuery({ queryKey: ['workflow-metadata'], queryFn: () => api<Envelope<AutomationMetadata>>('/workflows/metadata') });
  if (query.isLoading || metadata.isLoading) return <PageLoading />;
  if (selectedId) return <div className="chatbot-editor-shell"><WorkflowBuilder workflowId={selectedId} metadata={metadata.data!.data} onBack={() => { setSearchParams({}); void client.invalidateQueries({ queryKey: ['workflows'] }); }} /></div>;
  const allWorkflows = query.data?.data || [];
  const workflows = filter === 'all' ? allWorkflows : allWorkflows.filter((workflow) => workflow.status === filter);
  return <div className="automations-page chatbot-page">
    <div className="toolbar"><div className="segmented"><button type="button" className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>Todos</button><button type="button" className={filter === 'PUBLISHED' ? 'active' : ''} onClick={() => setFilter('PUBLISHED')}>Ativos</button><button type="button" className={filter === 'DRAFT' ? 'active' : ''} onClick={() => setFilter('DRAFT')}>Rascunhos</button><button type="button" className={filter === 'PAUSED' ? 'active' : ''} onClick={() => setFilter('PAUSED')}>Pausados</button></div><Button onClick={() => setModal(true)}><Plus size={15} />Nova automação</Button></div>
    {workflows.length ? <div className="workflow-grid chatbot-grid">{workflows.map((workflow) => <div className="workflow-card-shell" key={workflow.id}><button type="button" className="workflow-card-main" onClick={() => setSearchParams({ edit: workflow.id })}><div className="workflow-icon"><Workflow size={20} /></div><div className="workflow-card-header"><Status value={workflow.status} /><span>v{workflow.versions[0]?.version || 1}</span></div><h3>{workflow.name}</h3><p>{workflow.description || 'Automação de WhatsApp e CRM'}</p><footer><span>{workflow._count?.enrollments || 0} inscrições</span><span>Atualizada {dateTime(workflow.updatedAt)}</span></footer></button><button type="button" className="workflow-card-delete" title={`Excluir automação ${workflow.name}`} aria-label={`Excluir automação ${workflow.name}`} onClick={() => setDeleting(workflow)}><Trash2 size={16} /></button></div>)}</div> : <Empty icon={<Bot />} title={allWorkflows.length ? 'Nenhuma automação neste filtro' : 'Crie sua primeira automação'} description="Monte jornadas com gatilhos, condições, mensagens e ações no CRM." action={<Button onClick={() => setModal(true)}>Nova automação</Button>} />}
    {modal && <CreateWorkflowModal onClose={() => setModal(false)} onCreated={(workflow) => { setModal(false); setSearchParams({ edit: workflow.id }); }} />}
    {deleting && <DeleteWorkflowModal workflow={deleting} onClose={() => setDeleting(null)} onDeleted={() => { setDeleting(null); void client.invalidateQueries({ queryKey: ['workflows'] }); }} />}
  </div>;
}

function DeleteWorkflowModal({ workflow, onClose, onDeleted }: Readonly<{ workflow: WorkflowRecord; onClose(): void; onDeleted(): void }>) {
  const mutation = useMutation({ mutationFn: () => api(`/workflows/${workflow.id}`, { method: 'DELETE' }), onSuccess: () => { toast.success('Automação excluída.'); onDeleted(); } });
  return <Modal title="Excluir automação" onClose={() => !mutation.isPending && onClose()}><div className="delete-confirm"><div className="delete-confirm-icon"><Trash2 size={22} /></div><div><h3>Excluir “{workflow.name}”?</h3><p>A automação deixará de aparecer e suas execuções ativas serão interrompidas. O histórico já registrado será preservado para auditoria.</p></div></div><div className="modal-actions delete-actions"><Button variant="secondary" disabled={mutation.isPending} onClick={onClose}>Cancelar</Button><Button variant="danger" loading={mutation.isPending} onClick={() => mutation.mutate()}><Trash2 size={16} />Excluir automação</Button></div></Modal>;
}

function CreateWorkflowModal({ onClose, onCreated }: Readonly<{ onClose(): void; onCreated(workflow: WorkflowRecord): void }>) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const mutation = useMutation({ mutationFn: () => api<Envelope<WorkflowRecord>>('/workflows', { method: 'POST', body: JSON.stringify({ name, description }) }), onSuccess: (result) => { toast.success('Automação criada.'); onCreated(result.data); } });
  return <Modal title="Nova automação" onClose={onClose}><form className="modal-form" onSubmit={(event: FormEvent) => { event.preventDefault(); mutation.mutate(); }}><Field label="Nome da automação" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Cadência de novos leads" required /><Field label="Descrição" value={description} onChange={(event) => setDescription(event.target.value)} /><div className="modal-actions"><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" loading={mutation.isPending}>Criar e editar</Button></div></form></Modal>;
}

function WorkflowBuilder({ workflowId, metadata, onBack }: Readonly<{ workflowId: string; metadata: AutomationMetadata; onBack(): void }>) {
  const { theme } = useTheme();
  const query = useQuery({ queryKey: ['workflow', workflowId], queryFn: () => api<Envelope<WorkflowRecord>>(`/workflows/${workflowId}`) });
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<FlowData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const flowInstanceRef = useRef<ReactFlowInstance<Node<FlowData>, Edge> | null>(null);
  const initializedGraphIdRef = useRef<string | null>(null);
  const [initializedGraphId, setInitializedGraphId] = useState<string | null>(null);
  const [savedGraphSnapshot, setSavedGraphSnapshot] = useState<string | null>(null);
  const [confirmExitOpen, setConfirmExitOpen] = useState(false);
  const [draggingNodeType, setDraggingNodeType] = useState<string | null>(null);
  const highlightFrameRef = useRef<number | null>(null);
  const highlightTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (!query.data || initializedGraphIdRef.current === workflowId) return;
    const version = query.data.data.versions[0];
    const nextGraph: WorkflowGraph = { nodes: version?.graph.nodes || [], edges: version?.graph.edges || [] };
    setNodes(nextGraph.nodes);
    setEdges(nextGraph.edges);
    setSavedGraphSnapshot(graphSnapshot(nextGraph));
    initializedGraphIdRef.current = workflowId;
    setInitializedGraphId(workflowId);
  }, [query.data, setNodes, setEdges, workflowId]);
  const graph = useMemo(() => ({ nodes, edges }), [nodes, edges]);
  const currentGraphSnapshot = useMemo(() => graphSnapshot(graph), [graph]);
  const hasUnsavedChanges = initializedGraphId === workflowId && savedGraphSnapshot !== null && savedGraphSnapshot !== currentGraphSnapshot;
  const highlightInvalidNodes = useCallback((nodeIds: string[]) => {
    const ids = [...new Set(nodeIds)].filter((id) => nodes.some((node) => node.id === id));
    if (!ids.length) return;
    if (highlightFrameRef.current !== null) window.cancelAnimationFrame(highlightFrameRef.current);
    if (highlightTimerRef.current !== null) window.clearTimeout(highlightTimerRef.current);
    const targets = ids.map((id) => [...document.querySelectorAll<HTMLElement>('.react-flow__node')].find((element) => element.dataset.id === id)?.querySelector<HTMLElement>('.chatbot-node')).filter((element): element is HTMLElement => Boolean(element));
    if (!targets.length) return;
    void flowInstanceRef.current?.fitView({ nodes: ids.map((id) => ({ id })), duration: 450, padding: 0.25 });
    targets.forEach((target) => { target.classList.remove('chatbot-node-highlight'); target.getBoundingClientRect(); });
    highlightFrameRef.current = window.requestAnimationFrame(() => { targets.forEach((target) => target.classList.add('chatbot-node-highlight')); highlightFrameRef.current = null; });
    highlightTimerRef.current = window.setTimeout(() => { targets.forEach((target) => target.classList.remove('chatbot-node-highlight')); highlightTimerRef.current = null; }, 1_800);
  }, [nodes]);
  useEffect(() => () => {
    if (highlightFrameRef.current !== null) window.cancelAnimationFrame(highlightFrameRef.current);
    if (highlightTimerRef.current !== null) window.clearTimeout(highlightTimerRef.current);
  }, []);
  useEffect(() => {
    if (!hasUnsavedChanges) return undefined;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);
  const save = useMutation({ mutationFn: (graphToSave: WorkflowGraph) => api(`/workflows/${workflowId}/draft`, { method: 'PATCH', body: JSON.stringify({ graph: graphToSave }) }), onSuccess: (_result, graphToSave) => { setSavedGraphSnapshot(graphSnapshot(graphToSave)); toast.success('Automação salva.'); return query.refetch(); } });
  const publish = useMutation({ mutationFn: async (graphToPublish: WorkflowGraph) => { await api(`/workflows/${workflowId}/draft`, { method: 'PATCH', body: JSON.stringify({ graph: graphToPublish }) }); return api(`/workflows/${workflowId}/publish`, { method: 'POST' }); }, onSuccess: (_result, graphToPublish) => { setSavedGraphSnapshot(graphSnapshot(graphToPublish)); toast.success('Automação publicada.'); return query.refetch(); }, onError: (error, graphToPublish) => highlightInvalidNodes(validationNodeIds(error, graphToPublish)) });
  const changeStatus = useMutation({ mutationFn: (status: string) => api(`/workflows/${workflowId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }), onSuccess: (_result, status) => { toast.success(status === 'PAUSED' ? 'Automação pausada.' : 'Automação ativada.'); return query.refetch(); } });
  const onConnect = useCallback((connection: Connection) => setEdges((current) => addEdge({ ...connection, type: 'smoothstep', animated: true, style: { stroke: '#2da6dc' } }, current)), [setEdges]);
  const addNode = useCallback((type: string, position?: { x: number; y: number }) => {
    const definition = nodeDefinitions.find((item) => item.type === type);
    if (!definition || definition.type === 'trigger') return;
    const id = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setNodes((current) => [...current, {
      id,
      type,
      position: position || { x: 300 + current.length * 45, y: 90 + (current.length % 5) * 110 },
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
  }, [metadata.pipelines, metadata.teams, setNodes]);
  const startNodeDrag = (event: React.DragEvent<HTMLButtonElement>, type: string) => {
    event.dataTransfer.setData(AUTOMATION_NODE_DRAG_TYPE, type);
    event.dataTransfer.effectAllowed = 'move';
    setDraggingNodeType(type);
  };
  const handleCanvasDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (!Array.from(event.dataTransfer.types).includes(AUTOMATION_NODE_DRAG_TYPE)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDraggingNodeType((current) => current || 'node');
  };
  const handleCanvasDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const type = event.dataTransfer.getData(AUTOMATION_NODE_DRAG_TYPE);
    setDraggingNodeType(null);
    if (!type || !nodeDefinitions.some((item) => item.type === type && item.type !== 'trigger')) return;
    const position = flowInstanceRef.current?.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    addNode(type, position);
  };
  const stopNodeDrag = () => setDraggingNodeType(null);
  const updateNodeData = useCallback((nodeId: string, changes: Partial<FlowData>) => {
    setNodes((current) => current.map((node) => node.id === nodeId ? { ...node, data: { ...node.data, ...changes } } : node));
  }, [setNodes]);
  const deleteNode = useCallback((nodeId: string) => {
    if (nodes.find((node) => node.id === nodeId)?.type === 'trigger') return;
    setNodes((current) => current.filter((node) => node.id !== nodeId));
    setEdges((current) => current.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
    setSelectedNodeId(null);
  }, [nodes, setEdges, setNodes]);
  const organizeFlow = useCallback(() => {
    if (!nodes.length) return;
    setNodes(layoutAutomationNodes(nodes, edges));
    setEdges((current) => current.map((edge) => ({ ...edge, type: 'smoothstep' })));
    setSelectedNodeId(null);
    window.requestAnimationFrame(() => { void flowInstanceRef.current?.fitView({ duration: 500, padding: 0.25 }); });
    toast.success('Fluxo organizado.');
  }, [edges, nodes, setEdges, setNodes]);
  const nodeEditorContext = useMemo<AutomationNodeContextValue>(() => ({ metadata, onChange: updateNodeData, onDelete: deleteNode }), [deleteNode, metadata, updateNodeData]);
  if (query.isLoading) return <PageLoading />;
  const workflow = query.data!.data;
  const requestExit = () => { if (hasUnsavedChanges) setConfirmExitOpen(true); else onBack(); };
  return <><div className="workflow-builder chatbot-builder"><header className="builder-header"><div><button type="button" className="icon-button" onClick={requestExit}><ChevronLeft size={18} /></button><div><h2>{workflow.name}</h2><span><Status value={workflow.status} /> · Versão {workflow.versions[0]?.version}</span></div></div><div>{workflow.status === 'PUBLISHED' && <Button variant="secondary" onClick={() => changeStatus.mutate('PAUSED')} loading={changeStatus.isPending}><Pause size={15} />Pausar</Button>}{workflow.status === 'PAUSED' && workflow.publishedVersion && <Button variant="secondary" onClick={() => changeStatus.mutate('PUBLISHED')} loading={changeStatus.isPending}><Play size={15} />Ativar</Button>}<Button variant="secondary" onClick={organizeFlow} disabled={!nodes.length}><LayoutDashboard size={15} /><span>Organizar fluxo</span></Button><Button variant="secondary" onClick={() => save.mutate(graph)} loading={save.isPending}><Save size={15} />Salvar</Button><Button onClick={() => publish.mutate(graph)} loading={publish.isPending}><Send size={15} />Publicar</Button></div></header><div className="builder-body chatbot-builder-body"><aside className="node-palette"><span className="nav-section">Blocos</span>{nodeDefinitions.filter((item) => item.type !== 'trigger').map((item) => <button type="button" className={draggingNodeType === item.type ? 'dragging' : undefined} draggable onDragStart={(event) => startNodeDrag(event, item.type)} onDragEnd={stopNodeDrag} key={item.type} aria-label={`Arrastar bloco ${item.label}`}><span className={item.tone}><item.icon size={15} /></span><div><strong>{item.label}</strong><small>{item.subtitle}</small></div></button>)}</aside><div className={`flow-canvas${draggingNodeType ? ' node-drop-target' : ''}`} onDragOver={handleCanvasDragOver} onDrop={handleCanvasDrop}><AutomationNodeContext.Provider value={nodeEditorContext}><ReactFlow nodes={nodes} edges={edges} onInit={(instance) => { flowInstanceRef.current = instance; }} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onNodeClick={(_, node) => setSelectedNodeId(node.id)} onPaneClick={() => setSelectedNodeId(null)} nodeTypes={nodeTypes} fitView colorMode={theme}><Background gap={22} size={1} color={theme === 'dark' ? '#38414a' : '#dfe5ea'} /><Controls /><MiniMap pannable zoomable nodeColor="#2da6dc" maskColor={theme === 'dark' ? 'rgba(25,29,34,.72)' : 'rgba(245,247,249,.75)'} /></ReactFlow></AutomationNodeContext.Provider></div></div></div>{confirmExitOpen && <Modal title="Sair do editor?" onClose={() => setConfirmExitOpen(false)}><div className="unsaved-exit-confirm"><p>Existem alterações que ainda não foram salvas. Se você sair agora, elas serão perdidas.</p><div className="modal-actions"><Button variant="secondary" onClick={() => setConfirmExitOpen(false)}>Continuar editando</Button><Button variant="danger" onClick={onBack}>Sair sem salvar</Button></div></div></Modal>}</>;
}
