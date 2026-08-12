import { csrfToken, handleUnauthorizedResponse } from './auth-session';
import { toast } from './toast';

const API_URL = import.meta.env.VITE_API_URL || '/api/v1';

export const apiUrl = (path: string) => `${API_URL}${path}`;

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly details?: unknown) { super(message); }
}

function providerErrorDetail(details: unknown) {
  if (!details || typeof details !== 'object') return '';
  const body = details as Record<string, any>;
  const provider = body.details;
  const detail = provider?.response?.message ?? provider?.message ?? provider?.error;
  if (Array.isArray(detail)) return detail.filter((item) => typeof item === 'string').join('; ');
  return typeof detail === 'string' ? detail : '';
}

export function apiErrorMessage(error: unknown, fallback = 'Não foi possível concluir a operação') {
  if (!(error instanceof Error)) return fallback;
  if (!(error instanceof ApiError)) return error.message || fallback;
  const detail = providerErrorDetail(error.details);
  if (!detail || detail === error.message) return error.message || fallback;
  return `${error.message}: ${detail}`;
}

const publicAuthenticationRequests = new Set([
  '/auth/login',
  '/auth/forgot-password',
  '/auth/accept-invite',
  '/auth/reset-password',
]);

export async function apiFetch(path: string, init: RequestInit = {}) {
  const csrf = csrfToken();
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
        ...init.headers,
      },
    });
  } catch (error) {
    toast.error('Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.');
    throw error;
  }
  if (response.status === 401 && !publicAuthenticationRequests.has(path)) {
    handleUnauthorizedResponse();
  }
  return response;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await apiFetch(path, init);
  const text = await response.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) {
    const error = new ApiError(body?.message || body?.error || 'Não foi possível concluir a operação', response.status, body);
    if (response.status !== 401 || publicAuthenticationRequests.has(path)) {
      toast.error(apiErrorMessage(error));
    }
    throw error;
  }
  return body as T;
}

const moneyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

export const money = (cents = 0) => moneyFormatter.format(cents / 100);
export const dateTime = (value?: string | Date | null) => value ? dateTimeFormatter.format(new Date(value)) : '—';
export const initials = (name = '') => name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
export const formatPhone = (value?: string | null) => {
  if (!value) return '';
  const digits = value.replace(/\D/g, '');
  if (value.trim().startsWith('+') && !digits.startsWith('55')) return value;
  const national = digits.startsWith('55') && (digits.length === 12 || digits.length === 13) ? digits.slice(2) : digits;
  if (national.length === 11) return `(${national.slice(0, 2)}) ${national.slice(2, 7)}-${national.slice(7)}`;
  if (national.length === 10) return `(${national.slice(0, 2)}) ${national.slice(2, 6)}-${national.slice(6)}`;
  return value;
};

export type Envelope<T> = { data: T; meta?: { nextCursor?: string | null; count?: number } };
