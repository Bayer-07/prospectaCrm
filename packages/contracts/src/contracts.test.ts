import { describe, expect, it } from 'vitest';
import { campaignCadenceSchema, canSendWhatsapp, companyInputSchema, contactInputSchema, contactsAreDuplicates, isOptOutMessage, nextWarmupCap, normalizePhoneKey, opportunityStatusForStage, phoneSchema } from './index.js';

describe('contratos', () => {
  it('normaliza e valida empresa', () => {
    const result = companyInputSchema.parse({ name: ' Acme Brasil ', domain: 'ACME.COM.BR' });
    expect(result.name).toBe('Acme Brasil');
    expect(result.domain).toBe('acme.com.br');
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

  it('bloqueia WhatsApp sem consentimento e por supressão', () => {
    expect(canSendWhatsapp({ phone: '+5511999999999', consentStatus: 'UNKNOWN' })).toMatchObject({ allowed: false });
    expect(canSendWhatsapp({ phone: '+5511999999999', consentStatus: 'GRANTED', suppressed: true })).toMatchObject({ allowed: false });
    expect(canSendWhatsapp({ phone: '+5511999999999', consentStatus: 'GRANTED' })).toEqual({ allowed: true });
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
