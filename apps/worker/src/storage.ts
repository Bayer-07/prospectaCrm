import { DeleteObjectsCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';

const region = process.env.S3_REGION || 'us-east-1';
const storageEndpoint = process.env.S3_ENDPOINT || 'http://localhost:9000';
// This hostname is embedded in the signed URL and must be both a valid URL
// for Evolution's DTO validator and reachable from its container.
const deliveryEndpoint = process.env.S3_DELIVERY_ENDPOINT || storageEndpoint;
const bucket = process.env.S3_BUCKET || 'prospecta-media';
let clients: { storage: S3Client; delivery: S3Client } | undefined;

function storageClients() {
  if (clients) return clients;
  const storageSecret = process.env.S3_SECRET_KEY?.trim();
  if (!storageSecret) throw new Error('S3_SECRET_KEY precisa ser configurada');
  const credentials = {
    accessKeyId: process.env.S3_ACCESS_KEY || 'prospecta',
    secretAccessKey: storageSecret,
  };
  const storage = new S3Client({
    region,
    endpoint: storageEndpoint,
    forcePathStyle: true,
    credentials,
  });
  const delivery = deliveryEndpoint === storageEndpoint ? storage : new S3Client({
    region,
    endpoint: deliveryEndpoint,
    forcePathStyle: true,
    credentials,
  });
  clients = { storage, delivery };
  return clients;
}

export function signedMediaUrl(key: string) {
  return getSignedUrl(storageClients().delivery, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: 15 * 60 });
}

export async function storedMediaBuffer(key: string, maximumBytes = 25 * 1024 * 1024) {
  const result = await storageClients().storage.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const declaredBytes = Number(result.ContentLength || 0);
  if (declaredBytes > maximumBytes) throw new Error('A mídia ultrapassa o limite de 25 MB');
  if (!result.Body) throw new Error('O arquivo da mídia está vazio');
  const bytes = Buffer.from(await result.Body.transformToByteArray());
  if (!bytes.length) throw new Error('O arquivo da mídia está vazio');
  if (bytes.length > maximumBytes) throw new Error('A mídia ultrapassa o limite de 25 MB');
  return bytes;
}

export async function storedMediaBase64(key: string, maximumBytes = 25 * 1024 * 1024) {
  return (await storedMediaBuffer(key, maximumBytes)).toString('base64');
}

export async function storeInboundMedia(input: { organizationId: string; filename: string; contentType: string; body: Buffer }) {
  const safeName = input.filename.normalize('NFKD').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120) || 'midia';
  const key = `${input.organizationId}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}-${safeName}`;
  await storageClients().storage.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: input.body,
    ContentType: input.contentType,
    ContentLength: input.body.length,
    Metadata: { organization: input.organizationId, source: 'evolution' },
  }));
  return key;
}

export async function deleteStoredMedia(keys: string[]) {
  const uniqueKeys = [...new Set(keys.filter(Boolean))];
  for (let index = 0; index < uniqueKeys.length; index += 1_000) {
    const batch = uniqueKeys.slice(index, index + 1_000);
    const result = await storageClients().storage.send(new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: { Quiet: true, Objects: batch.map((Key) => ({ Key })) },
    }));
    if (result.Errors?.length) throw new Error(`Falha ao excluir ${result.Errors.length} objeto(s) de mÃ­dia`);
  }
}
