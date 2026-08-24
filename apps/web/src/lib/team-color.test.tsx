import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { TeamColorPicker } from '../components/TeamColorPicker';
import {
  TEAM_COLOR_PRESETS,
  adjustSaturationValue,
  hexToHsv,
  hsvToHex,
  hsvToRgb,
  isHexColor,
  normalizeHexColor,
  rgbToHex,
  rgbToHsv,
  saturationValueFromPoint,
} from './team-color';

describe('cores de filas', () => {
  it('normaliza apenas hexadecimais completos de seis dígitos', () => {
    expect(normalizeHexColor(' 64748B ')).toBe('#64748b');
    expect(normalizeHexColor(' #635BFF ')).toBe('#635bff');
    expect(normalizeHexColor('#123')).toBeNull();
    expect(normalizeHexColor('#xyzxyz')).toBeNull();
    expect(isHexColor('#0f9f6e')).toBe(true);
    expect(isHexColor('0f9f6e')).toBe(false);
  });

  it('converte cores primárias entre HSV, RGB e HEX', () => {
    expect(hsvToRgb({ h: 0, s: 100, v: 100 })).toEqual({ r: 255, g: 0, b: 0 });
    expect(hsvToRgb({ h: 120, s: 100, v: 100 })).toEqual({ r: 0, g: 255, b: 0 });
    expect(hsvToRgb({ h: 240, s: 100, v: 100 })).toEqual({ r: 0, g: 0, b: 255 });
    expect(rgbToHex({ r: 99, g: 91, b: 255 })).toBe('#635bff');
    expect(rgbToHsv({ r: 255, g: 255, b: 255 })).toEqual({ h: 0, s: 0, v: 100 });
  });

  it('mantém todas as cores rápidas após a conversão HEX → HSV → HEX', () => {
    for (const preset of TEAM_COLOR_PRESETS) {
      const hsv = hexToHsv(preset.value);
      expect(hsv).not.toBeNull();
      expect(hsvToHex(hsv!)).toBe(preset.value);
    }
  });

  it('calcula saturação e luminosidade pela posição e limita o arraste à superfície', () => {
    const bounds = { left: 10, top: 20, width: 200, height: 100 };
    expect(saturationValueFromPoint(110, 70, bounds)).toEqual({ s: 50, v: 50 });
    expect(saturationValueFromPoint(-50, -30, bounds)).toEqual({ s: 0, v: 100 });
    expect(saturationValueFromPoint(500, 300, bounds)).toEqual({ s: 100, v: 0 });
  });

  it('ajusta saturação e luminosidade pelo teclado com passos normal e ampliado', () => {
    const color = { h: 210, s: 50, v: 50 };
    expect(adjustSaturationValue(color, 'ArrowLeft')).toEqual({ h: 210, s: 49, v: 50 });
    expect(adjustSaturationValue(color, 'ArrowUp', true)).toEqual({ h: 210, s: 50, v: 60 });
    expect(adjustSaturationValue({ h: 210, s: 2, v: 98 }, 'ArrowLeft', true).s).toBe(0);
    expect(adjustSaturationValue({ h: 210, s: 2, v: 98 }, 'ArrowUp', true).v).toBe(100);
  });

  it('renderiza controles acessíveis sem o seletor nativo do sistema', () => {
    const html = renderToStaticMarkup(<TeamColorPicker value="#635bff" previewLabel="Prospecção" onChange={() => undefined} onValidityChange={() => undefined} />);
    expect(html).toContain('aria-label="Seletor personalizado de cor"');
    expect(html).toContain('aria-label="Saturação e luminosidade"');
    expect(html).toContain('aria-label="Tonalidade da cor"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('Prospecção');
    expect(html).not.toContain('type="color"');
  });
});
