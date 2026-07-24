import { describe, expect, it } from 'vitest';
import { contactIsSelected, contactMatchesSearch, normalizeContactSearch } from './contactSelection';

const contact = {
  id: 'contact-1',
  name: 'Comercial BZS',
  email: 'gabriel@bzs.com.br',
  phone: '+5545999225389',
};

describe('seleção de contatos filtrados', () => {
  it('normaliza e encontra um contato pelo domínio do e-mail', () => {
    expect(normalizeContactSearch('  BZS.COM.BR ')).toBe('bzs.com.br');
    expect(contactMatchesSearch(contact, 'BZS.COM.BR')).toBe(true);
  });

  it('considera a seleção individual ou uma busca selecionada', () => {
    expect(contactIsSelected(contact, new Set(), ['bzs.com.br'], new Set())).toBe(true);
    expect(contactIsSelected(contact, new Set(['contact-1']), [], new Set())).toBe(true);
  });

  it('permite excluir um contato da seleção em massa', () => {
    expect(contactIsSelected(
      contact,
      new Set(['contact-1']),
      ['bzs.com.br'],
      new Set(['contact-1']),
    )).toBe(false);
  });
});
