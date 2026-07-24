export type SearchableContact = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
};

export const normalizeContactSearch = (value: string) => value.trim().toLocaleLowerCase('pt-BR');

export function contactMatchesSearch(contact: SearchableContact, search: string) {
  const normalized = normalizeContactSearch(search);
  if (!normalized) return true;
  return [contact.name, contact.email, contact.phone]
    .some((value) => value?.toLocaleLowerCase('pt-BR').includes(normalized));
}

export function contactIsSelected(
  contact: SearchableContact,
  selectedIds: Set<string>,
  selectedSearches: string[],
  excludedIds: Set<string>,
) {
  if (excludedIds.has(contact.id)) return false;
  return selectedIds.has(contact.id)
    || selectedSearches.some((search) => contactMatchesSearch(contact, search));
}
