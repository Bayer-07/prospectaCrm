export type ContactListFilters = {
  ownerId: string;
  teamId: string;
  tagId: string;
  company: string;
  hasPhone: '' | 'true' | 'false';
  hasEmail: '' | 'true' | 'false';
};

export const EMPTY_CONTACT_FILTERS: ContactListFilters = {
  ownerId: '',
  teamId: '',
  tagId: '',
  company: '',
  hasPhone: '',
  hasEmail: '',
};

export function activeContactFilterCount(filters: ContactListFilters) {
  return Object.values(filters).filter((value) => value.trim()).length;
}

export function contactListQuery(search: string, filters: ContactListFilters) {
  const params = new URLSearchParams({ limit: '100' });
  const normalizedSearch = search.trim();
  if (normalizedSearch) params.set('search', normalizedSearch);
  for (const [key, value] of Object.entries(filters)) {
    const normalized = value.trim();
    if (normalized) params.set(key, normalized);
  }
  return params.toString();
}
