import { useEffect, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { Check } from 'lucide-react';
import {
  TEAM_COLOR_PRESETS,
  adjustSaturationValue,
  hexToHsv,
  hsvToHex,
  isHexColor,
  normalizeHexColor,
  saturationValueFromPoint,
  type HsvColor,
} from '../lib/team-color';

type TeamColorPickerProps = Readonly<{
  value: string;
  previewLabel: string;
  onChange(value: string): void;
  onValidityChange(valid: boolean): void;
}>;

const DEFAULT_COLOR = '#64748b';
const ARROW_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);

function initialHsv(value: string) {
  return hexToHsv(value) || hexToHsv(DEFAULT_COLOR) as HsvColor;
}

export function TeamColorPicker({ value, previewLabel, onChange, onValidityChange }: TeamColorPickerProps) {
  const [hsv, setHsv] = useState(() => initialHsv(value));
  const [hexDraft, setHexDraft] = useState(() => normalizeHexColor(value) || value);
  const [hexValid, setHexValid] = useState(() => Boolean(normalizeHexColor(value)));
  const selectedHex = hsvToHex(hsv);

  useEffect(() => {
    const normalized = normalizeHexColor(value);
    if (!normalized) return;
    setHexDraft(normalized);
    setHexValid(true);
    onValidityChange(true);
    if (normalized !== hsvToHex(hsv)) setHsv(initialHsv(normalized));
  }, [value]); // The HSV state intentionally stays independent while dragging achromatic colors.

  const commitHsv = (next: HsvColor) => {
    const nextHex = hsvToHex(next);
    setHsv(next);
    setHexDraft(nextHex);
    setHexValid(true);
    onValidityChange(true);
    onChange(nextHex);
  };

  const commitHex = (nextHex: string) => {
    const normalized = normalizeHexColor(nextHex);
    if (!normalized) return;
    setHsv(initialHsv(normalized));
    setHexDraft(normalized);
    setHexValid(true);
    onValidityChange(true);
    onChange(normalized);
  };

  const updateFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const next = saturationValueFromPoint(event.clientX, event.clientY, bounds);
    commitHsv({ ...hsv, ...next });
  };

  const handleSurfaceKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!ARROW_KEYS.has(event.key)) return;
    event.preventDefault();
    commitHsv(adjustSaturationValue(hsv, event.key, event.shiftKey));
  };

  const handleHexChange = (draft: string) => {
    setHexDraft(draft);
    const valid = isHexColor(draft);
    setHexValid(valid);
    onValidityChange(valid);
    if (valid) commitHex(draft);
  };

  const handleHexBlur = () => {
    const normalized = normalizeHexColor(hexDraft);
    if (normalized) commitHex(normalized);
    else {
      setHexValid(false);
      onValidityChange(false);
    }
  };

  return <section className="team-color-picker" aria-label="Seletor personalizado de cor">
    <header className="team-color-picker-heading">
      <div><strong>Cor de identificação</strong><small>Escolha a tonalidade e ajuste os detalhes.</small></div>
      <span className="team-badge team-color-preview" style={{ '--team-color': selectedHex } as CSSProperties}><i />{previewLabel || 'Nome da fila'}</span>
    </header>

    <div
      className="team-color-surface"
      style={{ backgroundColor: `hsl(${hsv.h} 100% 50%)` }}
      role="slider"
      tabIndex={0}
      aria-label="Saturação e luminosidade"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(hsv.s)}
      aria-valuetext={`Saturação ${Math.round(hsv.s)}%, luminosidade ${Math.round(hsv.v)}%`}
      onKeyDown={handleSurfaceKeyDown}
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.focus();
        event.currentTarget.setPointerCapture(event.pointerId);
        updateFromPointer(event);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) updateFromPointer(event);
      }}
      onPointerUp={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }}
    >
      <span className="team-color-surface-marker" style={{ left: `${hsv.s}%`, top: `${100 - hsv.v}%`, backgroundColor: selectedHex }} />
    </div>

    <div className="team-color-controls">
      <label className="team-color-hue">
        <span><strong>Tonalidade</strong><output>{Math.round(hsv.h)}°</output></span>
        <input
          type="range"
          min={0}
          max={360}
          step={1}
          value={Math.round(hsv.h)}
          aria-label="Tonalidade da cor"
          aria-valuetext={`${Math.round(hsv.h)} graus`}
          onChange={(event) => commitHsv({ ...hsv, h: Number(event.target.value) })}
        />
      </label>
      <label className={`team-color-hex${hexValid ? '' : ' invalid'}`}>
        <span>Hexadecimal</span>
        <div><i style={{ backgroundColor: selectedHex }} /><input value={hexDraft} onChange={(event) => handleHexChange(event.target.value)} onBlur={handleHexBlur} spellCheck={false} autoCapitalize="none" aria-invalid={!hexValid} aria-describedby={hexValid ? undefined : 'team-color-hex-error'} /></div>
        {!hexValid && <small id="team-color-hex-error">Use o formato #RRGGBB.</small>}
      </label>
    </div>

    <fieldset className="team-color-presets">
      <legend>Cores rápidas</legend>
      <div>{TEAM_COLOR_PRESETS.map((preset) => {
        const selected = preset.value === selectedHex;
        return <button key={preset.value} type="button" className={selected ? 'selected' : ''} style={{ '--preset-color': preset.value } as CSSProperties} onClick={() => commitHex(preset.value)} aria-label={`${preset.name}: ${preset.value}`} aria-pressed={selected} title={preset.name}>{selected && <Check size={15} />}</button>;
      })}</div>
    </fieldset>
  </section>;
}
