import { Module } from '@nestjs/common';
import { CompanyCnpjLookupService } from './company-cnpj-lookup.service.js';
import { CrmController } from './crm.controller.js';
import { CrmService } from './crm.service.js';
import { MediaModule } from '../media/media.module.js';
import { CompanyLogoLookupService } from './company-logo-lookup.service.js';
import { LinkPreviewService } from './link-preview.service.js';
import { FollowUpsModule } from '../follow-ups/follow-ups.module.js';

@Module({
  imports: [MediaModule, FollowUpsModule],
  controllers: [CrmController],
  providers: [CrmService, CompanyCnpjLookupService, CompanyLogoLookupService, LinkPreviewService],
  exports: [CrmService, LinkPreviewService],
})
export class CrmModule {}
