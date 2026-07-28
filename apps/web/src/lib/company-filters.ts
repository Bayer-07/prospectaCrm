export type CompanyListFilters = {
  ownerId: string;
  teamId: string;
  sector: string;
  size: string;
  hasContacts: '' | 'true' | 'false';
};

export const EMPTY_COMPANY_FILTERS: CompanyListFilters = {
  ownerId: '',
  teamId: '',
  sector: '',
  size: '',
  hasContacts: '',
};

export function activeCompanyFilterCount(filters: CompanyListFilters) {
  return Object.values(filters).filter((value) => value.trim()).length;
}

export function companyListQuery(search: string, filters: CompanyListFilters) {
  const params = new URLSearchParams({ limit: '100' });
  const normalizedSearch = search.trim();
  if (normalizedSearch) params.set('search', normalizedSearch);
  for (const [key, value] of Object.entries(filters)) {
    const normalized = value.trim();
    if (normalized) params.set(key, normalized);
  }
  return params.toString();
}
