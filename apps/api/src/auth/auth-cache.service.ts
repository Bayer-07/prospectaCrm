import { Injectable } from '@nestjs/common';
import type { AuthContext } from './types.js';

export type CachedSessionAuth = {
  sessionId: string;
  userId: string;
  roleId: string;
  csrfHash: string;
  expiresAt: Date;
  lastSeenAt: Date;
  auth: AuthContext;
};

export type CachedApiKeyAuth = {
  apiKeyId: string;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  auth: AuthContext;
};

type CacheEntry<T> = { value: T; expiresAt: number };

const configuredTtl = Number(process.env.AUTH_CACHE_TTL_MS || 5_000);
const CACHE_TTL_MS = Number.isFinite(configuredTtl)
  ? Math.min(Math.max(configuredTtl, 1_000), 30_000)
  : 5_000;
const MAX_CACHE_ENTRIES = 2_000;

/**
 * A very short, explicitly invalidated cache for the authentication records
 * shared by the many parallel requests made by the inbox. The database stays
 * the source of truth; entries never outlive either the TTL or the session.
 */
@Injectable()
export class AuthCacheService {
  private readonly sessions = new Map<string, CacheEntry<CachedSessionAuth>>();
  private readonly apiKeys = new Map<string, CacheEntry<CachedApiKeyAuth>>();

  getSession(tokenHash: string, now = Date.now()) {
    const entry = this.sessions.get(tokenHash);
    if (!entry) return undefined;
    if (entry.expiresAt <= now || entry.value.expiresAt.getTime() <= now) {
      this.sessions.delete(tokenHash);
      return undefined;
    }
    return entry.value;
  }

  setSession(tokenHash: string, value: CachedSessionAuth, now = Date.now()) {
    this.ensureCapacity(this.sessions);
    this.sessions.set(tokenHash, {
      value,
      expiresAt: Math.min(now + CACHE_TTL_MS, value.expiresAt.getTime()),
    });
  }

  touchSession(tokenHash: string, lastSeenAt: Date) {
    const entry = this.sessions.get(tokenHash);
    if (entry) entry.value.lastSeenAt = lastSeenAt;
  }

  invalidateSession(tokenHash: string) {
    this.sessions.delete(tokenHash);
  }

  invalidateUser(userId: string) {
    for (const [key, entry] of this.sessions) {
      if (entry.value.userId === userId) this.sessions.delete(key);
    }
  }

  invalidateRole(roleId: string) {
    for (const [key, entry] of this.sessions) {
      if (entry.value.roleId === roleId) this.sessions.delete(key);
    }
  }

  getApiKey(keyHash: string, now = Date.now()) {
    const entry = this.apiKeys.get(keyHash);
    if (!entry) return undefined;
    if (entry.expiresAt <= now || (entry.value.expiresAt && entry.value.expiresAt.getTime() <= now)) {
      this.apiKeys.delete(keyHash);
      return undefined;
    }
    return entry.value;
  }

  setApiKey(keyHash: string, value: CachedApiKeyAuth, now = Date.now()) {
    this.ensureCapacity(this.apiKeys);
    this.apiKeys.set(keyHash, { value, expiresAt: now + CACHE_TTL_MS });
  }

  touchApiKey(keyHash: string, lastUsedAt: Date) {
    const entry = this.apiKeys.get(keyHash);
    if (entry) entry.value.lastUsedAt = lastUsedAt;
  }

  invalidateApiKey(keyHash: string) {
    this.apiKeys.delete(keyHash);
  }

  private ensureCapacity<T>(cache: Map<string, CacheEntry<T>>) {
    if (cache.size < MAX_CACHE_ENTRIES) return;
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
}
