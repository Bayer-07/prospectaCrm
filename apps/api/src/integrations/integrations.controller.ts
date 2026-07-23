import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { RequirePermission } from '../auth/permission.decorator.js';
import { Public } from '../auth/public.decorator.js';
import type { AuthContext } from '../auth/types.js';
import { EvolutionService } from './evolution.service.js';

@ApiTags('WhatsApp e atendimento')
@Controller()
export class IntegrationsController {
  constructor(private readonly evolution: EvolutionService) {}

  @RequirePermission('integrations', 'read')
  @Get('whatsapp/instances')
  async instances(@CurrentUser() auth: AuthContext) { return { data: await this.evolution.listInstances(auth) }; }

  @RequirePermission('integrations', 'write')
  @Post('whatsapp/instances')
  async create(@CurrentUser() auth: AuthContext, @Body() body: { name: string; instanceKey: string; teamIds: string[] }) { return { data: await this.evolution.createInstance(auth, body) }; }

  @RequirePermission('integrations', 'write')
  @Post('whatsapp/instances/:id/connect')
  async connect(@CurrentUser() auth: AuthContext, @Param('id') id: string) { return { data: await this.evolution.connect(auth, id) }; }

  @RequirePermission('integrations', 'write')
  @Post('whatsapp/instances/:id/restart')
  async restart(@CurrentUser() auth: AuthContext, @Param('id') id: string) { return { data: await this.evolution.restart(auth, id) }; }

  @RequirePermission('integrations', 'write')
  @Post('whatsapp/instances/:id/logout')
  async logout(@CurrentUser() auth: AuthContext, @Param('id') id: string) { return { data: await this.evolution.logout(auth, id) }; }

  @RequirePermission('integrations', 'write')
  @Delete('whatsapp/instances/:id')
  async remove(@CurrentUser() auth: AuthContext, @Param('id') id: string) { return { data: await this.evolution.deleteInstance(auth, id) }; }

  @RequirePermission('conversations', 'read')
  @Get('conversations')
  async conversations(@CurrentUser() auth: AuthContext, @Query() query: { status?: string; assignee?: string; view?: string }) { return { data: await this.evolution.conversations(auth, query) }; }

  @RequirePermission('conversations', 'read')
  @Get('conversations/counts')
  async conversationCounts(@CurrentUser() auth: AuthContext, @Query('view') view?: string) { return { data: await this.evolution.conversationCounts(auth, view) }; }

  @RequirePermission('conversations', 'write')
  @Get('conversations/instances')
  async conversationInstances(@CurrentUser() auth: AuthContext) { return { data: await this.evolution.conversationInstances(auth) }; }

  @RequirePermission('conversations', 'write')
  @Post('conversations/start')
  async startConversation(@CurrentUser() auth: AuthContext, @Body() body: { contactId: string; instanceId: string }) {
    return { data: await this.evolution.startConversation(auth, body) };
  }

  @RequirePermission('conversations', 'write')
  @Get('conversations/assignees')
  async conversationAssignees(@CurrentUser() auth: AuthContext) { return { data: await this.evolution.conversationAssignees(auth) }; }

  @RequirePermission('conversations', 'read')
  @Get('conversations/:id')
  async conversation(@CurrentUser() auth: AuthContext, @Param('id') id: string) { return { data: await this.evolution.conversation(auth, id) }; }

  @RequirePermission('conversations', 'read')
  @Get('conversations/:id/messages')
  async conversationMessages(
    @CurrentUser() auth: AuthContext,
    @Param('id') id: string,
    @Query() query: { cursor?: string; limit?: string },
  ) {
    return { data: await this.evolution.conversationMessages(auth, id, query) };
  }

  @RequirePermission('conversations', 'read')
  @Get('conversations/:id/export/pdf')
  async exportConversationPdf(@CurrentUser() auth: AuthContext, @Param('id') id: string, @Res() response: Response) {
    const pdf = await this.evolution.exportConversationPdf(auth, id);
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', `attachment; filename="${pdf.filename}"`);
    response.setHeader('Content-Length', pdf.buffer.length);
    response.setHeader('Cache-Control', 'private, no-store');
    return response.send(pdf.buffer);
  }

  @RequirePermission('conversations', 'read')
  @Get('conversations/:id/profile-picture')
  async profilePicture(@CurrentUser() auth: AuthContext, @Param('id') id: string, @Res() response: Response) {
    const picture = await this.evolution.profilePicture(auth, id);
    if (!picture) return response.status(404).end();
    response.setHeader('Content-Type', picture.contentType);
    response.setHeader('Cache-Control', 'private, max-age=3600, stale-while-revalidate=300');
    response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    return response.send(picture.body);
  }

  @RequirePermission('conversations', 'write')
  @Patch('conversations/:id/assign')
  async assign(@CurrentUser() auth: AuthContext, @Param('id') id: string, @Body() body: { assigneeId: string | null }) {
    const assigneeId = body.assigneeId === 'self' ? auth.userId || null : body.assigneeId;
    return { data: await this.evolution.assign(auth, id, assigneeId) };
  }

  @RequirePermission('conversations', 'write')
  @Patch('conversations/:id/status')
  async status(@CurrentUser() auth: AuthContext, @Param('id') id: string, @Body() body: { status: 'OPEN' | 'CLOSED' }) { return { data: await this.evolution.setConversationStatus(auth, id, body.status) }; }

  @RequirePermission('conversations', 'read')
  @Post('conversations/:id/read')
  async read(@CurrentUser() auth: AuthContext, @Param('id') id: string) { return { data: await this.evolution.markRead(auth, id) }; }

  @RequirePermission('conversations', 'write')
  @Post('conversations/:id/messages')
  async send(@CurrentUser() auth: AuthContext, @Param('id') id: string, @Body() body: { type?: string; text?: string; mediaKey?: string; replyToMessageId?: string; signatureEnabled?: boolean }) { return { data: await this.evolution.sendMessage(auth, id, body) }; }

  @RequirePermission('conversations', 'write')
  @Post('conversations/:id/messages/:messageId/reaction')
  async react(
    @CurrentUser() auth: AuthContext,
    @Param('id') id: string,
    @Param('messageId') messageId: string,
    @Body() body: { reaction: string },
  ) {
    return { data: await this.evolution.reactToMessage(auth, id, messageId, body.reaction) };
  }

  @RequirePermission('conversations', 'write')
  @Patch('conversations/:id/messages/:messageId')
  async editMessage(
    @CurrentUser() auth: AuthContext,
    @Param('id') id: string,
    @Param('messageId') messageId: string,
    @Body() body: { text: string },
  ) {
    return { data: await this.evolution.editMessage(auth, id, messageId, body.text) };
  }

  @RequirePermission('conversations', 'write')
  @Delete('conversations/:id/messages/:messageId')
  async deleteMessage(@CurrentUser() auth: AuthContext, @Param('id') id: string, @Param('messageId') messageId: string) {
    return { data: await this.evolution.deleteMessage(auth, id, messageId) };
  }

  @RequirePermission('conversations', 'write')
  @Post('conversations/:id/messages/:messageId/retry')
  async retry(@CurrentUser() auth: AuthContext, @Param('id') id: string, @Param('messageId') messageId: string) {
    return { data: await this.evolution.retryMessage(auth, id, messageId) };
  }
}

@Controller('webhooks/evolution')
export class EvolutionWebhookController {
  constructor(private readonly evolution: EvolutionService) {}

  @Public()
  @Post()
  async receive(@Headers() headers: Record<string, string | string[] | undefined>, @Body() body: Record<string, unknown>) {
    return this.evolution.ingestWebhook(headers, body);
  }
}
