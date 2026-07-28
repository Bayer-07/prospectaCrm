import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { LoaderCircle, X } from 'lucide-react';

export function Button({ children, variant = 'primary', loading, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; loading?: boolean }) {
  return <button className={`button button-${variant}`} {...props} disabled={props.disabled || loading}>{loading && <LoaderCircle size={15} className="spin" />}{children}</button>;
}

export function Field({ label, hint, error, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string }) {
  return <label className={`field ${error ? 'field-invalid' : ''}`}><span>{label}</span><input {...props} aria-invalid={error ? true : props['aria-invalid']} />{error ? <small className="field-error">{error}</small> : hint && <small>{hint}</small>}</label>;
}

export function SelectField({ label, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span><select {...props}>{children}</select></label>;
}

export function Modal({ title, children, onClose, width = 560 }: { title: string; children: ReactNode; onClose(): void; width?: number }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="modal" style={{ maxWidth: width }} role="dialog" aria-modal="true" aria-label={title}>
      <header><div><span className="eyebrow">BZS One</span><h2>{title}</h2></div><button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={18} /></button></header>
      {children}
    </section>
  </div>;
}

export function Empty({ icon, title, description, action }: { icon: ReactNode; title: string; description: string; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-icon">{icon}</div><h3>{title}</h3><p>{description}</p>{action}</div>;
}

export function Status({ value }: { value: string }) {
  const key = value.toLowerCase();
  const labels: Record<string, string> = { active: 'Ativo', inactive: 'Inativo', invited: 'Convidado', connected: 'Conectado', disconnected: 'Desconectado', connecting: 'Conectando', draft: 'Rascunho', scheduled: 'Agendada', running: 'Em execução', paused: 'Pausada', completed: 'Concluída', failed: 'Falhou', granted: 'Consentido', unknown: 'Não informado', revoked: 'Revogado', open: 'Aberto', closed: 'Encerrado', published: 'Publicada', archived: 'Arquivada' };
  return <span className={`status status-${key}`}>{labels[key] || value}</span>;
}

export function PageLoading() { return <div className="page-loading"><LoaderCircle className="spin" /><span>Carregando informações…</span></div>; }
