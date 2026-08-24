import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { TeamsController } from './teams.controller.js';
import { TeamsService } from './teams.service.js';

@Module({ imports: [AuthModule, RealtimeModule], controllers: [TeamsController], providers: [TeamsService] })
export class TeamsModule {}
