import { createCipheriv, createHash, randomBytes } from 'node:crypto';

const encryptionKey = () => createHash('sha256').update(process.env.ENCRYPTION_KEY || process.env.SESSION_SECRET || 'prospecta-development-key').digest();

export function encryptSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`;
}
