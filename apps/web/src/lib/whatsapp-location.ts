type JsonRecord = Record<string, unknown>;

export type WhatsappLocation = {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
  thumbnailUrl?: string;
  mapsUrl: string;
};

function asRecord(value: unknown): JsonRecord | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : undefined;
}

function firstText(...values: unknown[]) {
  const value = values.find((item) => typeof item === 'string' && item.trim());
  return typeof value === 'string' ? value.trim() : undefined;
}

function finiteNumber(...values: unknown[]) {
  for (const value of values) {
    const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function thumbnailBytes(value: unknown): number[] | undefined {
  if (Array.isArray(value)) {
    const bytes = value.map(Number).filter((item) => Number.isInteger(item) && item >= 0 && item <= 255);
    return bytes.length === value.length && bytes.length ? bytes : undefined;
  }
  const record = asRecord(value);
  if (!record) return undefined;
  if (Array.isArray(record.data)) return thumbnailBytes(record.data);
  const entries = Object.entries(record)
    .filter(([key]) => /^\d+$/.test(key))
    .sort(([left], [right]) => Number(left) - Number(right));
  return entries.length ? thumbnailBytes(entries.map(([, byte]) => byte)) : undefined;
}

function thumbnailDataUrl(value: unknown) {
  if (typeof value === 'string' && value.trim()) {
    return value.startsWith('data:image/') ? value : `data:image/jpeg;base64,${value}`;
  }
  const bytes = thumbnailBytes(value);
  if (!bytes || typeof globalThis.btoa !== 'function') return undefined;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8_192) {
    binary += String.fromCharCode(...bytes.slice(offset, offset + 8_192));
  }
  return `data:image/jpeg;base64,${globalThis.btoa(binary)}`;
}

export function extractWhatsappLocation(payload: unknown): WhatsappLocation | null {
  const root = asRecord(payload);
  if (!root) return null;
  const content = asRecord(root.message) || asRecord(root.Message) || root;
  const node = asRecord(root.location)
    || asRecord(content.locationMessage)
    || asRecord(content.liveLocationMessage);
  if (!node) return null;

  const latitude = finiteNumber(node.latitude, node.degreesLatitude, node.lat);
  const longitude = finiteNumber(node.longitude, node.degreesLongitude, node.lng, node.lon);
  if (latitude === undefined || longitude === undefined || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return null;
  }

  return {
    latitude,
    longitude,
    name: firstText(node.name, node.caption, node.comment),
    address: firstText(node.address),
    thumbnailUrl: thumbnailDataUrl(node.jpegThumbnail || node.thumbnail),
    mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitude},${longitude}`)}`,
  };
}
