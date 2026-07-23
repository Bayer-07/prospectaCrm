import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { RequirePermission } from '../auth/permission.decorator.js';
import type { AuthContext } from '../auth/types.js';
import { CampaignsService } from './campaigns.service.js';

@ApiTags('Campanhas')
@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  @RequirePermission('campaigns', 'read')
  @Get()
  async list(@CurrentUser() auth: AuthContext) { return { data: await this.campaigns.list(auth) }; }

  @RequirePermission('campaigns', 'read')
  @Get(':id')
  async get(@CurrentUser() auth: AuthContext, @Param('id') id: string) { return { data: await this.campaigns.get(auth, id) }; }

  @RequirePermission('campaigns', 'write')
  @Post()
  async create(@CurrentUser() auth: AuthContext, @Body() body: Parameters<CampaignsService['create']>[1]) { return { data: await this.campaigns.create(auth, body) }; }

  @RequirePermission('campaigns', 'write')
  @Post(':id/preflight')
  async preflight(@CurrentUser() auth: AuthContext, @Param('id') id: string) { return { data: await this.campaigns.preflight(auth, id) }; }

  @RequirePermission('campaigns', 'launch')
  @Post(':id/schedule')
  async schedule(@CurrentUser() auth: AuthContext, @Param('id') id: string, @Body() body: { scheduledAt?: string }) { return { data: await this.campaigns.schedule(auth, id, body.scheduledAt) }; }

  @RequirePermission('campaigns', 'launch')
  @Post(':id/:action')
  async status(@CurrentUser() auth: AuthContext, @Param('id') id: string, @Param('action') action: 'pause' | 'resume' | 'cancel') { return { data: await this.campaigns.setStatus(auth, id, action) }; }
}
