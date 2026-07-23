import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { RequirePermission } from '../auth/permission.decorator.js';
import type { AuthContext } from '../auth/types.js';
import { WorkflowsService } from './workflows.service.js';

@ApiTags('Automações')
@Controller('workflows')
export class WorkflowsController {
  constructor(private readonly workflows: WorkflowsService) {}

  @RequirePermission('workflows', 'read')
  @Get()
  async list(@CurrentUser() auth: AuthContext) { return { data: await this.workflows.list(auth) }; }

  @RequirePermission('workflows', 'read')
  @Get('metadata')
  async metadata(@CurrentUser() auth: AuthContext) { return { data: await this.workflows.metadata(auth) }; }

  @RequirePermission('workflows', 'read')
  @Get(':id')
  async get(@CurrentUser() auth: AuthContext, @Param('id') id: string) { return { data: await this.workflows.get(auth, id) }; }

  @RequirePermission('workflows', 'write')
  @Post()
  async create(@CurrentUser() auth: AuthContext, @Body() body: Parameters<WorkflowsService['create']>[1]) { return { data: await this.workflows.create(auth, body) }; }

  @RequirePermission('workflows', 'write')
  @Patch(':id/draft')
  async draft(@CurrentUser() auth: AuthContext, @Param('id') id: string, @Body() body: { graph: Parameters<WorkflowsService['saveDraft']>[2] }) { return { data: await this.workflows.saveDraft(auth, id, body.graph) }; }

  @RequirePermission('workflows', 'write')
  @Post(':id/publish')
  async publish(@CurrentUser() auth: AuthContext, @Param('id') id: string) { return { data: await this.workflows.publish(auth, id) }; }

  @RequirePermission('workflows', 'write')
  @Post(':id/enroll')
  async enroll(@CurrentUser() auth: AuthContext, @Param('id') id: string, @Body() body: { contactIds: string[]; conversationId?: string }) {
    return { data: await this.workflows.enroll(auth, id, body.contactIds, { conversationId: body.conversationId }) };
  }

  @RequirePermission('workflows', 'write')
  @Patch(':id/status')
  async status(@CurrentUser() auth: AuthContext, @Param('id') id: string, @Body() body: { status: 'PAUSED' | 'ARCHIVED' | 'PUBLISHED' }) { return { data: await this.workflows.setStatus(auth, id, body.status) }; }
}
