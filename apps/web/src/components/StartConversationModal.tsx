import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { MessageCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api, formatPhone, initials, type Envelope } from '../lib/api';
import { toast } from '../lib/toast';
import { Button, Modal, PageLoading, SelectField } from './ui';

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

export function StartConversationModal({ contact, onClose }: {
  contact: ConversationContact;
  onClose(): void;
}) {
  const navigate = useNavigate();
  const instances = useQuery({
    queryKey: ['conversation-instances'],
    queryFn: () => api<Envelope<WhatsappInstance[]>>('/conversations/instances'),
  });
  const [instanceId, setInstanceId] = useState('');

  useEffect(() => {
    if (!instanceId && instances.data?.data[0]) setInstanceId(instances.data.data[0].id);
  }, [instanceId, instances.data]);

  const start = useMutation({
    mutationFn: () => api<Envelope<{ id: string }>>('/conversations/start', {
      method: 'POST',
      body: JSON.stringify({ contactId: contact.id, instanceId }),
    }),
    onSuccess: (result) => {
      toast.success('Conversa iniciada.');
      navigate(`/inbox/${result.data.id}`);
    },
  });

  return <Modal title="Iniciar conversa" onClose={onClose}>
    <div className="conversation-start-intro">
      <span className="contact-avatar">{initials(contact.name)}</span>
      <div><strong>{contact.name}</strong><p>{formatPhone(contact.phone)}</p></div>
    </div>
    {instances.isLoading
      ? <PageLoading />
      : instances.error
        ? null
        : instances.data?.data.length
          ? <form className="modal-form" onSubmit={(event) => { event.preventDefault(); start.mutate(); }}>
            <SelectField label="Enviar pelo número" value={instanceId} onChange={(event) => setInstanceId(event.target.value)}>
              {instances.data.data.map((instance) => <option key={instance.id} value={instance.id}>{instance.name}{instance.phone ? ` · ${formatPhone(instance.phone)}` : ''}</option>)}
            </SelectField>
            <p className="form-hint">A conversa será aberta no Inbox. A mensagem só será enviada quando você escrever e confirmar o envio.</p>
            <div className="modal-actions">
              <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
              <Button type="submit" loading={start.isPending} disabled={!instanceId}><MessageCircle size={16} />Abrir conversa</Button>
            </div>
          </form>
          : <div className="conversation-start-empty">
            <strong>Nenhuma conexão disponível</strong>
            <p>Conecte um número do WhatsApp antes de iniciar a conversa.</p>
            <div className="modal-actions"><Button variant="secondary" onClick={onClose}>Fechar</Button></div>
          </div>}
  </Modal>;
}
