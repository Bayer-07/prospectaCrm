import { Module } from '@nestjs/common';
import { ActivitiesModule } from '../activities/activities.module.js';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';
import { OutboundWebhookUrlService } from './outbound-webhook-url.service.js';

@Module({ imports: [ActivitiesModule], controllers: [ReportsController], providers: [ReportsService, OutboundWebhookUrlService] })
export class ReportsModule {}
