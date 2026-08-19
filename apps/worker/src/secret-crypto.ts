import { createDecipheriv, createHash } from 'node:crypto';

function requiredDecryptionKey() {
  const secret = process.env.ENCRYPTION_KEY || process.env.SESSION_SECRET;
  if (!secret) throw new Error('ENCRYPTION_KEY ou SESSION_SECRET precisa ser configurada');
  return createHash('sha256').update(secret).digest();
}

export function decryptSecret(value: string) {
  if (!value.startsWith('v1.')) return Buffer.from(value, 'base64').toString();
  const [, iv, tag, encrypted] = value.split('.');
  const decipher = createDecipheriv('aes-256-gcm', requiredDecryptionKey(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8');
}
