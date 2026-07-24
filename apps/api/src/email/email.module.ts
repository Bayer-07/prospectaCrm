import { Module } from '@nestjs/common';
import { MailgunWebhookController } from './mailgun-webhook.controller.js';
import { MailgunWebhookService } from './mailgun-webhook.service.js';

@Module({
  controllers: [MailgunWebhookController],
  providers: [MailgunWebhookService],
})
export class EmailModule {}

