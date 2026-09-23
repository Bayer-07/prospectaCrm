import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { FloatingMenu } from './FloatingMenu';

export type FloatingSelectOption = Readonly<{
  value: string;
  label: ReactNode;
  disabled?: boolean;
}>;

type FloatingSelectProps = Readonly<{
  value: string;
  options: readonly FloatingSelectOption[];
  onChange(value: string): void;
  ariaLabel: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}>;

export function FloatingSelect({ value, options, onChange, ariaLabel, placeholder = 'Selecione uma opção', disabled = false, className = '' }: FloatingSelectProps) {
  const selectId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const selectedOption = options.find((option) => option.value === value);

  const close = () => setOpen(false);
  const selectOption = (option: FloatingSelectOption) => {
    if (option.disabled) return;
    onChange(option.value);
    close();
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!disabled) setOpen(true);
    }
  };

  return <div className={`floating-select ${className}`.trim()}>
    <button
      ref={triggerRef}
      type="button"
      id={selectId}
      className={`floating-select-trigger${open ? ' open' : ''}`}
      onClick={() => { if (!disabled) setOpen((current) => !current); }}
      onKeyDown={handleKeyDown}
      disabled={disabled}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-label={ariaLabel}
    >
      <span>{selectedOption?.label || placeholder}</span>
      <ChevronDown size={15} aria-hidden="true" />
    </button>
    <FloatingMenu anchorRef={triggerRef} open={open} className="floating-select-menu" maxHeight={280} onOutsideClick={close} id={`${selectId}-options`} role="listbox" ariaLabel={ariaLabel}>
      {options.map((option) => <button
        key={option.value}
        type="button"
        role="option"
        className={`floating-select-option${option.value === value ? ' selected' : ''}`}
        aria-selected={option.value === value}
        disabled={option.disabled}
        onClick={() => selectOption(option)}
      >
        <span>{option.label}</span>
        {option.value === value && <Check size={15} aria-hidden="true" />}
      </button>)}
    </FloatingMenu>
  </div>;
}
