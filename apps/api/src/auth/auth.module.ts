import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AuthCacheService } from './auth-cache.service.js';
import { SessionTokenService } from './session-token.service.js';

@Module({
  controllers: [AuthController],
  providers: [AuthService, AuthCacheService, SessionTokenService],
  exports: [AuthService, AuthCacheService, SessionTokenService],
})
export class AuthModule {}
