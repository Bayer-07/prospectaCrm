import { useRef, useState, type CSSProperties } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { FloatingMenu } from './FloatingMenu';

export type TagMultiSelectOption = { id: string; name: string; color: string };

type TagMultiSelectProps = Readonly<{
  label: string;
  options: TagMultiSelectOption[];
  value: string[];
  placeholder?: string;
  className?: string;
  onChange(value: string[]): void;
}>;

export function TagMultiSelect({ label, options, value, placeholder = 'Todas as tags', className = '', onChange }: TagMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const selectedOptions = options.filter((option) => value.includes(option.id));

  const toggle = (tagId: string) => {
    onChange(value.includes(tagId) ? value.filter((id) => id !== tagId) : [...value, tagId]);
  };

  return <div className={`field tag-multi-select ${className}`.trim()}>
    <span>{label}</span>
    <div className="tag-multi-select-control">
      <button ref={triggerRef} type="button" className={`tag-multi-select-trigger${open ? ' open' : ''}`} onClick={() => setOpen((current) => !current)} aria-haspopup="listbox" aria-expanded={open}>
        <span className="tag-multi-select-value">
          {selectedOptions.length ? <>{selectedOptions.slice(0, 2).map((tag) => <span className="tag-multi-select-chip" key={tag.id} style={{ '--tag-color': tag.color } as CSSProperties}>{tag.name}</span>)}{selectedOptions.length > 2 && <span className="tag-multi-select-more">+{selectedOptions.length - 2}</span>}</> : <span className="tag-multi-select-placeholder">{placeholder}</span>}
        </span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      <FloatingMenu anchorRef={triggerRef} open={open} className="tag-multi-select-menu" maxHeight={220} onOutsideClick={() => setOpen(false)} role="listbox" ariaLabel={label} ariaMultiselectable>
        {options.length ? options.map((tag) => {
          const selected = value.includes(tag.id);
          return <button type="button" role="option" aria-selected={selected} className={`tag-multi-select-option${selected ? ' selected' : ''}`} key={tag.id} onClick={() => toggle(tag.id)}>
            <i style={{ background: tag.color }} aria-hidden="true" />
            <span>{tag.name}</span>
            {selected && <Check size={15} aria-hidden="true" />}
          </button>;
        }) : <p className="tag-multi-select-empty">Nenhuma tag encontrada.</p>}
      </FloatingMenu>
    </div>
  </div>;
}
