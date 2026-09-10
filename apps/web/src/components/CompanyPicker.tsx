import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Building2, Check, ChevronDown, Search } from 'lucide-react';
import type { Company } from '../lib/types';

type CompanyPickerProps = {
  companies: readonly Company[];
  value: string;
  onChange(value: string): void;
  selectedLabel?: string;
  loading?: boolean;
  error?: boolean;
  disabled?: boolean;
  placeholder?: string;
  noCompanyLabel?: string;
  ariaLabel?: string;
  className?: string;
};

export function CompanyPicker({
  companies,
  value,
  onChange,
  selectedLabel,
  loading = false,
  error = false,
  disabled = false,
  placeholder = 'Digite para buscar uma empresa',
  noCompanyLabel = 'Sem empresa vinculada',
  ariaLabel = 'Empresa',
  className = '',
}: Readonly<CompanyPickerProps>) {
  const pickerId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const selectedCompany = companies.find((company) => company.id === value);
  const selectedName = selectedCompany?.name || (value ? selectedLabel : '') || '';
  const isDisabled = disabled || loading || error;
  const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR');
  const filteredCompanies = useMemo(() => {
    if (!normalizedSearch) return [...companies];
    return companies.filter((company) => company.name.toLocaleLowerCase('pt-BR').includes(normalizedSearch));
  }, [companies, normalizedSearch]);
  const options = useMemo(() => [
    { id: '', name: noCompanyLabel },
    ...filteredCompanies,
  ], [filteredCompanies, noCompanyLabel]);
  const listboxId = `${pickerId}-options`;
  const activeOption = open && options[activeIndex] ? `${listboxId}-${options[activeIndex].id || 'empty'}` : undefined;

  const openPicker = () => {
    if (isDisabled) return;
    setOpen(true);
    setSearch('');
    setActiveIndex(0);
  };

  const closePicker = () => {
    setOpen(false);
    setSearch('');
    setActiveIndex(0);
  };

  const selectCompany = (companyId: string) => {
    onChange(companyId);
    closePicker();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open) {
        openPicker();
        return;
      }
      setActiveIndex((current) => Math.min(current + 1, options.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        openPicker();
        return;
      }
      setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === 'Enter' && open && options[activeIndex]) {
      event.preventDefault();
      selectCompany(options[activeIndex].id);
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      closePicker();
    }
  };

  return <div className={`company-picker ${className}`.trim()}>
    <div className={`company-picker-control${open ? ' open' : ''}`}>
      <Search size={16} aria-hidden="true" />
      <input
        ref={inputRef}
        value={open ? search : selectedName}
        onChange={(event) => {
          setSearch(event.target.value);
          setActiveIndex(0);
          if (!open) setOpen(true);
        }}
        onFocus={openPicker}
        onBlur={() => window.setTimeout(() => setOpen(false), 0)}
        onKeyDown={handleKeyDown}
        placeholder={loading ? 'Carregando empresas…' : error ? 'Empresas indisponíveis' : placeholder}
        disabled={isDisabled}
        autoComplete="off"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={activeOption}
      />
      <button
        type="button"
        className="company-picker-toggle"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => (open ? closePicker() : openPicker())}
        disabled={isDisabled}
        aria-label={open ? 'Fechar opções de empresa' : 'Abrir opções de empresa'}
        tabIndex={-1}
      >
        <ChevronDown size={16} aria-hidden="true" />
      </button>
    </div>
    {open && !isDisabled && <div className="company-picker-menu" id={listboxId} role="listbox" aria-label={`Opções de ${ariaLabel.toLowerCase()}`}>
      {options.map((option, index) => {
        const selected = option.id === value;
        return <button
          type="button"
          role="option"
          id={`${listboxId}-${option.id || 'empty'}`}
          key={option.id || 'empty'}
          aria-selected={selected}
          className={`company-picker-option${selected ? ' selected' : ''}${index === activeIndex ? ' active' : ''}`}
          onMouseDown={(event) => event.preventDefault()}
          onMouseEnter={() => setActiveIndex(index)}
          onClick={() => selectCompany(option.id)}
        >
          <span className="company-picker-option-icon"><Building2 size={15} aria-hidden="true" /></span>
          <span className="company-picker-option-copy">{option.name}</span>
          {selected && <Check size={16} aria-hidden="true" />}
        </button>;
      })}
      {normalizedSearch && filteredCompanies.length === 0 && <p className="company-picker-empty">Nenhuma empresa encontrada para “{search}”.</p>}
    </div>}
    {open && loading && <div className="company-picker-menu company-picker-status" role="status">Carregando empresas…</div>}
    {open && error && <div className="company-picker-menu company-picker-status error" role="alert">Não foi possível carregar as empresas.</div>}
  </div>;
}
