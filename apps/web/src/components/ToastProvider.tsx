import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { subscribeToToasts, type ToastMessage } from '../lib/toast';

const icons = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
  warning: AlertTriangle,
};

export function ToastProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [items, setItems] = useState<ToastMessage[]>([]);
  const remove = useCallback((id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  useEffect(() => subscribeToToasts((item) => {
    setItems((current) => [...current.slice(-4), item]);
  }), []);

  return <>
    {children}
    <div className="toast-viewport" aria-live="polite" aria-atomic="false">
      {items.map((item) => <ToastItem key={item.id} item={item} onClose={remove} />)}
    </div>
  </>;
}

function ToastItem({ item, onClose }: Readonly<{ item: ToastMessage; onClose(id: string): void }>) {
  const Icon = icons[item.tone];
  const content = <>
    <span className="toast-icon"><Icon size={20} /></span>
    <div className="toast-copy"><strong>{item.title}</strong><p>{item.message}</p></div>
    <button type="button" onClick={() => onClose(item.id)} aria-label="Fechar notificação"><X size={16} /></button>
    <span className="toast-progress"><i className="toast-progress-bar" onAnimationEnd={() => onClose(item.id)} /></span>
  </>;
  const props = {
    className: `toast-item toast-${item.tone}`,
    style: { '--toast-duration': `${item.durationMs}ms` } as React.CSSProperties,
  };

  if (item.tone === 'error' || item.tone === 'warning') {
    return <article {...props} role="alert">{content}</article>;
  }
  return <output {...props}>{content}</output>;
}
