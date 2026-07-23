import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AuthCacheService } from './auth-cache.service.js';

@Module({ controllers: [AuthController], providers: [AuthService, AuthCacheService], exports: [AuthService, AuthCacheService] })
export class AuthModule {}
