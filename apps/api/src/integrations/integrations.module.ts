import { Module } from '@nestjs/common';
import { CrmModule } from '../crm/crm.module.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { EvolutionWebhookController, IntegrationsController } from './integrations.controller.js';
import { EvolutionService } from './evolution.service.js';

@Module({ imports: [CrmModule, RealtimeModule], controllers: [IntegrationsController, EvolutionWebhookController], providers: [EvolutionService], exports: [EvolutionService] })
export class IntegrationsModule {}
