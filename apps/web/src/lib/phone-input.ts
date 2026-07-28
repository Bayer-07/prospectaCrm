const BRAZIL_COUNTRY_CODE = '55';
const MAX_NATIONAL_DIGITS = 11;

export function brazilNationalPhoneDigits(value?: string | null) {
  const digits = String(value || '').replace(/\D/g, '');
  const withoutCountryCode = digits.startsWith(BRAZIL_COUNTRY_CODE) && digits.length >= 12
    ? digits.slice(BRAZIL_COUNTRY_CODE.length)
    : digits;
  return withoutCountryCode.slice(0, MAX_NATIONAL_DIGITS);
}

export function formatBrazilPhoneInput(value?: string | null) {
  const digits = brazilNationalPhoneDigits(value);
  if (!digits) return '';
  if (digits.length <= 2) return `(${digits}`;
  const areaCode = digits.slice(0, 2);
  const local = digits.slice(2);
  if (local.length <= 4) return `(${areaCode}) ${local}`;
  if (local.length <= 8) return `(${areaCode}) ${local.slice(0, 4)}-${local.slice(4)}`;
  return `(${areaCode}) ${local.slice(0, 5)}-${local.slice(5, 9)}`;
}

export function toBrazilE164Phone(value?: string | null) {
  const digits = brazilNationalPhoneDigits(value);
  return digits ? `+${BRAZIL_COUNTRY_CODE}${digits}` : undefined;
}
