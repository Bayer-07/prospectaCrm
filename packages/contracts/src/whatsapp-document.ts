const DOCUMENT_EXTENSIONS = {
  'application/pdf': ['pdf'],
  'application/msword': ['doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
  'application/vnd.ms-excel': ['xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['xlsx'],
  'application/vnd.ms-powerpoint': ['ppt'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['pptx'],
  'text/plain': ['txt'],
} as const;

export type WhatsappDocumentContentType = keyof typeof DOCUMENT_EXTENSIONS;

export type WhatsappDocumentMetadata = {
  fileName: string;
  mimeType: WhatsappDocumentContentType;
};

export const WHATSAPP_DOCUMENT_CONTENT_TYPES = Object.freeze(
  Object.keys(DOCUMENT_EXTENSIONS) as WhatsappDocumentContentType[],
);

const CONTENT_TYPE_BY_EXTENSION = new Map<string, WhatsappDocumentContentType>(
  Object.entries(DOCUMENT_EXTENSIONS).flatMap(([contentType, extensions]) =>
    extensions.map((extension) => [extension, contentType as WhatsappDocumentContentType] as const)),
);

export function normalizeMediaContentType(value: string) {
  return value.toLowerCase().split(';', 1)[0].trim();
}

export function isWhatsappDocumentContentType(value: string): value is WhatsappDocumentContentType {
  return Object.hasOwn(DOCUMENT_EXTENSIONS, value);
}

export function documentContentTypeForFilename(filename: string) {
  const extension = filenameExtension(filename);
  return extension ? CONTENT_TYPE_BY_EXTENSION.get(extension) : undefined;
}

export function normalizeWhatsappDocumentMetadata(input: { filename: string; contentType: string }): WhatsappDocumentMetadata | null {
  const mimeType = normalizeMediaContentType(input.contentType);
  if (!isWhatsappDocumentContentType(mimeType)) return null;

  const expectedExtension = DOCUMENT_EXTENSIONS[mimeType][0];
  const basename = documentBasename(input.filename);
  const currentExtension = filenameExtension(basename);
  if (currentExtension && DOCUMENT_EXTENSIONS[mimeType].some((extension) => extension === currentExtension)) {
    return { fileName: basename, mimeType };
  }

  const lastDot = basename.lastIndexOf('.');
  const stem = lastDot > 0 ? basename.slice(0, lastDot) : basename;
  const normalizedStem = stem.replace(/\.+$/g, '').trim() || 'arquivo';
  return { fileName: `${normalizedStem}.${expectedExtension}`, mimeType };
}

function documentBasename(value: string) {
  const finalSegment = value.split(/[\\/]/).at(-1) || '';
  return finalSegment.normalize('NFC').replace(/[\u0000-\u001f\u007f]/g, '_').trim() || 'arquivo';
}

function filenameExtension(value: string) {
  const basename = documentBasename(value);
  const lastDot = basename.lastIndexOf('.');
  if (lastDot <= 0 || lastDot === basename.length - 1) return '';
  return basename.slice(lastDot + 1).trim().toLowerCase();
}
