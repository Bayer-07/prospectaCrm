import { BadRequestException, Injectable, NotFoundException, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { CreateBucketCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import type { AuthContext } from '../auth/types.js';
import { PrismaService } from '../prisma/prisma.service.js';

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/webm',
  'video/mp4', 'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

@Injectable()
export class MediaService implements OnModuleInit {
  private readonly bucket = process.env.S3_BUCKET || 'prospecta-media';
  private readonly client = new S3Client({
    region: process.env.S3_REGION || 'us-east-1',
    endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY || 'prospecta',
      secretAccessKey: process.env.S3_SECRET_KEY || 'prospecta-secret',
    },
  });

  constructor(private readonly db: PrismaService) {}

  async onModuleInit() {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      try { await this.client.send(new CreateBucketCommand({ Bucket: this.bucket })); }
      catch (error) {
        if (process.env.NODE_ENV === 'production') throw new ServiceUnavailableException('Não foi possível preparar o armazenamento de mídias', { cause: error });
      }
    }
  }

  async createUpload(auth: AuthContext, input: { filename?: string; contentType?: string; sizeBytes?: number }) {
    const filename = String(input.filename || '').trim();
    const contentType = String(input.contentType || '').toLowerCase().split(';', 1)[0].trim();
    const sizeBytes = Number(input.sizeBytes || 0);
    if (!filename || !ALLOWED_TYPES.has(contentType)) throw new BadRequestException('Tipo de arquivo não permitido');
    if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > MAX_FILE_BYTES) throw new BadRequestException('O arquivo deve ter no máximo 25 MB');
    const safeName = filename.normalize('NFKD').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120);
    const key = `${auth.organizationId}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}-${safeName}`;
    const asset = await this.db.mediaAsset.create({ data: { key, filename, contentType, sizeBytes } });
    const expiresIn = 10 * 60;
    const uploadUrl = await getSignedUrl(this.client, new PutObjectCommand({
      Bucket: this.bucket, Key: key, ContentType: contentType, ContentLength: sizeBytes,
      Metadata: { organization: auth.organizationId, asset: asset.id },
    }), { expiresIn });
    return { id: asset.id, key, uploadUrl, expiresAt: new Date(Date.now() + expiresIn * 1000) };
  }

  async downloadUrl(auth: AuthContext, id: string, attachment = false) {
    const asset = await this.db.mediaAsset.findUnique({ where: { id } });
    if (!asset || !asset.key.startsWith(`${auth.organizationId}/`)) throw new NotFoundException('Mídia não encontrada');
    const expiresIn = 15 * 60;
    const url = await getSignedUrl(this.client, new GetObjectCommand({
      Bucket: this.bucket, Key: asset.key, ResponseContentDisposition: `${attachment ? 'attachment' : 'inline'}; filename="${asset.filename.replace(/"/g, '')}"`,
    }), { expiresIn });
    return { url, expiresAt: new Date(Date.now() + expiresIn * 1000), filename: asset.filename, contentType: asset.contentType };
  }
}
