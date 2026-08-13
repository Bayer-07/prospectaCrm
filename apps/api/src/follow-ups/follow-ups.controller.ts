import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { RequirePermission } from '../auth/permission.decorator.js';
import type { AuthContext } from '../auth/types.js';
import { FollowUpsService } from './follow-ups.service.js';

@ApiTags('WhatsApp e atendimento')
@Controller('conversations/:conversationId/follow-ups')
export class FollowUpsController {
  constructor(private readonly followUps: FollowUpsService) {}

  @RequirePermission('conversations', 'read')
  @Get('active')
  async active(@CurrentUser() auth: AuthContext, @Param('conversationId') conversationId: string) {
    return { data: await this.followUps.active(auth, conversationId) };
  }

  @RequirePermission('conversations', 'read')
  @Get(':followUpId')
  async get(
    @CurrentUser() auth: AuthContext,
    @Param('conversationId') conversationId: string,
    @Param('followUpId') followUpId: string,
  ) {
    return { data: await this.followUps.get(auth, conversationId, followUpId) };
  }

  @RequirePermission('conversations', 'write')
  @Post()
  async create(
    @CurrentUser() auth: AuthContext,
    @Param('conversationId') conversationId: string,
    @Body() body: unknown,
  ) {
    return { data: await this.followUps.create(auth, conversationId, body) };
  }

  @RequirePermission('conversations', 'write')
  @Patch(':followUpId')
  async update(
    @CurrentUser() auth: AuthContext,
    @Param('conversationId') conversationId: string,
    @Param('followUpId') followUpId: string,
    @Body() body: unknown,
  ) {
    return { data: await this.followUps.update(auth, conversationId, followUpId, body) };
  }

  @RequirePermission('conversations', 'write')
  @Delete(':followUpId')
  async cancel(
    @CurrentUser() auth: AuthContext,
    @Param('conversationId') conversationId: string,
    @Param('followUpId') followUpId: string,
  ) {
    return { data: await this.followUps.cancel(auth, conversationId, followUpId) };
  }
}
