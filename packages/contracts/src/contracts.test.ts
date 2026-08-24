import { describe, expect, it } from 'vitest';
import { aiGenerationStatuses, aiGenerationTypes, aiProposalStatuses, aiSummaryScopes, campaignCadenceSchema, canSendWhatsapp, chatbotNodeTypes, chatbotResponseProviders, companyInputSchema, contactInputSchema, contactsAreDuplicates, extractSharedWhatsappContacts, formatCnpj, isOptOutMessage, isValidCnpj, nextWarmupCap, normalizeEvolutionInstanceStatus, normalizePhoneKey, opportunityStatusForStage, phoneSchema, workflowNodeTypes } from './index.js';

describe('contratos', () => {
  it('expõe os contratos versionados do assistente e do chatbot OpenAI', () => {
    expect(chatbotResponseProviders).toContain('OPENAI');
    expect(chatbotNodeTypes).toContain('ai_conversation');
    expect(aiGenerationTypes).toEqual(['SUMMARY', 'REPLY_SUGGESTION', 'CHATBOT_REPLY', 'CONFIG_TEST']);
    expect(aiGenerationStatuses).toContain('WAITING_INPUT');
    expect(aiSummaryScopes).toEqual(['CURRENT_ATTENDANCE', 'FULL_CONVERSATION']);
    expect(aiProposalStatuses).toContain('PARTIALLY_APPLIED');
  });

  it('expõe a atribuição de fila nos contratos de chatbot e automação', () => {
    expect(chatbotNodeTypes).toContain('assign_queue');
    expect(workflowNodeTypes).toContain('assign_queue');
  });
  it('normaliza e valida empresa', () => {
    const result = companyInputSchema.parse({
      name: ' Acme Brasil ',
      domain: 'ACME.COM.BR',
      linkedinUrl: 'www.linkedin.com/company/acme-brasil',
    });
    expect(result.name).toBe('Acme Brasil');
    expect(result.domain).toBe('acme.com.br');
    expect(result.linkedinUrl).toBe('https://www.linkedin.com/company/acme-brasil');
  });

  it('rejeita um link externo no campo do LinkedIn', () => {
    expect(companyInputSchema.safeParse({ name: 'Empresa', linkedinUrl: 'https://example.com/company/acme' }).success).toBe(false);
  });

  it('permite remover o link do LinkedIn ao limpar o campo', () => {
    expect(companyInputSchema.partial().parse({ linkedinUrl: '' }).linkedinUrl).toBeNull();
  });

  it('formata o CNPJ e valida seus dígitos verificadores', () => {
    expect(formatCnpj('04252011000110')).toBe('04.252.011/0001-10');
    expect(formatCnpj('04a252b011000110999')).toBe('04.252.011/0001-10');
    expect(isValidCnpj('04.252.011/0001-10')).toBe(true);
    expect(isValidCnpj('04.252.011/0001-11')).toBe(false);
    expect(companyInputSchema.parse({ name: 'Google Brasil', cnpj: '04252011000110' }).cnpj).toBe('04252011000110');
    expect(companyInputSchema.safeParse({ name: 'Empresa inválida', cnpj: '04.252.011/0001-11' }).success).toBe(false);
    expect(companyInputSchema.safeParse({ name: 'Empresa inválida', cnpj: '04A252011000110' }).success).toBe(false);
  });

  it('permite remover a empresa principal de um contato', () => {
    expect(contactInputSchema.partial().parse({ companyId: null }).companyId).toBeNull();
  });

  it('aceita telefone E.164 e rejeita número local', () => {
    expect(phoneSchema.safeParse('+5511999999999').success).toBe(true);
    expect(phoneSchema.safeParse('11999999999').success).toBe(false);
  });

  it('rejeita intervalo de cadência invertido', () => {
    expect(campaignCadenceSchema.safeParse({ bubbleDelayMinSeconds: 9, bubbleDelayMaxSeconds: 2 }).success).toBe(false);
  });

  it('não confunde uma instância conectando com uma conexão estabelecida', () => {
    expect(normalizeEvolutionInstanceStatus('open')).toBe('CONNECTED');
    expect(normalizeEvolutionInstanceStatus('connected')).toBe('CONNECTED');
    expect(normalizeEvolutionInstanceStatus('connecting')).toBe('CONNECTING');
    expect(normalizeEvolutionInstanceStatus('close')).toBe('DISCONNECTED');
    expect(normalizeEvolutionInstanceStatus('LOGOUT')).toBe('DISCONNECTED');
  });

  it('detecta duplicidade por telefone ou e-mail sem diferenciar maiúsculas', () => {
    expect(contactsAreDuplicates({ email: 'Pessoa@Empresa.com' }, { email: 'pessoa@empresa.com' })).toBe(true);
    expect(contactsAreDuplicates({ phone: '+5511999999999' }, { phone: '+5511999999999' })).toBe(true);
  });

  it('considera o nono dígito adicional ao comparar celulares brasileiros', () => {
    expect(normalizePhoneKey('554599225389')).toBe('+5545999225389');
    expect(normalizePhoneKey('+55 (45) 99922-5389')).toBe('+5545999225389');
    expect(contactsAreDuplicates(
      { phone: '+5545999225389' },
      { phone: '+554599225389' },
    )).toBe(true);
  });

  it('não adiciona o nono dígito a telefones fixos brasileiros', () => {
    expect(normalizePhoneKey('+554532221234')).toBe('+554532221234');
  });

  it('extrai um contato compartilhado do payload da Evolution', () => {
    expect(extractSharedWhatsappContacts({
      message: {
        contactMessage: {
          displayName: 'José Inácio',
          vcard: 'BEGIN:VCARD\nVERSION:3.0\nFN:José Inácio\nTEL;type=CELL;waid=553791911020:+55 37 99191-1020\nEND:VCARD',
        },
      },
    })).toEqual([{ name: 'José Inácio', phone: '+5537991911020' }]);
  });

  it('extrai e elimina duplicatas de vários contatos compartilhados', () => {
    expect(extractSharedWhatsappContacts({
      data: {
        message: {
          contactsArrayMessage: {
            contacts: [
              { displayName: 'Pessoa A', vcard: 'BEGIN:VCARD\nFN:Pessoa A\nTEL;waid=5545999225389:+55 45 99922-5389\nEND:VCARD' },
              { displayName: 'Pessoa A duplicada', vcard: 'BEGIN:VCARD\nFN:Pessoa A duplicada\nTEL:+55 45 99922-5389\nEND:VCARD' },
            ],
          },
        },
      },
    })).toEqual([{ name: 'Pessoa A duplicada', phone: '+5545999225389' }]);
  });

  it('bloqueia WhatsApp sem consentimento e por supressão', () => {
    expect(canSendWhatsapp({ phone: '+5511999999999', consentStatus: 'UNKNOWN' })).toMatchObject({ allowed: false });
    expect(canSendWhatsapp({ phone: '+5511999999999', consentStatus: 'GRANTED', suppressed: true })).toMatchObject({ allowed: false });
    expect(canSendWhatsapp({ phone: '+5511999999999', consentStatus: 'GRANTED' })).toEqual({ allowed: true });
  });

  it('preserva a preferência de campanhas quando uma atualização não informa o campo', () => {
    expect(contactInputSchema.partial().parse({ name: 'Maria' })).not.toHaveProperty('campaignsBlocked');
    expect(contactInputSchema.partial().parse({ campaignsBlocked: true })).toMatchObject({ campaignsBlocked: true });
  });

  it('reconhece palavras de descadastro somente no início', () => {
    expect(isOptOutMessage('SAIR por favor')).toBe(true);
    expect(isOptOutMessage('quero SAIR')).toBe(false);
  });

  it('aumenta aquecimento apenas com utilização, falhas e conexão saudáveis', () => {
    expect(nextWarmupCap({ currentCap: 50, increment: 50, maximumCap: 500, sent: 40, failed: 1, connected: true }).cap).toBe(100);
    expect(nextWarmupCap({ currentCap: 50, increment: 50, maximumCap: 500, sent: 39, failed: 0, connected: true }).cap).toBe(50);
    expect(nextWarmupCap({ currentCap: 500, increment: 50, maximumCap: 500, sent: 500, failed: 0, connected: true }).cap).toBe(500);
  });

  it('deriva a transição comercial a partir da etapa', () => {
    expect(opportunityStatusForStage({ isWon: true, isLost: false })).toBe('WON');
    expect(opportunityStatusForStage({ isWon: false, isLost: true })).toBe('LOST');
    expect(opportunityStatusForStage({ isWon: false, isLost: false })).toBe('OPEN');
  });
});
