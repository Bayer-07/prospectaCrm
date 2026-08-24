import {
  documentContentTypeForFilename,
  isWhatsappDocumentContentType,
  normalizeMediaContentType,
  normalizeWhatsappDocumentMetadata,
  WHATSAPP_DOCUMENT_CONTENT_TYPES,
} from '@prospecta/contracts/whatsapp-document';

const SUPPORTED_MEDIA_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'audio/ogg',
  'audio/mpeg',
  'audio/mp4',
  'audio/webm',
  'video/mp4',
]);

export const INBOX_ATTACHMENT_ACCEPT = [
  '.jpg', '.jpeg', '.png', '.webp',
  '.ogg', '.mp3', '.m4a', '.webm', '.mp4',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt',
  ...SUPPORTED_MEDIA_TYPES,
  ...WHATSAPP_DOCUMENT_CONTENT_TYPES,
].join(',');

export type PreparedInboxAttachment =
  | { file: File }
  | { error: string };

export function prepareInboxAttachment(candidate: File): PreparedInboxAttachment {
  const declaredType = normalizeMediaContentType(candidate.type);
  const inferredDocumentType = documentContentTypeForFilename(candidate.name);

  if (!declaredType || declaredType === 'application/octet-stream') {
    if (!inferredDocumentType) return unsupportedAttachment();
    return normalizedDocument(candidate, inferredDocumentType);
  }

  if (isWhatsappDocumentContentType(declaredType)) {
    if (inferredDocumentType && inferredDocumentType !== declaredType) {
      return { error: 'A extensão do arquivo não corresponde ao tipo informado pelo navegador.' };
    }
    return normalizedDocument(candidate, declaredType);
  }

  if (!SUPPORTED_MEDIA_TYPES.has(declaredType)) return unsupportedAttachment();
  if (candidate.type === declaredType) return { file: candidate };
  return { file: new File([candidate], candidate.name, { type: declaredType, lastModified: candidate.lastModified }) };
}

function normalizedDocument(candidate: File, contentType: string): PreparedInboxAttachment {
  const metadata = normalizeWhatsappDocumentMetadata({ filename: candidate.name, contentType });
  if (!metadata) return unsupportedAttachment();
  if (candidate.name === metadata.fileName && candidate.type === metadata.mimeType) return { file: candidate };
  return {
    file: new File([candidate], metadata.fileName, {
      type: metadata.mimeType,
      lastModified: candidate.lastModified,
    }),
  };
}

function unsupportedAttachment(): PreparedInboxAttachment {
  return {
    error: 'Formato não permitido. Use PDF, Word, Excel, PowerPoint, TXT, JPG, PNG, WebP, MP3, OGG, M4A, WebM ou MP4.',
  };
}
