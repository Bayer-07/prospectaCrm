import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { subscribeToToasts, type ToastMessage } from '../lib/toast';

const icons = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
  warning: AlertTriangle,
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
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

function ToastItem({ item, onClose }: { item: ToastMessage; onClose(id: string): void }) {
  const Icon = icons[item.tone];

  return <article
    className={`toast-item toast-${item.tone}`}
    role={item.tone === 'error' || item.tone === 'warning' ? 'alert' : 'status'}
    style={{ '--toast-duration': `${item.durationMs}ms` } as React.CSSProperties}
  >
    <span className="toast-icon"><Icon size={20} /></span>
    <div className="toast-copy"><strong>{item.title}</strong><p>{item.message}</p></div>
    <button type="button" onClick={() => onClose(item.id)} aria-label="Fechar notificação"><X size={16} /></button>
    <span className="toast-progress"><i className="toast-progress-bar" onAnimationEnd={() => onClose(item.id)} /></span>
  </article>;
}
