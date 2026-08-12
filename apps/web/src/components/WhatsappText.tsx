import { forwardRef, memo, useImperativeHandle, useLayoutEffect, useRef, type ClipboardEvent, type KeyboardEvent, type ReactNode } from 'react';

export type WhatsappToken = {
  type: 'text' | 'bold' | 'italic' | 'strike' | 'code';
  value: string;
  marker?: string;
};

export type WhatsappLinkPart = {
  type: 'text' | 'link';
  value: string;
  href?: string;
};

const linkPattern = /https?:\/\/[^\s<>]+|www\.[^\s<>]+/gi;
const trailingLinkPunctuation = new Set(['.', ',', '!', '?', ';', ':', ')', '}', ']', '"', "'", '\u2019', '\u201d']);
const markers = { bold: '*', italic: '_', strike: '~', code: '```' } as const;

type FormattedTokenType = Exclude<WhatsappToken['type'], 'text'>;
type FormatDefinition = { type: FormattedTokenType; marker: string; multiline: boolean };
type FormatMatch = { index: number; end: number; type: FormattedTokenType; marker: string; value: string };

const formatDefinitions: readonly FormatDefinition[] = [
  { type: 'code', marker: '```', multiline: true },
  { type: 'code', marker: '`', multiline: false },
  { type: 'bold', marker: '*', multiline: false },
  { type: 'italic', marker: '_', multiline: false },
  { type: 'strike', marker: '~', multiline: false },
];

function splitTrailingLinkPunctuation(raw: string) {
  let punctuationStart = raw.length;
  while (punctuationStart > 0 && trailingLinkPunctuation.has(raw[punctuationStart - 1])) punctuationStart -= 1;
  return { value: raw.slice(0, punctuationStart), trailing: raw.slice(punctuationStart) };
}

function findFormatForDefinition(text: string, cursor: number, definition: FormatDefinition): FormatMatch | null {
  let index = text.indexOf(definition.marker, cursor);
  while (index >= 0) {
    const valueStart = index + definition.marker.length;
    const end = text.indexOf(definition.marker, valueStart);
    if (end < 0) return null;
    const value = text.slice(valueStart, end);
    if (value && (definition.multiline || !value.includes('\n'))) {
      return { index, end: end + definition.marker.length, type: definition.type, marker: definition.marker, value };
    }
    index = text.indexOf(definition.marker, valueStart);
  }
  return null;
}

function findNextFormat(text: string, cursor: number): FormatMatch | null {
  let earliest: FormatMatch | null = null;
  for (const definition of formatDefinitions) {
    const candidate = findFormatForDefinition(text, cursor, definition);
    if (candidate && (!earliest || candidate.index < earliest.index)) earliest = candidate;
  }
  return earliest;
}

export function tokenizeWhatsappText(text: string): WhatsappToken[] {
  const tokens: WhatsappToken[] = [];
  let cursor = 0;
  let match = findNextFormat(text, cursor);
  while (match) {
    if (match.index > cursor) tokens.push({ type: 'text', value: text.slice(cursor, match.index) });
    if (match.value.trim() !== match.value) {
      tokens.push({ type: 'text', value: text.slice(match.index, match.end) });
    } else {
      tokens.push({ type: match.type, value: match.value, marker: match.marker });
    }
    cursor = match.end;
    match = findNextFormat(text, cursor);
  }
  if (cursor < text.length) tokens.push({ type: 'text', value: text.slice(cursor) });
  return tokens;
}

export function linkifyWhatsappText(text: string): WhatsappLinkPart[] {
  const parts: WhatsappLinkPart[] = [];
  let cursor = 0;
  for (const match of text.matchAll(linkPattern)) {
    const index = match.index ?? 0;
    if (index > cursor) parts.push({ type: 'text', value: text.slice(cursor, index) });
    const raw = match[0];
    const { value, trailing } = splitTrailingLinkPunctuation(raw);
    if (value) parts.push({ type: 'link', value, href: value.toLocaleLowerCase('pt-BR').startsWith('www.') ? `https://${value}` : value });
    if (trailing) parts.push({ type: 'text', value: trailing });
    cursor = index + raw.length;
  }
  if (cursor < text.length) parts.push({ type: 'text', value: text.slice(cursor) });
  return parts.length ? parts : [{ type: 'text', value: text }];
}

export function firstWhatsappLink(text: string) {
  for (const token of tokenizeWhatsappText(text)) {
    if (token.type === 'code') continue;
    const link = linkifyWhatsappText(token.value).find((part) => part.type === 'link');
    if (link?.href) return link.href;
  }
  return undefined;
}

function renderLinkedText(text: string, keyPrefix: string): ReactNode[] {
  return linkifyWhatsappText(text).map((part, index) => part.type === 'link'
    ? <a key={`${keyPrefix}-link-${index}`} className="whatsapp-link" href={part.href} target="_blank" rel="noopener noreferrer">{part.value}</a>
    : part.value);
}

function renderTokens(text: string, showMarkers: boolean): ReactNode[] {
  const rendered: ReactNode[] = [];
  tokenizeWhatsappText(text).forEach((token, index) => {
    if (token.type === 'text') {
      rendered.push(...renderLinkedText(token.value, `text-${index}`));
      return;
    }
    const marker = token.marker || markers[token.type];
    const content = token.type === 'code' ? token.value : renderTokens(token.value, showMarkers);
    const formatted = renderFormattedToken(token.type, content);
    rendered.push(<span key={`${token.type}-${index}`} className={`whatsapp-format whatsapp-format-${token.type}`}>
      {showMarkers && <span className="whatsapp-marker">{marker}</span>}
      {formatted}
      {showMarkers && <span className="whatsapp-marker">{marker}</span>}
    </span>);
  });
  return rendered;
}

function renderFormattedToken(type: FormattedTokenType, content: ReactNode) {
  if (type === 'bold') return <strong>{content}</strong>;
  if (type === 'italic') return <em>{content}</em>;
  if (type === 'strike') return <del>{content}</del>;
  return <code>{content}</code>;
}

export const WhatsappText = memo(function WhatsappText({ text, showMarkers = false }: Readonly<{ text: string; showMarkers?: boolean }>) {
  return <>{renderTokens(text, showMarkers)}</>;
});

export type WhatsappComposerHandle = {
  focus(): void;
  moveCaretToEnd(): void;
  insertText(text: string): void;
};

function selectionOffsets(root: HTMLElement) {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  const startRange = range.cloneRange();
  startRange.selectNodeContents(root);
  startRange.setEnd(range.startContainer, range.startOffset);
  const endRange = range.cloneRange();
  endRange.selectNodeContents(root);
  endRange.setEnd(range.endContainer, range.endOffset);
  return { start: startRange.toString().length, end: endRange.toString().length };
}

function placeCaret(root: HTMLElement, requestedOffset: number) {
  const selection = window.getSelection();
  if (!selection) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  let remaining = Math.max(0, requestedOffset);
  while (node) {
    const length = node.textContent?.length ?? 0;
    if (remaining <= length) {
      const range = document.createRange();
      range.setStart(node, remaining);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }
    remaining -= length;
    node = walker.nextNode();
  }
  const range = document.createRange();
  range.selectNodeContents(root);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function appendComposerText(target: Node, text: string) {
  for (const token of tokenizeWhatsappText(text)) {
    if (token.type === 'text') {
      target.appendChild(document.createTextNode(token.value));
      continue;
    }
    const wrapper = document.createElement('span');
    wrapper.className = `whatsapp-format whatsapp-format-${token.type}`;
    const marker = token.marker || markers[token.type];
    const openingMarker = document.createElement('span');
    openingMarker.className = 'whatsapp-marker';
    openingMarker.textContent = marker;
    wrapper.appendChild(openingMarker);
    const elementByType: Record<FormattedTokenType, keyof HTMLElementTagNameMap> = {
      bold: 'strong',
      italic: 'em',
      strike: 'del',
      code: 'code',
    };
    const formatted = document.createElement(elementByType[token.type]);
    if (token.type === 'code') formatted.textContent = token.value;
    else appendComposerText(formatted, token.value);
    wrapper.appendChild(formatted);
    const closingMarker = openingMarker.cloneNode(true);
    wrapper.appendChild(closingMarker);
    target.appendChild(wrapper);
  }
}

function renderComposerText(root: HTMLElement, text: string) {
  const fragment = document.createDocumentFragment();
  appendComposerText(fragment, text);
  root.replaceChildren(fragment);
}

export const WhatsappComposer = forwardRef<WhatsappComposerHandle, Readonly<{
  value: string;
  disabled?: boolean;
  placeholder: string;
  onChange(value: string): void;
  onPaste(event: ClipboardEvent<HTMLDivElement>): void;
  onKeyDown?(event: KeyboardEvent<HTMLDivElement>): boolean;
  onSubmit(): void;
}>>(function WhatsappComposer({ value, disabled = false, placeholder, onChange, onPaste, onKeyDown, onSubmit }, forwardedRef) {
  const rootRef = useRef<HTMLDivElement>(null);
  const pendingCaretRef = useRef<number | null>(null);
  const lastSelectionRef = useRef<{ start: number; end: number } | null>(null);

  const replaceSelection = (replacement: string) => {
    const root = rootRef.current;
    const offsets = (root ? selectionOffsets(root) : null) || lastSelectionRef.current;
    const start = offsets?.start ?? value.length;
    const end = offsets?.end ?? start;
    const caret = start + replacement.length;
    pendingCaretRef.current = caret;
    lastSelectionRef.current = { start: caret, end: caret };
    onChange(`${value.slice(0, start)}${replacement}${value.slice(end)}`);
  };

  useImperativeHandle(forwardedRef, () => ({
    focus: () => rootRef.current?.focus(),
    moveCaretToEnd: () => {
      const root = rootRef.current;
      if (!root) return;
      root.focus();
      const end = root.textContent?.length ?? 0;
      lastSelectionRef.current = { start: end, end };
      placeCaret(root, end);
    },
    insertText: replaceSelection,
  }), [value, onChange]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    renderComposerText(root, value);
    if (pendingCaretRef.current !== null) {
      const caret = pendingCaretRef.current;
      placeCaret(root, caret);
      lastSelectionRef.current = { start: caret, end: caret };
    } else {
      lastSelectionRef.current = { start: value.length, end: value.length };
    }
    pendingCaretRef.current = null;
  }, [value]);

  const rememberSelection = () => {
    const root = rootRef.current;
    const offsets = root ? selectionOffsets(root) : null;
    if (offsets) lastSelectionRef.current = offsets;
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (onKeyDown?.(event)) {
      event.preventDefault();
      return;
    }
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (event.shiftKey) replaceSelection('\n');
    else onSubmit();
  };

  return <div
    ref={rootRef}
    className="whatsapp-composer"
    contentEditable={!disabled}
    suppressContentEditableWarning
    role="textbox"
    aria-multiline="true"
    aria-label="Mensagem"
    aria-disabled={disabled}
    data-placeholder={placeholder}
    tabIndex={disabled ? -1 : 0}
    onInput={(event) => {
      const root = event.currentTarget;
      const offsets = selectionOffsets(root);
      pendingCaretRef.current = offsets?.start ?? null;
      if (offsets) lastSelectionRef.current = offsets;
      onChange(root.textContent ?? '');
    }}
    onKeyUp={rememberSelection}
    onMouseUp={rememberSelection}
    onKeyDown={handleKeyDown}
    onPaste={(event) => {
      onPaste(event);
      if (event.defaultPrevented) return;
      const pastedText = event.clipboardData.getData('text/plain').replaceAll('\r\n', '\n');
      if (!pastedText) return;
      event.preventDefault();
      replaceSelection(pastedText);
    }}
  />;
});
