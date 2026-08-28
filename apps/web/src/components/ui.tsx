import { useEffect, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { LoaderCircle, X } from 'lucide-react';

export function Button({ children, variant = 'primary', loading, type = 'button', ...props }: Readonly<ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; loading?: boolean }>) {
  return <button type={type} className={`button button-${variant}`} {...props} disabled={props.disabled || loading}>{loading && <LoaderCircle size={15} className="spin" />}{children}</button>;
}

export function Field({ label, hint, error, ...props }: Readonly<InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string }>) {
  return <label className={`field ${error ? 'field-invalid' : ''}`}><span>{label}</span><input {...props} aria-invalid={error ? true : props['aria-invalid']} />{error ? <small className="field-error">{error}</small> : hint && <small>{hint}</small>}</label>;
}

export function SelectField({ label, children, ...props }: Readonly<React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; children: ReactNode }>) {
  return <label className="field"><span>{label}</span><select {...props}>{children}</select></label>;
}

export function Modal({ title, children, onClose, width = 560 }: Readonly<{ title: string; children: ReactNode; onClose(): void; width?: number }>) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const focusTarget = dialog?.querySelector<HTMLElement>('[autofocus], input, select, textarea, button, a[href]');
    window.requestAnimationFrame(() => focusTarget?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
        .filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true');
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [onClose]);
  return <div className="modal-backdrop">
    <button type="button" className="modal-backdrop-dismiss" onMouseDown={onClose} aria-label={`Fechar ${title}`} />
    <dialog ref={dialogRef} open className="modal" style={{ maxWidth: width }} aria-label={title} tabIndex={-1}>
      <header><div><span className="eyebrow">BZS One</span><h2>{title}</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Fechar"><X size={18} /></button></header>
      {children}
    </dialog>
  </div>;
}

export function Empty({ icon, title, description, action }: Readonly<{ icon: ReactNode; title: string; description: string; action?: ReactNode }>) {
  return <div className="empty-state"><div className="empty-icon">{icon}</div><h3>{title}</h3><p>{description}</p>{action}</div>;
}

export function Status({ value }: Readonly<{ value: string }>) {
  const key = value.toLowerCase();
  const labels: Record<string, string> = { active: 'Ativo', inactive: 'Inativo', invited: 'Convidado', connected: 'Conectado', disconnected: 'Desconectado', connecting: 'Conectando', draft: 'Rascunho', scheduled: 'Agendada', running: 'Em execução', paused: 'Pausada', completed: 'Concluída', failed: 'Falhou', granted: 'Consentido', unknown: 'Não informado', revoked: 'Revogado', open: 'Aberto', closed: 'Encerrado', published: 'Publicada', archived: 'Arquivada' };
  return <span className={`status status-${key}`}>{labels[key] || value}</span>;
}

export function PageLoading() { return <div className="page-loading"><LoaderCircle className="spin" /><span>Carregando informações…</span></div>; }
