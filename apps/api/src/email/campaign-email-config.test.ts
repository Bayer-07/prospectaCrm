import { describe, expect, it } from 'vitest';
import { campaignEmailConfigurationStatus } from './campaign-email-config.js';

describe('configuração do Gmail para campanhas', () => {
  it('exige usuário e senha de app sem expor a senha', () => {
    expect(campaignEmailConfigurationStatus({
      CAMPAIGN_GMAIL_USER: 'campanhas@example.com',
    } as NodeJS.ProcessEnv)).toEqual({
      provider: 'gmail',
      configured: false,
      fromEmail: 'campanhas@example.com',
      fromName: 'BZS Tecnologia',
      missing: ['CAMPAIGN_GMAIL_APP_PASSWORD'],
    });
  });

  it('reconhece a configuração completa', () => {
    expect(campaignEmailConfigurationStatus({
      CAMPAIGN_GMAIL_USER: 'campanhas@example.com',
      CAMPAIGN_GMAIL_APP_PASSWORD: 'abcd efgh ijkl mnop',
      CAMPAIGN_GMAIL_FROM_NAME: 'Comercial BZS',
    } as NodeJS.ProcessEnv)).toMatchObject({
      provider: 'gmail',
      configured: true,
      fromEmail: 'campanhas@example.com',
      fromName: 'Comercial BZS',
      missing: [],
    });
  });
});
