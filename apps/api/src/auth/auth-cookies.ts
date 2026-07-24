import type { CookieOptions, Response } from 'express';

export const SESSION_COOKIE = 'prospecta_session';
export const CSRF_COOKIE = 'prospecta_csrf';

function secureCookies() {
  return process.env.COOKIE_SECURE
    ? process.env.COOKIE_SECURE === 'true'
    : process.env.NODE_ENV === 'production';
}

export function authCookieOptions(expiresAt?: Date): CookieOptions {
  return {
    secure: secureCookies(),
    sameSite: 'lax',
    path: '/',
    ...(expiresAt ? { expires: expiresAt } : {}),
  };
}

export function clearAuthCookies(response: Response) {
  const options = authCookieOptions();
  response.clearCookie(SESSION_COOKIE, { ...options, httpOnly: true });
  response.clearCookie(CSRF_COOKIE, { ...options, httpOnly: false });
}
