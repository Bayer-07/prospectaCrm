import { createPortal } from 'react-dom';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type HTMLAttributes, type ReactNode, type RefObject } from 'react';

type FloatingMenuPosition = {
  top: number;
  left: number;
  maxHeight: number;
  width?: number;
};

type FloatingMenuProps = Readonly<{
  anchorRef: RefObject<HTMLElement | null>;
  open: boolean;
  className: string;
  maxHeight: number;
  minHeight?: number;
  matchAnchorWidth?: boolean;
  id?: string;
  role?: HTMLAttributes<HTMLDivElement>['role'];
  ariaLabel?: string;
  ariaMultiselectable?: boolean;
  children: ReactNode;
  onOutsideClick?(): void;
}>;

export function FloatingMenu({ anchorRef, open, className, maxHeight, minHeight = 44, matchAnchorWidth = true, id, role, ariaLabel, ariaMultiselectable, children, onOutsideClick }: FloatingMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef(onOutsideClick);
  const [position, setPosition] = useState<FloatingMenuPosition | null>(null);
  closeRef.current = onOutsideClick;

  const calculatePosition = useCallback((menuHeight = maxHeight): FloatingMenuPosition | null => {
    const anchor = anchorRef.current;
    if (!anchor) return null;
    const rect = anchor.getBoundingClientRect();
    const gap = 5;
    const spaceBelow = Math.max(0, window.innerHeight - rect.bottom - gap);
    const spaceAbove = Math.max(0, rect.top - gap);
    const opensAbove = spaceBelow < menuHeight && spaceAbove > spaceBelow;
    const availableHeight = opensAbove ? spaceAbove : spaceBelow;
    const renderedHeight = Math.min(menuHeight, Math.max(minHeight, availableHeight || minHeight));
    const next: FloatingMenuPosition = {
      top: opensAbove ? rect.top - gap - renderedHeight : rect.bottom + gap,
      left: rect.left,
      maxHeight: Math.max(minHeight, Math.min(maxHeight, availableHeight || maxHeight)),
    };
    if (matchAnchorWidth) next.width = rect.width;
    return next;
  }, [anchorRef, maxHeight, matchAnchorWidth, minHeight]);

  const applyPosition = useCallback((menuHeight?: number) => {
    const next = calculatePosition(menuHeight);
    if (!next) return;
    setPosition((current) => current
      && current.top === next.top
      && current.left === next.left
      && current.maxHeight === next.maxHeight
      && current.width === next.width
      ? current
      : next);
  }, [calculatePosition]);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    const reposition = () => applyPosition(menuRef.current?.scrollHeight);
    reposition();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [applyPosition, open]);

  useLayoutEffect(() => {
    if (!open || !position || !menuRef.current) return;
    const menu = menuRef.current;
    const updateFromRenderedMenu = () => applyPosition(menu.scrollHeight);
    updateFromRenderedMenu();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(updateFromRenderedMenu);
    observer.observe(menu);
    return () => observer.disconnect();
  }, [applyPosition, children, open, position]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target as Node;
      if (anchorRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      closeRef.current?.();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current?.();
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [anchorRef, open]);

  if (!open || !position) return null;
  return createPortal(<div ref={menuRef} id={id} role={role} aria-label={ariaLabel} aria-multiselectable={ariaMultiselectable} className={`${className} floating-menu`.trim()} style={position}>{children}</div>, document.body);
}
