import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { RequirePermission } from '../auth/permission.decorator.js';
import type { AuthContext } from '../auth/types.js';
import { AiService } from './ai.service.js';

@Controller()
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Get('settings/ai')
  getSettings(@CurrentUser() auth: AuthContext) {
    return this.ai.getSettings(auth).then((data) => ({ data }));
  }

  @Patch('settings/ai')
  updateSettings(
    @CurrentUser() auth: AuthContext,
    @Body() body: { enabled?: boolean; globalInstructions?: string; fallbackMessage?: string },
  ) {
    return this.ai.updateSettings(auth, body).then((data) => ({ data }));
  }

  @Post('settings/ai/test')
  test(@CurrentUser() auth: AuthContext, @Body() body: { message?: string }) {
    return this.ai.test(auth, body.message).then((data) => ({ data }));
  }

  @Get('settings/ai/tests/:generationId')
  getTest(@CurrentUser() auth: AuthContext, @Param('generationId') generationId: string) {
    return this.ai.getTest(auth, generationId).then((data) => ({ data }));
  }

  @RequirePermission('conversations', 'write')
  @Post('conversations/:id/ai/generations')
  createGeneration(
    @CurrentUser() auth: AuthContext,
    @Param('id') conversationId: string,
    @Body() body: { type: 'SUMMARY' | 'REPLY_SUGGESTION'; scope?: 'CURRENT_ATTENDANCE' | 'FULL_CONVERSATION' },
  ) {
    return this.ai.createGeneration(auth, conversationId, body).then((data) => ({ data }));
  }

  @RequirePermission('conversations', 'read')
  @Get('conversations/:id/ai/generations/:generationId')
  getGeneration(@CurrentUser() auth: AuthContext, @Param('id') conversationId: string, @Param('generationId') generationId: string) {
    return this.ai.getGeneration(auth, conversationId, generationId).then((data) => ({ data }));
  }

  @RequirePermission('conversations', 'read')
  @Get('conversations/:id/ai/summaries/latest')
  latestSummary(@CurrentUser() auth: AuthContext, @Param('id') conversationId: string) {
    return this.ai.latestSummary(auth, conversationId).then((data) => ({ data }));
  }

  @RequirePermission('conversations', 'read')
  @Get('conversations/:id/ai/proposals')
  proposals(@CurrentUser() auth: AuthContext, @Param('id') conversationId: string) {
    return this.ai.listProposals(auth, conversationId).then((data) => ({ data }));
  }

  @RequirePermission('conversations', 'write')
  @Patch('conversations/:id/ai/proposals/:proposalId')
  updateProposal(
    @CurrentUser() auth: AuthContext,
    @Param('id') conversationId: string,
    @Param('proposalId') proposalId: string,
    @Body() body: { action: 'apply' | 'dismiss'; fields?: string[]; companyId?: string },
  ) {
    return this.ai.updateProposal(auth, conversationId, proposalId, body).then((data) => ({ data }));
  }
}
