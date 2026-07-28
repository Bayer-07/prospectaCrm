import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AuthModule } from './auth/auth.module.js';
import { AuthGuard } from './auth/auth.guard.js';
import { CampaignsModule } from './campaigns/campaigns.module.js';
import { ChatbotsModule } from './chatbots/chatbots.module.js';
import { CrmModule } from './crm/crm.module.js';
import { HealthController } from './health.controller.js';
import { IntegrationsModule } from './integrations/integrations.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { RealtimeModule } from './realtime/realtime.module.js';
import { ReportsModule } from './reports/reports.module.js';
import { UsersModule } from './users/users.module.js';
import { WorkflowsModule } from './workflows/workflows.module.js';
import { QueueModule } from './queue/queue.module.js';
import { IdempotencyInterceptor } from './common/idempotency.interceptor.js';
import { MediaModule } from './media/media.module.js';
import { EmailModule } from './email/email.module.js';
import { McpModule } from './mcp/mcp.module.js';

@Module({
  imports: [
    PrismaModule, QueueModule, AuthModule, UsersModule, CrmModule, IntegrationsModule,
    CampaignsModule, ChatbotsModule, WorkflowsModule, ReportsModule, RealtimeModule, MediaModule, EmailModule, McpModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
  ],
})
export class AppModule {}
