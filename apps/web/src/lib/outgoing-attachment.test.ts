import { describe, expect, it } from 'vitest';
import { INBOX_ATTACHMENT_ACCEPT, prepareInboxAttachment } from './outgoing-attachment';

function attachment(name: string, type: string) {
  return new File(['conteúdo'], name, { type, lastModified: 123 });
}

describe('anexos enviados pela Inbox', () => {
  it.each([
    ['proposta.pdf', 'application/pdf'],
    ['contrato.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['planilha.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ['apresentação.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
    ['observações.txt', 'text/plain'],
  ])('aceita %s com MIME compatível', (name, type) => {
    expect(prepareInboxAttachment(attachment(name, type))).toMatchObject({ file: { name, type } });
  });

  it('infere o MIME de um PDF quando o navegador não o informa', () => {
    expect(prepareInboxAttachment(attachment('proposta.pdf', ''))).toMatchObject({
      file: { name: 'proposta.pdf', type: 'application/pdf' },
    });
  });

  it('adiciona a extensão quando o MIME identifica um documento sem extensão', () => {
    expect(prepareInboxAttachment(attachment('proposta comercial', 'application/pdf'))).toMatchObject({
      file: { name: 'proposta comercial.pdf', type: 'application/pdf' },
    });
  });

  it('rejeita extensão incompatível com o MIME declarado', () => {
    expect(prepareInboxAttachment(attachment('proposta.docx', 'application/pdf'))).toMatchObject({
      error: expect.stringContaining('não corresponde'),
    });
  });

  it.each([
    ['contatos.csv', 'text/csv'],
    ['arquivos.zip', 'application/zip'],
    ['arquivos.rar', 'application/vnd.rar'],
    ['animacao.gif', 'image/gif'],
  ])('rejeita o formato não suportado %s', (name, type) => {
    expect(prepareInboxAttachment(attachment(name, type))).toHaveProperty('error');
  });

  it.each([
    ['foto.jpg', 'image/jpeg'],
    ['audio.ogg', 'audio/ogg'],
    ['video.mp4', 'video/mp4'],
  ])('mantém mídia especializada %s', (name, type) => {
    expect(prepareInboxAttachment(attachment(name, type))).toMatchObject({ file: { name, type } });
  });

  it('não anuncia CSV, ZIP ou RAR no seletor', () => {
    expect(INBOX_ATTACHMENT_ACCEPT).not.toMatch(/csv|zip|rar/i);
  });
});
