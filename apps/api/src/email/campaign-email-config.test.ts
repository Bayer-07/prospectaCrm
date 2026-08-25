import { describe, expect, it } from 'vitest';
import { campaignEmailConfigurationStatus } from './campaign-email-config.js';

describe('configuração SMTP para campanhas', () => {
  it('exige SMTP e IMAP sem expor as senhas', () => {
    expect(campaignEmailConfigurationStatus({
      CAMPAIGN_SMTP_HOST: 'smtps.uhserver.com',
      CAMPAIGN_SMTP_PORT: '587',
      CAMPAIGN_SMTP_USER: 'comercial@bzs.com.br',
      CAMPAIGN_IMAP_SAVE_SENT: 'true',
      CAMPAIGN_IMAP_HOST: 'imap.uhserver.com',
    } as NodeJS.ProcessEnv)).toEqual({
      provider: 'smtp',
      configured: false,
      fromEmail: 'comercial@bzs.com.br',
      fromName: 'BZS Tecnologia',
      smtpHost: 'smtps.uhserver.com',
      smtpPort: 587,
      smtpSecurity: 'starttls',
      saveSent: true,
      imapHost: 'imap.uhserver.com',
      missing: ['CAMPAIGN_SMTP_PASSWORD', 'CAMPAIGN_IMAP_PORT'],
    });
  });

  it('reconhece a configuração completa da UOL Host', () => {
    expect(campaignEmailConfigurationStatus({
      CAMPAIGN_SMTP_HOST: 'smtps.uhserver.com',
      CAMPAIGN_SMTP_PORT: '587',
      CAMPAIGN_SMTP_SECURE: 'false',
      CAMPAIGN_SMTP_USER: 'comercial@bzs.com.br',
      CAMPAIGN_SMTP_PASSWORD: 'secret',
      CAMPAIGN_SMTP_FROM_NAME: 'Gabriel da BZS Tecnologia',
      CAMPAIGN_IMAP_SAVE_SENT: 'true',
      CAMPAIGN_IMAP_HOST: 'imap.uhserver.com',
      CAMPAIGN_IMAP_PORT: '993',
    } as NodeJS.ProcessEnv)).toMatchObject({
      provider: 'smtp',
      configured: true,
      fromEmail: 'comercial@bzs.com.br',
      fromName: 'Gabriel da BZS Tecnologia',
      smtpSecurity: 'starttls',
      saveSent: true,
      missing: [],
    });
  });

  it('mantém compatibilidade com a configuração anterior do Gmail', () => {
    expect(campaignEmailConfigurationStatus({
      CAMPAIGN_GMAIL_USER: 'campanhas@example.com',
      CAMPAIGN_GMAIL_APP_PASSWORD: 'abcd efgh ijkl mnop',
    } as NodeJS.ProcessEnv)).toMatchObject({
      provider: 'gmail',
      configured: true,
      fromEmail: 'campanhas@example.com',
      missing: [],
    });
  });
});
