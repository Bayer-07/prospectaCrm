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
      limit: '100',
      search: 'Bayer',
      ownerId: 'none',
      company: 'BZS Tecnologia',
      hasPhone: 'true',
    });
  });

  it('contabiliza os filtros ativos para o indicador do botão', () => {
    expect(activeContactFilterCount({
      ...EMPTY_CONTACT_FILTERS,
      teamId: 'team-1',
      hasEmail: 'false',
    })).toBe(2);
  });
});
