export type ToastTone = 'success' | 'error' | 'info' | 'warning';

export type ToastMessage = {
  id: string;
  tone: ToastTone;
  title: string;
  message: string;
  durationMs: number;
};

type ToastListener = (toast: ToastMessage) => void;

const listeners = new Set<ToastListener>();
const recent = new Map<string, number>();
const pending: ToastMessage[] = [];
let sequence = 0;

const defaultTitles: Record<ToastTone, string> = {
  success: 'Tudo certo',
  error: 'Não foi possível concluir',
  info: 'Informação',
  warning: 'Atenção',
};

function emit(tone: ToastTone, message: string, title = defaultTitles[tone]) {
  const cleanMessage = message.trim();
  if (!cleanMessage) return;
  const key = `${tone}:${title}:${cleanMessage}`;
  const now = Date.now();
  if (now - (recent.get(key) || 0) < 2_000) return;
  recent.set(key, now);
  if (recent.size > 50) {
    for (const [item, createdAt] of recent) {
      if (now - createdAt > 10_000) recent.delete(item);
    }
  }
  const item: ToastMessage = {
    id: `${now}-${sequence++}`,
    tone,
    title,
    message: cleanMessage,
    durationMs: 2_000,
  };
  if (!listeners.size) {
    pending.push(item);
    if (pending.length > 5) pending.shift();
    return;
  }
  for (const listener of listeners) listener(item);
}

export const toast = {
  success: (message: string, title?: string) => emit('success', message, title),
  error: (message: string, title?: string) => emit('error', message, title),
  info: (message: string, title?: string) => emit('info', message, title),
  warning: (message: string, title?: string) => emit('warning', message, title),
};

export function subscribeToToasts(listener: ToastListener) {
  listeners.add(listener);
  if (pending.length) {
    const queued = pending.splice(0);
    for (const item of queued) listener(item);
  }
  return () => {
    listeners.delete(listener);
  };
}
