import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { OAuthProvider, OAuthProtocolError } from './oauth.js';

describe('OAuthProvider', () => {
  it('publica discovery compatível com OAuth 2.1, DCR e PKCE', () => {
    const provider = new OAuthProvider({
      publicUrl: 'https://bzsone.example.com',
      secret: 'oauth-test-secret-with-more-than-thirty-two-characters',
    });

    expect(provider.protectedResourceMetadata()).toMatchObject({
      resource: 'https://bzsone.example.com',
      authorization_servers: ['https://bzsone.example.com'],
      scopes_supported: ['bzs'],
    });
    expect(provider.authorizationServerMetadata()).toMatchObject({
      issuer: 'https://bzsone.example.com',
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code'],
      token_endpoint_auth_methods_supported: ['none'],
      code_challenge_methods_supported: ['S256'],
      registration_endpoint: 'https://bzsone.example.com/oauth/register',
    });
  });

  it('registra cliente, troca código com PKCE e valida o token emitido', async () => {
    const provider = new OAuthProvider({
      publicUrl: 'https://bzsone.example.com',
      secret: 'oauth-test-secret-with-more-than-thirty-two-characters',
      accessTokenTtlSeconds: 3_600,
    });
    const redirectUri = 'https://chatgpt.com/oauth/callback';
    const client = provider.registerClient({
      client_name: 'ChatGPT',
      redirect_uris: [redirectUri],
    });
    const verifier = 'a'.repeat(64);
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const request = provider.validateAuthorizationRequest(new URLSearchParams({
      client_id: client.client_id,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'bzs',
      state: 'state-123',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      resource: 'https://bzsone.example.com',
    }));
    const code = provider.createAuthorizationCode(request, {
      sessionToken: 'session-token-for-test',
      subject: 'user-123',
    });

    const token = await provider.exchangeAuthorizationCode({
      code,
      clientId: client.client_id,
      redirectUri,
      codeVerifier: verifier,
      resource: 'https://bzsone.example.com',
    });
    expect(token.token_type).toBe('Bearer');
    expect(token.expires_in).toBe(3_600);
    await expect(provider.verifyAccessToken(token.access_token)).resolves.toMatchObject({
      sessionToken: 'session-token-for-test',
      subject: 'user-123',
      scope: 'bzs',
    });
    await expect(provider.exchangeAuthorizationCode({
      code,
      clientId: client.client_id,
      redirectUri,
      codeVerifier: verifier,
    })).rejects.toMatchObject({ code: 'invalid_grant' });
  });

  it('rejeita cliente não registrado e code_verifier incorreto', async () => {
    const provider = new OAuthProvider({
      publicUrl: 'https://bzsone.example.com',
      secret: 'oauth-test-secret-with-more-than-thirty-two-characters',
    });
    expect(() => provider.validateAuthorizationRequest(new URLSearchParams({
      client_id: 'unknown',
      redirect_uri: 'https://chatgpt.com/oauth/callback',
      response_type: 'code',
      code_challenge: 'challenge',
      code_challenge_method: 'S256',
    }))).toThrowError(OAuthProtocolError);
  });
});
