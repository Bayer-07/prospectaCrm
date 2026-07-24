import { Body, Controller, Post } from '@nestjs/common';
import { Public } from '../auth/public.decorator.js';
import { MailgunWebhookService } from './mailgun-webhook.service.js';

@Controller('webhooks/mailgun')
export class MailgunWebhookController {
  constructor(private readonly mailgun: MailgunWebhookService) {}

  @Public()
  @Post()
  receive(@Body() body: Record<string, unknown>) {
    return this.mailgun.ingest(body);
  }
}

