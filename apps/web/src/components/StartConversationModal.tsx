import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { MessageCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api, formatPhone, type Envelope } from '../lib/api';
import { toast } from '../lib/toast';
import { Button, Modal, PageLoading } from './ui';
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

export function StartConversationModal({ contact, onClose }: Readonly<{
  contact: ConversationContact;
  onClose(): void;
}>) {
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

  let content: React.ReactNode;
  if (instances.isLoading) {
    content = <PageLoading />;
  } else if (instances.error) {
    content = null;
  } else if (instances.data?.data.length) {
    content = <form className="modal-form" onSubmit={(event) => { event.preventDefault(); start.mutate(); }}>
      <label className="field"><span>Enviar pelo número</span><ConnectionPicker options={instances.data.data} value={instanceId} onChange={setInstanceId} ariaLabel="Enviar pelo número" /></label>
      <p className="form-hint">A conversa será aberta no Inbox. A mensagem só será enviada quando você escrever e confirmar o envio.</p>
      <div className="modal-actions">
        <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button type="submit" loading={start.isPending} disabled={!instanceId}><MessageCircle size={16} />Abrir conversa</Button>
      </div>
    </form>;
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
