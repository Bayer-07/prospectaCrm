import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { RequirePermission } from '../auth/permission.decorator.js';
import type { AuthContext } from '../auth/types.js';
import { ChatbotsService } from './chatbots.service.js';

@ApiTags('Chatbots')
@Controller('chatbots')
export class ChatbotsController {
  constructor(private readonly chatbots: ChatbotsService) {}

  @RequirePermission('workflows', 'read')
  @Get()
  async list(@CurrentUser() auth: AuthContext) { return { data: await this.chatbots.list(auth) }; }

  @RequirePermission('workflows', 'read')
  @Get('metadata')
  async metadata(@CurrentUser() auth: AuthContext) { return { data: await this.chatbots.metadata(auth) }; }

  @RequirePermission('workflows', 'read')
  @Get(':id')
  async get(@CurrentUser() auth: AuthContext, @Param('id') id: string) { return { data: await this.chatbots.get(auth, id) }; }

  @RequirePermission('workflows', 'write')
  @Post()
  async create(@CurrentUser() auth: AuthContext, @Body() body: Parameters<ChatbotsService['create']>[1]) { return { data: await this.chatbots.create(auth, body) }; }

  @RequirePermission('workflows', 'write')
  @Patch(':id/draft')
  async draft(@CurrentUser() auth: AuthContext, @Param('id') id: string, @Body() body: { graph: Parameters<ChatbotsService['saveDraft']>[2] }) { return { data: await this.chatbots.saveDraft(auth, id, body.graph) }; }

  @RequirePermission('workflows', 'write')
  @Post(':id/publish')
  async publish(@CurrentUser() auth: AuthContext, @Param('id') id: string) { return { data: await this.chatbots.publish(auth, id) }; }

  @RequirePermission('workflows', 'write')
  @Patch(':id/status')
  async status(@CurrentUser() auth: AuthContext, @Param('id') id: string, @Body() body: { status: 'PAUSED' | 'ARCHIVED' | 'PUBLISHED' }) { return { data: await this.chatbots.setStatus(auth, id, body.status) }; }
}
