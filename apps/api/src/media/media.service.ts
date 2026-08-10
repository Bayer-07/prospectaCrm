import { BadRequestException, Injectable, NotFoundException, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import type { AuthContext } from '../auth/types.js';
import { PrismaService } from '../prisma/prisma.service.js';

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_PROFILE_PHOTO_BYTES = 5 * 1024 * 1024;
const PROFILE_PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const COMPANY_LOGO_TYPES = new Set([...PROFILE_PHOTO_TYPES, 'image/x-icon']);
const DOCUMENT_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
]);
const QUICK_REPLY_MEDIA_TYPES = new Set([
  ...PROFILE_PHOTO_TYPES,
  ...DOCUMENT_TYPES,
]);
const OPPORTUNITY_PROPOSAL_TYPES = new Set([...PROFILE_PHOTO_TYPES, ...DOCUMENT_TYPES]);
const ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/x-icon', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/webm',
  'video/mp4', ...DOCUMENT_TYPES,
]);

@Injectable()
export class MediaService implements OnModuleInit {
  private readonly bucket = process.env.S3_BUCKET || 'prospecta-media';
  private readonly storageEndpoint = process.env.S3_ENDPOINT || 'http://localhost:9000';
  private readonly publicEndpoint = process.env.S3_PUBLIC_ENDPOINT || this.storageEndpoint;
  private readonly clientOptions = {
    region: process.env.S3_REGION || 'us-east-1',
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY || 'prospecta',
      secretAccessKey: process.env.S3_SECRET_KEY || 'prospecta-secret',
    },
  };
  private readonly client = new S3Client({ ...this.clientOptions, endpoint: this.storageEndpoint });
  private readonly publicClient = this.publicEndpoint === this.storageEndpoint
    ? this.client
    : new S3Client({ ...this.clientOptions, endpoint: this.publicEndpoint });

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
    const uploadUrl = await getSignedUrl(this.publicClient, new PutObjectCommand({
      Bucket: this.bucket, Key: key, ContentType: contentType, ContentLength: sizeBytes,
      Metadata: { organization: auth.organizationId, asset: asset.id },
    }), { expiresIn });
    return { id: asset.id, key, uploadUrl, expiresAt: new Date(Date.now() + expiresIn * 1000) };
  }

  async downloadUrl(auth: AuthContext, id: string, attachment = false) {
    const asset = await this.db.mediaAsset.findUnique({ where: { id } });
    if (!asset || !asset.key.startsWith(`${auth.organizationId}/`)) throw new NotFoundException('Mídia não encontrada');
    const expiresIn = 15 * 60;
    const url = await getSignedUrl(this.publicClient, new GetObjectCommand({
      Bucket: this.bucket, Key: asset.key, ResponseContentDisposition: `${attachment ? 'attachment' : 'inline'}; filename="${asset.filename.replace(/"/g, '')}"`,
    }), { expiresIn });
    return { url, expiresAt: new Date(Date.now() + expiresIn * 1000), filename: asset.filename, contentType: asset.contentType };
  }

  async confirmProfilePhotoAsset(auth: AuthContext, id: string) {
    const asset = await this.db.mediaAsset.findUnique({
      where: { id },
      include: {
        profilePhotoFor: { select: { id: true } },
        companyLogoFor: { select: { id: true } },
        quickReplyFor: { select: { id: true } },
        opportunityProposalFor: { select: { id: true } },
      },
    });
    if (
      !asset
      || !asset.key.startsWith(`${auth.organizationId}/`)
      || asset.messageId
      || (asset.profilePhotoFor && asset.profilePhotoFor.id !== auth.userId)
      || asset.companyLogoFor
      || asset.quickReplyFor
      || asset.opportunityProposalFor
      || !PROFILE_PHOTO_TYPES.has(asset.contentType)
      || asset.sizeBytes < 1
      || asset.sizeBytes > MAX_PROFILE_PHOTO_BYTES
    ) {
      throw new BadRequestException('Selecione uma foto JPG, PNG ou WebP de até 5 MB');
    }
    try {
      const stored = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: asset.key }));
      if (
        !stored.ContentLength
        || stored.ContentLength !== asset.sizeBytes
        || (stored.ContentType && stored.ContentType.split(';', 1)[0].toLowerCase() !== asset.contentType)
      ) {
        throw new BadRequestException('O arquivo enviado não corresponde à foto selecionada');
      }
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('Conclua o envio da foto antes de salvá-la');
    }
    return asset;
  }

  async confirmCompanyLogoAsset(auth: AuthContext, id: string, companyId: string) {
    const asset = await this.db.mediaAsset.findUnique({
      where: { id },
      include: {
        profilePhotoFor: { select: { id: true } },
        companyLogoFor: { select: { id: true } },
        quickReplyFor: { select: { id: true } },
        opportunityProposalFor: { select: { id: true } },
      },
    });
    if (
      !asset
      || !asset.key.startsWith(`${auth.organizationId}/`)
      || asset.messageId
      || asset.profilePhotoFor
      || (asset.companyLogoFor && asset.companyLogoFor.id !== companyId)
      || asset.quickReplyFor
      || asset.opportunityProposalFor
      || !COMPANY_LOGO_TYPES.has(asset.contentType)
      || asset.sizeBytes < 1
      || asset.sizeBytes > MAX_PROFILE_PHOTO_BYTES
    ) {
      throw new BadRequestException('Selecione uma logo JPG, PNG ou WebP de até 5 MB');
    }
    try {
      const stored = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: asset.key }));
      if (
        !stored.ContentLength
        || stored.ContentLength !== asset.sizeBytes
        || (stored.ContentType && stored.ContentType.split(';', 1)[0].toLowerCase() !== asset.contentType)
      ) {
        throw new BadRequestException('O arquivo enviado não corresponde à logo selecionada');
      }
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('Conclua o envio da logo antes de salvá-la');
    }
    return asset;
  }

  async confirmQuickReplyAsset(auth: AuthContext, id: string, quickReplyId?: string) {
    const asset = await this.db.mediaAsset.findUnique({
      where: { id },
      include: {
        profilePhotoFor: { select: { id: true } },
        companyLogoFor: { select: { id: true } },
        quickReplyFor: { select: { id: true } },
        opportunityProposalFor: { select: { id: true } },
      },
    });
    if (
      !asset
      || !asset.key.startsWith(`${auth.organizationId}/`)
      || asset.messageId
      || asset.profilePhotoFor
      || asset.companyLogoFor
      || (asset.quickReplyFor && asset.quickReplyFor.id !== quickReplyId)
      || asset.opportunityProposalFor
      || !QUICK_REPLY_MEDIA_TYPES.has(asset.contentType)
      || asset.sizeBytes < 1
      || asset.sizeBytes > MAX_FILE_BYTES
    ) {
      throw new BadRequestException('Selecione uma imagem, PDF ou documento Word válido');
    }
    try {
      const stored = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: asset.key }));
      if (
        !stored.ContentLength
        || stored.ContentLength !== asset.sizeBytes
        || (stored.ContentType && stored.ContentType.split(';', 1)[0].toLowerCase() !== asset.contentType)
      ) {
        throw new BadRequestException('O arquivo enviado não corresponde ao anexo selecionado');
      }
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('Conclua o envio do anexo antes de salvar a resposta rápida');
    }
    return asset;
  }

  async confirmOpportunityProposalAsset(auth: AuthContext, id: string, opportunityId: string) {
    const asset = await this.db.mediaAsset.findUnique({
      where: { id },
      include: {
        profilePhotoFor: { select: { id: true } },
        companyLogoFor: { select: { id: true } },
        quickReplyFor: { select: { id: true } },
        opportunityProposalFor: { select: { id: true } },
      },
    });
    if (
      !asset
      || !asset.key.startsWith(`${auth.organizationId}/`)
      || asset.messageId
      || asset.profilePhotoFor
      || asset.companyLogoFor
      || asset.quickReplyFor
      || (asset.opportunityProposalFor && asset.opportunityProposalFor.id !== opportunityId)
      || !OPPORTUNITY_PROPOSAL_TYPES.has(asset.contentType)
      || asset.sizeBytes < 1
      || asset.sizeBytes > MAX_FILE_BYTES
    ) {
      throw new BadRequestException('Selecione uma imagem ou documento válido de até 25 MB');
    }
    try {
      const stored = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: asset.key }));
      if (
        !stored.ContentLength
        || stored.ContentLength !== asset.sizeBytes
        || (stored.ContentType && stored.ContentType.split(';', 1)[0].toLowerCase() !== asset.contentType)
      ) {
        throw new BadRequestException('O arquivo enviado não corresponde à proposta selecionada');
      }
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('Conclua o envio do arquivo antes de salvar a proposta');
    }
    return asset;
  }

  async deleteAsset(auth: AuthContext, id: string) {
    const asset = await this.db.mediaAsset.findUnique({
      where: { id },
      include: {
        profilePhotoFor: { select: { id: true } },
        companyLogoFor: { select: { id: true } },
        quickReplyFor: { select: { id: true } },
        opportunityProposalFor: { select: { id: true } },
      },
    });
    if (!asset || !asset.key.startsWith(`${auth.organizationId}/`)) return;
    if (asset.profilePhotoFor) throw new BadRequestException('A foto ainda está vinculada a um usuário');
    if (asset.companyLogoFor) throw new BadRequestException('A logo ainda está vinculada a uma empresa');
    if (asset.quickReplyFor) throw new BadRequestException('O arquivo ainda está vinculado a uma resposta rápida');
    if (asset.opportunityProposalFor) throw new BadRequestException('O arquivo ainda está vinculado a uma oportunidade');
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: asset.key }));
    await this.db.mediaAsset.delete({ where: { id: asset.id } });
  }
}
