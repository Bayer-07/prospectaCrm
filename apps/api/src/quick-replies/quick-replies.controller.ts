import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { RequirePermission } from '../auth/permission.decorator.js';
import type { AuthContext } from '../auth/types.js';
import { QuickRepliesService, type QuickReplyInput } from './quick-replies.service.js';

@ApiTags('Respostas rápidas')
@Controller('quick-replies')
export class QuickRepliesController {
  constructor(private readonly quickReplies: QuickRepliesService) {}

  @RequirePermission('conversations', 'read')
  @Get()
  async list(@CurrentUser() auth: AuthContext, @Query('search') search?: string) {
    return { data: await this.quickReplies.list(auth, search) };
  }

  @RequirePermission('conversations', 'write')
  @Post()
  async create(@CurrentUser() auth: AuthContext, @Body() body: QuickReplyInput) {
    return { data: await this.quickReplies.create(auth, body) };
  }

  @RequirePermission('conversations', 'write')
  @Patch(':id')
  async update(@CurrentUser() auth: AuthContext, @Param('id') id: string, @Body() body: Partial<QuickReplyInput>) {
    return { data: await this.quickReplies.update(auth, id, body) };
  }

  @RequirePermission('conversations', 'write')
  @Delete(':id')
  async remove(@CurrentUser() auth: AuthContext, @Param('id') id: string) {
    return { data: await this.quickReplies.remove(auth, id) };
  }
}
