import { Injectable } from '@nestjs/common';
import { jwtVerify, SignJWT } from 'jose';

const JWT_ISSUER = 'bzs-one';
const JWT_AUDIENCE = 'bzs-one-web';
const MINIMUM_SECRET_LENGTH = 32;

export type SessionTokenClaims = {
  sessionId: string;
  userId: string;
  expiresAt: Date;
};

function signingSecret() {
  const configured = process.env.JWT_SECRET || process.env.SESSION_SECRET;
  if (!configured && process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET ou SESSION_SECRET precisa ser configurado em produção');
  }
  const secret = configured || 'bzs-one-development-jwt-secret-change-me';
  if (secret.length < MINIMUM_SECRET_LENGTH && process.env.NODE_ENV === 'production') {
    throw new Error(`O segredo JWT precisa ter pelo menos ${MINIMUM_SECRET_LENGTH} caracteres`);
  }
  return new TextEncoder().encode(secret);
}

@Injectable()
export class SessionTokenService {
  private readonly secret = signingSecret();

  async issue(input: SessionTokenClaims) {
    const expiration = Math.floor(input.expiresAt.getTime() / 1000);
    return new SignJWT({ sid: input.sessionId, version: 1 })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer(JWT_ISSUER)
      .setAudience(JWT_AUDIENCE)
      .setSubject(input.userId)
      .setIssuedAt()
      .setExpirationTime(expiration)
      .sign(this.secret);
  }

  async verify(token: string): Promise<SessionTokenClaims | null> {
    try {
      const { payload } = await jwtVerify(token, this.secret, {
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
        algorithms: ['HS256'],
        clockTolerance: 5,
      });
      if (
        typeof payload.sid !== 'string'
        || typeof payload.sub !== 'string'
        || typeof payload.exp !== 'number'
        || payload.version !== 1
      ) return null;
      return {
        sessionId: payload.sid,
        userId: payload.sub,
        expiresAt: new Date(payload.exp * 1000),
      };
    } catch {
      return null;
    }
  }
}
