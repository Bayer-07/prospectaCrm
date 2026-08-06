import { Module } from '@nestjs/common';
import { CompanyCnpjLookupService } from './company-cnpj-lookup.service.js';
import { CrmController } from './crm.controller.js';
import { CrmService } from './crm.service.js';
import { MediaModule } from '../media/media.module.js';
import { CompanyLogoLookupService } from './company-logo-lookup.service.js';

@Module({
  imports: [MediaModule],
  controllers: [CrmController],
  providers: [CrmService, CompanyCnpjLookupService, CompanyLogoLookupService],
  exports: [CrmService],
})
export class CrmModule {}
