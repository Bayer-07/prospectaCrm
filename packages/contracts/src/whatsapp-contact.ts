/**
 * Produces the stable key used to compare telephone numbers.
 *
 * Brazilian mobile numbers written in the legacy eight-digit format are
 * equivalent to the current format with the ninth digit.
 */
export function normalizePhoneKey(value?: string | null) {
  const digits = value?.replace(/\D/g, '') || '';
  if (!digits) return null;

  const brazilianLegacyMobile = /^55[1-9]\d[6-9]\d{7}$/;
  const canonicalDigits = brazilianLegacyMobile.test(digits)
    ? `${digits.slice(0, 4)}9${digits.slice(4)}`
    : digits;

  return `+${canonicalDigits}`;
}

export type SharedWhatsappContact = {
  name: string;
  phone: string;
};

function sharedContactMessageContent(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {} as Record<string, unknown>;
  let root = input as Record<string, any>;
  root = (Array.isArray(root.data) ? root.data[0] : root.data) || root;
  let message = root.message || root.Message || root;
  for (let depth = 0; depth < 6; depth += 1) {
    const wrapped = message?.documentWithCaptionMessage?.message
      || message?.ephemeralMessage?.message
      || message?.viewOnceMessage?.message
      || message?.viewOnceMessageV2?.message
      || message?.viewOnceMessageV2Extension?.message;
    if (!wrapped || wrapped === message) break;
    message = wrapped;
  }
  return message && typeof message === 'object' ? message as Record<string, any> : {};
}

function vcardField(vcard: string, field: string) {
  const unfolded = vcard.replace(/\r?\n[ \t]/g, '');
  const line = unfolded.split(/\r?\n/).find((item) => item.toLocaleUpperCase('en-US').startsWith(`${field}:`));
  if (!line) return '';
  return line.slice(line.indexOf(':') + 1)
    .replace(/\\n/gi, ' ')
    .replace(/\\([,;\\])/g, '$1')
    .trim();
}

function vcardPhone(vcard: string) {
  const unfolded = vcard.replace(/\r?\n[ \t]/g, '');
  const telephone = unfolded.split(/\r?\n/).find((line) => /^TEL(?:;|:)/i.test(line));
  if (!telephone) return null;
  const separator = telephone.indexOf(':');
  const metadata = separator >= 0 ? telephone.slice(0, separator) : telephone;
  const value = separator >= 0 ? telephone.slice(separator + 1) : '';
  const whatsappId = metadata.match(/(?:^|;)waid=([1-9]\d{7,14})(?:;|$)/i)?.[1];
  return normalizePhoneKey(whatsappId || value);
}

/**
 * Reads WhatsApp contact cards from Evolution/Baileys payloads.
 * Supports both a single `contactMessage` and `contactsArrayMessage`.
 */
export function extractSharedWhatsappContacts(input: unknown): SharedWhatsappContact[] {
  const message = sharedContactMessageContent(input);
  const single = message.contactMessage;
  const collection = message.contactsArrayMessage?.contacts;
  const nodes = [
    ...(single && typeof single === 'object' ? [single] : []),
    ...(Array.isArray(collection) ? collection : []),
  ] as Array<Record<string, any>>;
  const contacts = new Map<string, SharedWhatsappContact>();

  for (const node of nodes) {
    const vcard = typeof node.vcard === 'string' ? node.vcard : '';
    const phone = vcardPhone(vcard)
      || normalizePhoneKey(typeof node.phoneNumber === 'string' ? node.phoneNumber : typeof node.phone === 'string' ? node.phone : '');
    if (!phone) continue;
    const name = String(node.displayName || vcardField(vcard, 'FN') || vcardField(vcard, 'N') || 'Contato WhatsApp').trim();
    contacts.set(phone, { name: name || 'Contato WhatsApp', phone });
  }

  return [...contacts.values()];
}
