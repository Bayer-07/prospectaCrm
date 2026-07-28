import { Body, Controller, Delete, Get, Header, Param, Patch, Post, Query, StreamableFile } from '@nestjs/common';
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
  @Get('reports/summary.pdf')
  async pdf(@CurrentUser() auth: AuthContext, @Query() query: { from?: string; to?: string }) {
    const buffer = await this.reports.exportPdf(auth, query);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="relatorio-gerencial-${new Date().toISOString().slice(0, 10)}.pdf"`,
      length: buffer.length,
    });
  }

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

  @RequirePermission('campaigns', 'read')
  @Get('email/templates')
  async emailTemplates(@CurrentUser() auth: AuthContext) { return { data: await this.reports.emailTemplates(auth) }; }

  @RequirePermission('campaigns', 'read')
  @Get('email/provider')
  emailProvider() { return { data: this.reports.emailProvider() }; }

  @RequirePermission('campaigns', 'write')
  @Post('email/templates')
  async createEmailTemplate(@CurrentUser() auth: AuthContext, @Body() body: { name: string; subject: string; html: string; text?: string }) { return { data: await this.reports.createEmailTemplate(auth, body) }; }

  @RequirePermission('campaigns', 'write')
  @Delete('email/templates/:id')
  async deleteEmailTemplate(@CurrentUser() auth: AuthContext, @Param('id') id: string) { return { data: await this.reports.deleteEmailTemplate(auth, id) }; }

  @RequirePermission('webhooks', 'read')
  @Get('outbound-webhook-actions')
  webhookActions() { return { data: this.reports.outboundWebhookActions() }; }

  @RequirePermission('webhooks', 'read')
  @Get('outbound-webhooks')
  async webhooks(@CurrentUser() auth: AuthContext) { return { data: await this.reports.outboundWebhooks(auth) }; }

  @RequirePermission('webhooks', 'write')
  @Post('outbound-webhooks')
  async createWebhook(@CurrentUser() auth: AuthContext, @Body() body: { name: string; endpoint: string; action: string }) {
    return { data: await this.reports.createOutboundWebhook(auth, body) };
  }

  @RequirePermission('webhooks', 'write')
  @Patch('outbound-webhooks/:id')
  async updateWebhook(
    @CurrentUser() auth: AuthContext,
    @Param('id') id: string,
    @Body() body: { name?: string; endpoint?: string; action?: string; enabled?: boolean },
  ) {
    return { data: await this.reports.updateOutboundWebhook(auth, id, body) };
  }

  @RequirePermission('webhooks', 'write')
  @Delete('outbound-webhooks/:id')
  async deleteWebhook(@CurrentUser() auth: AuthContext, @Param('id') id: string) {
    return { data: await this.reports.deleteOutboundWebhook(auth, id) };
  }
}
