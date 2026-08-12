export type BrowserAuthEvent = {
  type: 'login' | 'logout' | 'expired';
  at: number;
  nonce: string;
};

export const AUTH_EVENT_STORAGE_KEY = 'bzs_one_auth_event';
const PUBLIC_AUTH_PATHS = new Set(['/login', '/recuperar-senha', '/aceitar-convite', '/redefinir-senha']);
let redirectingToLogin = false;

function browserAvailable() {
  return typeof window !== 'undefined';
}

export function readCookie(name: string) {
  if (typeof document === 'undefined') return '';
  const prefix = `${encodeURIComponent(name)}=`;
  const cookie = document.cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(prefix));
  if (!cookie) return '';
  try {
    return decodeURIComponent(cookie.slice(prefix.length));
  } catch {
    return '';
  }
}

export function csrfToken() {
  return readCookie('prospecta_csrf');
}

export function publishAuthEvent(type: BrowserAuthEvent['type']) {
  if (!browserAvailable()) return;
  if (type === 'login') redirectingToLogin = false;
  const event: BrowserAuthEvent = {
    type,
    at: Date.now(),
    nonce: globalThis.crypto.randomUUID(),
  };
  window.localStorage.setItem(AUTH_EVENT_STORAGE_KEY, JSON.stringify(event));
}

export function parseAuthEvent(value: string | null): BrowserAuthEvent | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<BrowserAuthEvent>;
    if (
      !['login', 'logout', 'expired'].includes(String(parsed.type))
      || typeof parsed.at !== 'number'
      || typeof parsed.nonce !== 'string'
    ) return null;
    return parsed as BrowserAuthEvent;
  } catch {
    return null;
  }
}

export function subscribeToAuthEvents(listener: (event: BrowserAuthEvent) => void) {
  if (!browserAvailable()) return () => undefined;
  const onStorage = (event: StorageEvent) => {
    if (event.key !== AUTH_EVENT_STORAGE_KEY) return;
    const authEvent = parseAuthEvent(event.newValue);
    if (authEvent) listener(authEvent);
  };
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}

export function redirectToLogin(reason: 'logout' | 'expired' = 'expired') {
  if (!browserAvailable() || redirectingToLogin) return;
  window.sessionStorage.removeItem('prospecta_csrf');
  redirectingToLogin = true;
  const suffix = reason === 'expired' ? '?reason=expired' : '';
  window.location.replace(`/login${suffix}`);
}

export function handleUnauthorizedResponse() {
  if (!browserAvailable()) return;
  if (PUBLIC_AUTH_PATHS.has(window.location.pathname)) {
    window.sessionStorage.removeItem('prospecta_csrf');
    return;
  }
  if (redirectingToLogin) return;
  publishAuthEvent('expired');
  redirectToLogin('expired');
}
