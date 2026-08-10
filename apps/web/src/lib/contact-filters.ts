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

export const CONTACT_LIST_PAGE_SIZE = 20;

export function contactListQuery(search: string, filters: ContactListFilters, cursor?: string) {
  const params = new URLSearchParams({ limit: String(CONTACT_LIST_PAGE_SIZE) });
  const normalizedSearch = search.trim();
  if (normalizedSearch) params.set('search', normalizedSearch);
  if (cursor) params.set('cursor', cursor);
  for (const [key, value] of Object.entries(filters)) {
    const normalized = value.trim();
    if (normalized) params.set(key, normalized);
  }
  return params.toString();
}
