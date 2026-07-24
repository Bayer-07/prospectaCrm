import { describe, expect, it } from 'vitest';
import { renderBzsEmailLayout, sgaProspectingEmailTemplates } from './email-templates.js';

describe('modelos de prospecção do SGA', () => {
  it('oferece uma cadência com cinco modelos únicos e versões alternativas', () => {
    expect(sgaProspectingEmailTemplates).toHaveLength(5);
    expect(new Set(sgaProspectingEmailTemplates.map((template) => template.name)).size).toBe(5);

    for (const template of sgaProspectingEmailTemplates) {
      expect(template.subject).toBeTruthy();
      expect(template.html).toContain('<!doctype html>');
      expect(template.html).toContain('width="640"');
      expect(template.html).toContain('%unsubscribe_url%');
      expect(template.text).toContain('%unsubscribe_url%');
      expect(template.html).toContain('{{nome}}');
    }
  });

  it('gera um layout responsivo e permite e-mails internos sem descadastro', () => {
    const html = renderBzsEmailLayout({
      preheader: 'Resumo do dia',
      title: 'Tarefas de hoje',
      bodyHtml: '<p>Conteúdo confiável</p>',
      brandLabel: 'BZS ONE',
      includeUnsubscribe: false,
    });

    expect(html).toContain('name="viewport"');
    expect(html).toContain('@media only screen and (max-width:620px)');
    expect(html).toContain('BZS ONE');
    expect(html).not.toContain('%unsubscribe_url%');
  });
});
