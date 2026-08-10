import { describe, expect, it } from 'vitest';
import {
  activeContactFilterCount,
  contactListQuery,
  EMPTY_CONTACT_FILTERS,
} from './contact-filters';

describe('filtros da listagem de contatos', () => {
  it('envia somente os filtros aplicados para a API', () => {
    const query = new URLSearchParams(contactListQuery(' Bayer ', {
      ...EMPTY_CONTACT_FILTERS,
      ownerId: 'none',
      company: 'BZS Tecnologia',
      hasPhone: 'true',
    }));

    expect(Object.fromEntries(query)).toEqual({
      limit: '20',
      search: 'Bayer',
      ownerId: 'none',
      company: 'BZS Tecnologia',
      hasPhone: 'true',
    });
  });

  it('inclui o cursor somente nas páginas seguintes', () => {
    const firstPage = new URLSearchParams(contactListQuery('', EMPTY_CONTACT_FILTERS));
    const nextPage = new URLSearchParams(contactListQuery('', EMPTY_CONTACT_FILTERS, 'contact-20'));

    expect(firstPage.has('cursor')).toBe(false);
    expect(nextPage.get('cursor')).toBe('contact-20');
    expect(nextPage.get('limit')).toBe('20');
  });

  it('contabiliza os filtros ativos para o indicador do botão', () => {
    expect(activeContactFilterCount({
      ...EMPTY_CONTACT_FILTERS,
      teamId: 'team-1',
      hasEmail: 'false',
    })).toBe(2);
  });
});
