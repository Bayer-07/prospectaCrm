import { describe, expect, it } from 'vitest';
import {
  renderBzsEmailLayout,
  renderPasswordResetEmail,
  renderUserInviteEmail,
  sgaProspectingEmailTemplates,
} from './email-templates.js';

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

describe('modelo transacional de convite', () => {
  it('gera versões HTML e texto sem descadastro e protege o conteúdo dinâmico', () => {
    const email = renderUserInviteEmail({
      recipientName: 'Gabriel <Bayer>',
      inviterName: 'Administrador',
      organizationName: 'BZS Tecnologia',
      roleName: 'Vendedor',
      inviteUrl: 'https://one.bzs.com.br/aceitar-convite?token=seguro',
      expiresInHours: 72,
    });

    expect(email.subject).toBe('Você foi convidado para acessar o BZS One');
    expect(email.html).toContain('Gabriel &lt;Bayer&gt;');
    expect(email.html).toContain('Aceitar convite');
    expect(email.html).toContain('ACESSO SEGURO');
    expect(email.html).not.toContain('%unsubscribe_url%');
    expect(email.text).toContain('token=seguro');
    expect(email.text).toContain('expira em 72 horas');
  });
});

describe('modelo transacional de recuperação de senha', () => {
  it('gera um e-mail seguro, responsivo e sem descadastro', () => {
    const email = renderPasswordResetEmail({
      recipientName: 'Gabriel <Bayer>',
      resetUrl: 'https://one.bzs.com.br/redefinir-senha?token=seguro',
      expiresInMinutes: 60,
    });

    expect(email.subject).toBe('Redefina sua senha no BZS One');
    expect(email.html).toContain('Gabriel &lt;Bayer&gt;');
    expect(email.html).toContain('Redefinir minha senha');
    expect(email.html).toContain('SEGURANÇA DA CONTA');
    expect(email.html).not.toContain('%unsubscribe_url%');
    expect(email.text).toContain('token=seguro');
    expect(email.text).toContain('expira em 60 minutos');
  });
});
