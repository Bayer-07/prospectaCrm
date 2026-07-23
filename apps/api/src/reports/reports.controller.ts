import { Body, Controller, Get, Header, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { RequirePermission } from '../auth/permission.decorator.js';
import type { AuthContext } from '../auth/types.js';
import { ReportsService } from './reports.service.js';

@ApiTags('Relatórios e configurações')
@Controller()
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @RequirePermission('reports', 'read')
  @Get('reports/summary')
  async summary(@CurrentUser() auth: AuthContext, @Query() query: { from?: string; to?: string }) { return { data: await this.reports.summary(auth, query) }; }

  @RequirePermission('reports', 'read')
  @Get('reports/companies.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="empresas.csv"')
  async csv(@CurrentUser() auth: AuthContext) { return `\ufeff${await this.reports.exportCsv(auth)}`; }

  @Get('notifications')
  async notifications(@CurrentUser() auth: AuthContext) { return { data: await this.reports.notifications(auth) }; }

  @Patch('notifications/read-all')
  async readAllNotifications(@CurrentUser() auth: AuthContext) { return { data: await this.reports.readAllNotifications(auth) }; }

  @Patch('notifications/:id/read')
  async readNotification(@CurrentUser() auth: AuthContext, @Param('id') id: string) { return { data: await this.reports.readNotification(auth, id) }; }

  @Get('email/templates')
  async emailTemplates(@CurrentUser() auth: AuthContext) { return { data: await this.reports.emailTemplates(auth) }; }

  @Post('email/templates')
  async createEmailTemplate(@CurrentUser() auth: AuthContext, @Body() body: { name: string; subject: string; html: string; text?: string }) { return { data: await this.reports.createEmailTemplate(auth, body) }; }

  @RequirePermission('api_keys', 'write')
  @Get('outbound-webhooks')
  async webhooks(@CurrentUser() auth: AuthContext) { return { data: await this.reports.outboundWebhooks(auth) }; }

  @RequirePermission('api_keys', 'write')
  @Post('outbound-webhooks')
  async createWebhook(@CurrentUser() auth: AuthContext, @Body() body: { name: string; url: string; events: string[] }) { return { data: await this.reports.createOutboundWebhook(auth, body) }; }
}
