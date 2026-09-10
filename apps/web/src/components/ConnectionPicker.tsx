import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import { Cable, Check, ChevronDown, Search } from 'lucide-react';
import { formatPhone } from '../lib/api';

export type ConnectionOption = {
  id: string;
  name: string;
  phone?: string;
  status?: string;
};

type ConnectionPickerProps = {
  options: readonly ConnectionOption[];
  value: string;
  onChange(value: string): void;
  selectedLabel?: string;
  loading?: boolean;
  error?: boolean;
  disabled?: boolean;
  placeholder?: string;
  emptyLabel?: string;
  allowEmpty?: boolean;
  ariaLabel?: string;
  className?: string;
};

function connectionDetails(option: ConnectionOption) {
  return [
    option.phone ? formatPhone(option.phone) : '',
    option.status && option.status !== 'CONNECTED' ? 'Desconectada' : '',
  ].filter(Boolean).join(' · ');
}

export function ConnectionPicker({
  options: sourceOptions,
  value,
  onChange,
  selectedLabel,
  loading = false,
  error = false,
  disabled = false,
  placeholder = 'Digite para buscar uma conexão',
  emptyLabel = 'Nenhuma conexão selecionada',
  allowEmpty = false,
  ariaLabel = 'Conexão do WhatsApp',
  className = '',
}: Readonly<ConnectionPickerProps>) {
  const pickerId = useId();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const isDisabled = disabled || loading || error;
  const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR');
  const options = useMemo(() => {
    const filtered = normalizedSearch
      ? sourceOptions.filter((option) => `${option.name} ${option.phone || ''}`.toLocaleLowerCase('pt-BR').includes(normalizedSearch))
      : [...sourceOptions];
    return allowEmpty ? [{ id: '', name: emptyLabel }, ...filtered] : filtered;
  }, [allowEmpty, emptyLabel, normalizedSearch, sourceOptions]);
  const selectedOption = sourceOptions.find((option) => option.id === value);
  const selectedName = selectedOption?.name || (value ? selectedLabel : '') || emptyLabel;
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

  const selectConnection = (connectionId: string) => {
    onChange(connectionId);
    closePicker();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open) {
        openPicker();
        return;
      }
      setActiveIndex((current) => Math.min(current + 1, Math.max(options.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        openPicker();
        return;
      }
      setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === 'Enter' && open && options[activeIndex]) {
      event.preventDefault();
      selectConnection(options[activeIndex].id);
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      closePicker();
    }
  };

  return <div className={`connection-picker ${className}`.trim()}>
    <div className={`connection-picker-control${open ? ' open' : ''}`}>
      <Search size={16} aria-hidden="true" />
      <input
        value={open ? search : selectedName}
        onChange={(event) => {
          setSearch(event.target.value);
          setActiveIndex(0);
          if (!open) setOpen(true);
        }}
        onFocus={openPicker}
        onBlur={() => window.setTimeout(() => setOpen(false), 0)}
        onKeyDown={handleKeyDown}
        placeholder={loading ? 'Carregando conexões…' : error ? 'Conexões indisponíveis' : placeholder}
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
        className="connection-picker-toggle"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => (open ? closePicker() : openPicker())}
        disabled={isDisabled}
        aria-label={open ? 'Fechar opções de conexão' : 'Abrir opções de conexão'}
        tabIndex={-1}
      >
        <ChevronDown size={16} aria-hidden="true" />
      </button>
    </div>
    {open && !isDisabled && <div className="connection-picker-menu" id={listboxId} role="listbox" aria-label={`Opções de ${ariaLabel.toLowerCase()}`}>
      {options.map((option, index) => {
        const selected = option.id === value;
        const details = connectionDetails(option);
        return <button
          type="button"
          role="option"
          id={`${listboxId}-${option.id || 'empty'}`}
          key={option.id || 'empty'}
          aria-selected={selected}
          className={`connection-picker-option${selected ? ' selected' : ''}${index === activeIndex ? ' active' : ''}`}
          onMouseDown={(event) => event.preventDefault()}
          onMouseEnter={() => setActiveIndex(index)}
          onClick={() => selectConnection(option.id)}
        >
          <span className="connection-picker-option-icon"><Cable size={15} aria-hidden="true" /></span>
          <span className="connection-picker-option-copy"><strong>{option.name}</strong>{details && <small>{details}</small>}</span>
          {selected && <Check size={16} aria-hidden="true" />}
        </button>;
      })}
      {normalizedSearch && options.length === (allowEmpty ? 1 : 0) && <p className="connection-picker-empty">Nenhuma conexão encontrada para “{search}”.</p>}
    </div>}
    {open && loading && <div className="connection-picker-menu connection-picker-status" role="status">Carregando conexões…</div>}
    {open && error && <div className="connection-picker-menu connection-picker-status error" role="alert">Não foi possível carregar as conexões.</div>}
  </div>;
}
