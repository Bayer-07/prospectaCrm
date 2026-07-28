import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { CurrentUser } from './current-user.decorator.js';
import { Public } from './public.decorator.js';
import { AuthService } from './auth.service.js';
import type { AuthContext } from './types.js';
import {
  authCookieOptions,
  clearAuthCookies,
  CSRF_COOKIE,
  SESSION_COOKIE,
} from './auth-cookies.js';

@ApiTags('Autenticação')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  async login(@Body() body: { email: string; password: string }, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const session = await this.auth.login(body.email, body.password, { ip: req.ip, userAgent: req.headers['user-agent'] });
    const cookieOptions = authCookieOptions(session.expiresAt);
    res.cookie(SESSION_COOKIE, session.token, { ...cookieOptions, httpOnly: true });
    res.cookie(CSRF_COOKIE, session.csrfToken, { ...cookieOptions, httpOnly: false });
    return { data: { tokenType: 'Bearer', expiresAt: session.expiresAt } };
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[SESSION_COOKIE]);
    clearAuthCookies(res);
    return { data: { success: true } };
  }

  @Public()
  @Post('accept-invite')
  async acceptInvite(@Body() body: { token: string; password: string; name?: string }) {
    await this.auth.acceptInvite(body.token, body.password, body.name);
    return { data: { success: true } };
  }

  @Public()
  @Post('forgot-password')
  async forgotPassword(@Body() body: { email: string }, @Req() req: Request) {
    await this.auth.requestPasswordReset(body.email, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return {
      data: {
        accepted: true,
        message: 'Se o e-mail estiver cadastrado, você receberá as instruções para redefinir sua senha.',
      },
    };
  }

  @Public()
  @Post('reset-password')
  async resetPassword(@Body() body: { token: string; password: string }) {
    await this.auth.resetPassword(body.token, body.password);
    return { data: { success: true } };
  }

  @Get('me')
  me(@CurrentUser() auth: AuthContext) {
    return { data: auth };
  }
}
