import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';
import { OutboundWebhookUrlService } from './outbound-webhook-url.service.js';

@Module({ controllers: [ReportsController], providers: [ReportsService, OutboundWebhookUrlService] })
export class ReportsModule {}
