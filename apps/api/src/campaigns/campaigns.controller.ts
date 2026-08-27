import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Query, Req, StreamableFile } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { RequirePermission } from '../auth/permission.decorator.js';
import type { AuthContext } from '../auth/types.js';
import { CampaignsService, type CreateCampaignInput } from './campaigns.service.js';

async function requestText(request: Request) {
  if (typeof request.body === 'string') return request.body;
  if (request.body && typeof request.body.csv === 'string') return request.body.csv;

  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

function numberQuery(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function booleanQuery(value: unknown) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

function csvCampaignInput(query: Record<string, unknown>, csv: string): CreateCampaignInput {
  if (typeof query.name !== 'string' || typeof query.instanceId !== 'string') {
    throw new BadRequestException('Informe o título e o número de envio');
  }
  return {
    name: query.name,
    instanceId: query.instanceId,
    skipRemainingMessagesOnReply: booleanQuery(query.skipRemainingMessagesOnReply),
    audience: { source: 'csv', csv },
    bubbles: [],
    cadence: {
      bubbleDelayMinSeconds: numberQuery(query.bubbleDelayMinSeconds),
      bubbleDelayMaxSeconds: numberQuery(query.bubbleDelayMaxSeconds),
      contactDelayMinSeconds: numberQuery(query.contactDelayMinSeconds),
      contactDelayMaxSeconds: numberQuery(query.contactDelayMaxSeconds),
      batchSize: numberQuery(query.batchSize),
      batchPauseMinSeconds: numberQuery(query.batchPauseMinSeconds),
      batchPauseMaxSeconds: numberQuery(query.batchPauseMaxSeconds),
    },
  };
}

@ApiTags('Campanhas')
@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  @RequirePermission('campaigns', 'read')
  @Get()
  async list(@CurrentUser() auth: AuthContext) { return { data: await this.campaigns.list(auth) }; }

  @RequirePermission('campaigns', 'write')
  @Post('csv/preview')
  async previewCsv(
    @CurrentUser() auth: AuthContext,
    @Query('instanceId') instanceId: string,
    @Req() request: Request,
  ) {
    return { data: await this.campaigns.previewCsv(auth, instanceId, await requestText(request)) };
  }

  @RequirePermission('campaigns', 'write')
  @Post('csv')
  async createFromCsv(
    @CurrentUser() auth: AuthContext,
    @Query() query: Record<string, unknown>,
    @Req() request: Request,
  ) {
    const csv = await requestText(request);
    return { data: await this.campaigns.create(auth, csvCampaignInput(query, csv)) };
  }

  @RequirePermission('campaigns', 'read')
  @Get(':id/invalid-whatsapp-numbers.csv')
  async invalidWhatsappNumbers(
    @CurrentUser() auth: AuthContext,
    @Param('id') id: string,
  ) {
    const file = await this.campaigns.invalidWhatsappNumbersCsv(auth, id);
    return new StreamableFile(Buffer.from(file.content, 'utf8'), {
      type: 'text/csv; charset=utf-8',
      disposition: `attachment; filename="${file.filename}"`,
      length: Buffer.byteLength(file.content, 'utf8'),
    });
  }

  @RequirePermission('campaigns', 'read')
  @Get(':id')
  async get(@CurrentUser() auth: AuthContext, @Param('id') id: string) { return { data: await this.campaigns.get(auth, id) }; }

  @RequirePermission('campaigns', 'write')
  @Post()
  async create(@CurrentUser() auth: AuthContext, @Body() body: Parameters<CampaignsService['create']>[1]) { return { data: await this.campaigns.create(auth, body) }; }

  @RequirePermission('campaigns', 'write')
  @Delete(':id')
  async archive(@CurrentUser() auth: AuthContext, @Param('id') id: string) { return { data: await this.campaigns.archive(auth, id) }; }

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
