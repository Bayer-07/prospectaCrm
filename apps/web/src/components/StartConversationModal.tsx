import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { MessageCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api, formatPhone, type Envelope } from '../lib/api';
import { toast } from '../lib/toast';
import { Button, Modal, PageLoading, SelectField } from './ui';
import { ContactAvatar } from './ContactAvatar';
import { ConnectionPicker } from './ConnectionPicker';

type ConversationContact = {
  id: string;
  name: string;
  phone?: string;
};

type WhatsappInstance = {
  id: string;
  name: string;
  phone?: string;
  status: string;
};

type TeamOption = {
  id: string;
  name: string;
  color?: string;
  isDefault?: boolean;
};

export function StartConversationModal({ contact, onClose }: Readonly<{
  contact: ConversationContact;
  onClose(): void;
}>) {
  const navigate = useNavigate();
  const instances = useQuery({
    queryKey: ['conversation-instances'],
    queryFn: () => api<Envelope<WhatsappInstance[]>>('/conversations/instances'),
  });
  const teams = useQuery({
    queryKey: ['conversation-teams'],
    queryFn: () => api<Envelope<TeamOption[]>>('/conversations/teams'),
    staleTime: 60_000,
  });
  const [instanceId, setInstanceId] = useState('');
  const [teamId, setTeamId] = useState('');

  useEffect(() => {
    if (!instanceId && instances.data?.data[0]) setInstanceId(instances.data.data[0].id);
  }, [instanceId, instances.data]);

  useEffect(() => {
    if (!teamId && teams.data?.data[0]) setTeamId(teams.data.data[0].id);
  }, [teamId, teams.data]);

  const start = useMutation({
    mutationFn: () => api<Envelope<{ id: string }>>('/conversations/start', {
      method: 'POST',
      body: JSON.stringify({ contactId: contact.id, instanceId, teamId }),
    }),
    onSuccess: (result) => {
      toast.success('Conversa iniciada.');
      navigate(`/inbox/${result.data.id}`);
    },
  });

  let content: React.ReactNode;
  if (instances.isLoading || teams.isLoading) {
    content = <PageLoading />;
  } else if (instances.error || teams.error) {
    content = <div className="conversation-start-empty">
      <strong>Não foi possível carregar as opções</strong>
      <p>Tente fechar esta janela e iniciar a conversa novamente.</p>
      <div className="modal-actions"><Button variant="secondary" onClick={onClose}>Fechar</Button></div>
    </div>;
  } else if (instances.data?.data.length && teams.data?.data.length) {
    content = <form className="modal-form" onSubmit={(event) => { event.preventDefault(); start.mutate(); }}>
      <SelectField label="Equipe" value={teamId} onChange={(event) => setTeamId(event.target.value)}>
        {teams.data.data.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
      </SelectField>
      <label className="field"><span>Enviar pelo número</span><ConnectionPicker options={instances.data.data} value={instanceId} onChange={setInstanceId} ariaLabel="Enviar pelo número" /></label>
      <p className="form-hint">A conversa será aberta no Inbox. A mensagem só será enviada quando você escrever e confirmar o envio.</p>
      <div className="modal-actions">
        <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button type="submit" loading={start.isPending} disabled={!instanceId || !teamId}><MessageCircle size={16} />Abrir conversa</Button>
      </div>
    </form>;
  } else if (!teams.data?.data.length) {
    content = <div className="conversation-start-empty">
      <strong>Nenhuma equipe disponível</strong>
      <p>Você precisa ter acesso a uma equipe antes de iniciar a conversa.</p>
      <div className="modal-actions"><Button variant="secondary" onClick={onClose}>Fechar</Button></div>
    </div>;
  } else {
    content = <div className="conversation-start-empty">
      <strong>Nenhuma conexão disponível</strong>
      <p>Conecte um número do WhatsApp antes de iniciar a conversa.</p>
      <div className="modal-actions"><Button variant="secondary" onClick={onClose}>Fechar</Button></div>
    </div>;
  }

  return <Modal title="Iniciar conversa" onClose={onClose}>
    <div className="conversation-start-intro">
      <ContactAvatar contact={contact} />
      <div><strong>{contact.name}</strong><p>{formatPhone(contact.phone)}</p></div>
    </div>
    {content}
  </Modal>;
}
