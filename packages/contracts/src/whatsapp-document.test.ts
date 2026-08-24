import { describe, expect, it } from 'vitest';
import {
  documentContentTypeForFilename,
  normalizeWhatsappDocumentMetadata,
} from './whatsapp-document.js';

describe('metadados de documentos do WhatsApp', () => {
  it.each([
    ['Proposta comercial.pdf', 'application/pdf', 'Proposta comercial.pdf'],
    ['RELATÓRIO.PDF', 'application/pdf', 'RELATÓRIO.PDF'],
    ['manual', 'application/pdf', 'manual.pdf'],
    ['proposta.docx', 'application/pdf', 'proposta.pdf'],
    ['C:\\documentos\\Planilha.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Planilha.xlsx'],
    ['apresentação.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'apresentação.pptx'],
    ['observações.txt', 'text/plain; charset=utf-8', 'observações.txt'],
  ])('normaliza %s de acordo com %s', (filename, contentType, expected) => {
    expect(normalizeWhatsappDocumentMetadata({ filename, contentType })).toEqual({
      fileName: expected,
      mimeType: contentType.split(';', 1)[0],
    });
  });

  it('não trata imagem como documento', () => {
    expect(normalizeWhatsappDocumentMetadata({ filename: 'foto.jpg', contentType: 'image/jpeg' })).toBeNull();
  });

  it('infere MIME somente para extensões de documento permitidas', () => {
    expect(documentContentTypeForFilename('arquivo.docx')).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(documentContentTypeForFilename('arquivo.zip')).toBeUndefined();
  });
});
