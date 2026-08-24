export type HsvColor = { h: number; s: number; v: number };
export type RgbColor = { r: number; g: number; b: number };
export type ColorSurfaceBounds = { left: number; top: number; width: number; height: number };

export const TEAM_COLOR_PRESETS = [
  { name: 'Cinza', value: '#64748b' },
  { name: 'Violeta', value: '#635bff' },
  { name: 'Azul', value: '#2563eb' },
  { name: 'Ciano', value: '#0891b2' },
  { name: 'Verde', value: '#0f9f6e' },
  { name: 'Lima', value: '#65a30d' },
  { name: 'Âmbar', value: '#d97706' },
  { name: 'Laranja', value: '#ea580c' },
  { name: 'Vermelho', value: '#e5484d' },
  { name: 'Rosa', value: '#db2777' },
  { name: 'Roxo', value: '#9333ea' },
  { name: 'Grafite', value: '#334155' },
] as const;

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number, precision = 2) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function normalizeHue(hue: number) {
  return ((hue % 360) + 360) % 360;
}

export function isHexColor(value: string) {
  return HEX_COLOR_PATTERN.test(value.trim());
}

export function normalizeHexColor(value: string) {
  const trimmed = value.trim();
  const withPrefix = /^[0-9a-f]{6}$/i.test(trimmed) ? `#${trimmed}` : trimmed;
  return isHexColor(withPrefix) ? withPrefix.toLowerCase() : null;
}

export function rgbToHex({ r, g, b }: RgbColor) {
  const channel = (value: number) => Math.round(clamp(value, 0, 255)).toString(16).padStart(2, '0');
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

export function hexToRgb(value: string): RgbColor | null {
  const normalized = normalizeHexColor(value);
  if (!normalized) return null;
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

export function hsvToRgb({ h, s, v }: HsvColor): RgbColor {
  const hue = normalizeHue(h);
  const saturation = clamp(s, 0, 100) / 100;
  const brightness = clamp(v, 0, 100) / 100;
  const chroma = brightness * saturation;
  const segment = hue / 60;
  const intermediate = chroma * (1 - Math.abs((segment % 2) - 1));
  let red = 0;
  let green = 0;
  let blue = 0;

  if (segment < 1) [red, green] = [chroma, intermediate];
  else if (segment < 2) [red, green] = [intermediate, chroma];
  else if (segment < 3) [green, blue] = [chroma, intermediate];
  else if (segment < 4) [green, blue] = [intermediate, chroma];
  else if (segment < 5) [red, blue] = [intermediate, chroma];
  else [red, blue] = [chroma, intermediate];

  const match = brightness - chroma;
  return {
    r: Math.round((red + match) * 255),
    g: Math.round((green + match) * 255),
    b: Math.round((blue + match) * 255),
  };
}

export function rgbToHsv({ r, g, b }: RgbColor): HsvColor {
  const red = clamp(r, 0, 255) / 255;
  const green = clamp(g, 0, 255) / 255;
  const blue = clamp(b, 0, 255) / 255;
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  let hue = 0;

  if (delta && maximum === red) hue = 60 * (((green - blue) / delta) % 6);
  else if (delta && maximum === green) hue = 60 * (((blue - red) / delta) + 2);
  else if (delta) hue = 60 * (((red - green) / delta) + 4);

  return {
    h: round(normalizeHue(hue)),
    s: round(maximum === 0 ? 0 : (delta / maximum) * 100),
    v: round(maximum * 100),
  };
}

export function hexToHsv(value: string) {
  const rgb = hexToRgb(value);
  return rgb ? rgbToHsv(rgb) : null;
}

export function hsvToHex(value: HsvColor) {
  return rgbToHex(hsvToRgb(value));
}

export function saturationValueFromPoint(clientX: number, clientY: number, bounds: ColorSurfaceBounds) {
  const width = Math.max(bounds.width, 1);
  const height = Math.max(bounds.height, 1);
  return {
    s: round(clamp(((clientX - bounds.left) / width) * 100, 0, 100)),
    v: round(clamp(100 - ((clientY - bounds.top) / height) * 100, 0, 100)),
  };
}

export function adjustSaturationValue(color: HsvColor, key: string, largeStep = false): HsvColor {
  const step = largeStep ? 10 : 1;
  if (key === 'ArrowLeft') return { ...color, s: clamp(color.s - step, 0, 100) };
  if (key === 'ArrowRight') return { ...color, s: clamp(color.s + step, 0, 100) };
  if (key === 'ArrowUp') return { ...color, v: clamp(color.v + step, 0, 100) };
  if (key === 'ArrowDown') return { ...color, v: clamp(color.v - step, 0, 100) };
  return color;
}
