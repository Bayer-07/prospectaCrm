import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

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
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const selectedOptions = options.filter((option) => value.includes(option.id));

  useEffect(() => {
    if (!open) {
      setMenuPosition(null);
      return;
    }
    const updateMenuPosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const gap = 5;
      const estimatedHeight = Math.min(220, Math.max(44, options.length * 34 + 10));
      const opensAbove = rect.bottom + gap + estimatedHeight > window.innerHeight && rect.top - gap - estimatedHeight > 0;
      const maxHeight = Math.max(44, Math.min(220, opensAbove ? rect.top - gap : window.innerHeight - rect.bottom - gap));
      setMenuPosition({ top: opensAbove ? rect.top - gap - maxHeight : rect.bottom + gap, left: rect.left, width: rect.width, maxHeight });
    };
    const closeOnOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const frame = window.requestAnimationFrame(updateMenuPosition);
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [open, options.length]);

  const toggle = (tagId: string) => {
    onChange(value.includes(tagId) ? value.filter((id) => id !== tagId) : [...value, tagId]);
  };

  return <div ref={rootRef} className={`field tag-multi-select ${className}`.trim()}>
    <span>{label}</span>
    <div className="tag-multi-select-control">
      <button ref={triggerRef} type="button" className={`tag-multi-select-trigger${open ? ' open' : ''}`} onClick={() => setOpen((current) => !current)} aria-haspopup="listbox" aria-expanded={open}>
        <span className="tag-multi-select-value">
          {selectedOptions.length ? <>{selectedOptions.slice(0, 2).map((tag) => <span className="tag-multi-select-chip" key={tag.id} style={{ '--tag-color': tag.color } as CSSProperties}>{tag.name}</span>)}{selectedOptions.length > 2 && <span className="tag-multi-select-more">+{selectedOptions.length - 2}</span>}</> : <span className="tag-multi-select-placeholder">{placeholder}</span>}
        </span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      {open && menuPosition && createPortal(<div ref={menuRef} className="tag-multi-select-menu" role="listbox" aria-label={label} aria-multiselectable="true" style={menuPosition}>
        {options.length ? options.map((tag) => {
          const selected = value.includes(tag.id);
          return <button type="button" role="option" aria-selected={selected} className={`tag-multi-select-option${selected ? ' selected' : ''}`} key={tag.id} onClick={() => toggle(tag.id)}>
            <i style={{ background: tag.color }} aria-hidden="true" />
            <span>{tag.name}</span>
            {selected && <Check size={15} aria-hidden="true" />}
          </button>;
        }) : <p className="tag-multi-select-empty">Nenhuma tag encontrada.</p>}
      </div>, document.body)}
    </div>
  </div>;
}
