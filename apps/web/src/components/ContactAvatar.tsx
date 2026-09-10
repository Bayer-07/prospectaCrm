import { useEffect, useState } from 'react';
import { UserRound } from 'lucide-react';
import { apiUrl } from '../lib/api';

type ContactAvatarProps = {
  contact?: { id: string; name: string } | null;
  id?: string;
  name?: string;
  large?: boolean;
  photoUrl?: string | null;
  className?: string;
};

export function ContactAvatar({ contact, id = contact?.id, name = contact?.name || 'Contato', large = false, photoUrl, className = '' }: Readonly<ContactAvatarProps>) {
  const resolvedPhotoUrl = photoUrl !== undefined
    ? photoUrl
    : id
      ? apiUrl(`/whatsapp/contacts/${id}/profile-picture?v=1`)
      : '';
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [resolvedPhotoUrl]);
  return <span className={`contact-avatar${large ? ' large' : ''}${resolvedPhotoUrl && !failed ? ' has-image' : ''} ${className}`.trim()} aria-label={`Contato ${name}`}>
    {resolvedPhotoUrl && !failed
      ? <img src={resolvedPhotoUrl} alt={`Foto de ${name}`} loading="lazy" decoding="async" onError={() => setFailed(true)} />
      : <UserRound className="contact-avatar-default-icon" size={large ? 25 : 19} strokeWidth={1.8} aria-hidden="true" />}
  </span>;
}
