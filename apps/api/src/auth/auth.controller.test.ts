import { describe, expect, it, vi } from 'vitest';
import { AuthController } from './auth.controller.js';

describe('AuthController', () => {
  it('mantém o JWT HttpOnly e compartilha apenas o token CSRF entre abas', async () => {
    const expiresAt = new Date(Date.now() + 60_000);
    const login = vi.fn().mockResolvedValue({
      token: 'header.payload.signature',
      csrfToken: 'csrf-token',
      expiresAt,
    });
    const cookie = vi.fn();
    const controller = new AuthController({ login } as never);

    const result = await controller.login(
      { email: 'usuario@empresa.com', password: 'senha-segura' },
      { ip: '127.0.0.1', headers: { 'user-agent': 'Vitest' } } as never,
      { cookie } as never,
    );

    expect(cookie).toHaveBeenCalledWith('prospecta_session', 'header.payload.signature', expect.objectContaining({
      httpOnly: true,
      sameSite: 'lax',
      expires: expiresAt,
    }));
    expect(cookie).toHaveBeenCalledWith('prospecta_csrf', 'csrf-token', expect.objectContaining({
      httpOnly: false,
      sameSite: 'lax',
      expires: expiresAt,
    }));
    expect(result).toEqual({ data: { tokenType: 'Bearer', expiresAt } });
    expect(JSON.stringify(result)).not.toContain('header.payload.signature');
    expect(JSON.stringify(result)).not.toContain('csrf-token');
  });

  it('responde de forma neutra à solicitação de recuperação', async () => {
    const requestPasswordReset = vi.fn().mockResolvedValue({ accepted: true });
    const controller = new AuthController({ requestPasswordReset } as never);

    const result = await controller.forgotPassword(
      { email: 'usuario@empresa.com' },
      { ip: '127.0.0.1', headers: { 'user-agent': 'Vitest' } } as never,
    );

    expect(requestPasswordReset).toHaveBeenCalledWith('usuario@empresa.com', {
      ip: '127.0.0.1',
      userAgent: 'Vitest',
    });
    expect(result.data.accepted).toBe(true);
    expect(result.data.message).not.toContain('cadastrado com sucesso');
  });
});
