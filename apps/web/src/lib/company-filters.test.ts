import { describe, expect, it } from 'vitest';
import {
  activeCompanyFilterCount,
  companyListQuery,
  EMPTY_COMPANY_FILTERS,
} from './company-filters';

describe('filtros da listagem de empresas', () => {
  it('envia somente a busca e os filtros aplicados', () => {
    const query = new URLSearchParams(companyListQuery(' BZS ', {
      ...EMPTY_COMPANY_FILTERS,
      ownerId: 'none',
      sector: 'Tecnologia',
      hasContacts: 'true',
    }));

    expect(Object.fromEntries(query)).toEqual({
      limit: '100',
      search: 'BZS',
      ownerId: 'none',
      sector: 'Tecnologia',
      hasContacts: 'true',
    });
  });

  it('contabiliza todos os filtros ativos', () => {
    expect(activeCompanyFilterCount({
      ...EMPTY_COMPANY_FILTERS,
      teamId: 'team-1',
      size: 'Médio',
      hasContacts: 'false',
    })).toBe(3);
  });
});
