import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { MediaModule } from '../media/media.module.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({ imports: [AuthModule, RealtimeModule, MediaModule], controllers: [UsersController], providers: [UsersService] })
export class UsersModule {}
