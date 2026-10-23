import { Module } from '@nestjs/common';
import { CrmModule } from '../crm/crm.module.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { EvolutionWebhookController, IntegrationsController } from './integrations.controller.js';
import { EvolutionService } from './evolution.service.js';
import { TranscriptionsService } from './transcriptions.service.js';
import { FollowUpsModule } from '../follow-ups/follow-ups.module.js';
import { PublicMessagesController } from './public-messages.controller.js';
import { PublicMessagesService } from './public-messages.service.js';

@Module({
  imports: [CrmModule, RealtimeModule, FollowUpsModule],
  controllers: [IntegrationsController, EvolutionWebhookController, PublicMessagesController],
  providers: [EvolutionService, TranscriptionsService, PublicMessagesService],
  exports: [EvolutionService],
})
export class IntegrationsModule {}
