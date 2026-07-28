import { useEffect, useState } from 'react';
import { apiUrl, initials } from '../lib/api';

export type AvatarUser = {
  id?: string;
  userId?: string;
  name?: string;
  profilePhotoId?: string | null;
  profilePhotoUpdatedAt?: string;
  profilePhoto?: { createdAt?: string } | null;
} | null | undefined;

export function userProfilePhotoUrl(user: AvatarUser) {
  const userId = user?.userId || user?.id;
  if (!userId || !user?.profilePhotoId) return '';
  const version = user.profilePhotoUpdatedAt || user.profilePhoto?.createdAt || user.profilePhotoId;
  return apiUrl(`/users/${userId}/profile-photo?v=${encodeURIComponent(version)}`);
}

export function UserAvatar({ user, className = '' }: { user: AvatarUser; className?: string }) {
  const photoUrl = userProfilePhotoUrl(user);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [photoUrl]);
  return <span className={`user-avatar ${photoUrl && !failed ? 'user-avatar-photo' : ''} ${className}`.trim()}>
    {photoUrl && !failed
      ? <img src={photoUrl} alt={`Foto de ${user?.name || 'usuário'}`} onError={() => setFailed(true)} />
      : initials(user?.name)}
  </span>;
}
