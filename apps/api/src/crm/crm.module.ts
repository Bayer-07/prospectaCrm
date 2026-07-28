import { Module } from '@nestjs/common';
import { CompanyCnpjLookupService } from './company-cnpj-lookup.service.js';
import { CrmController } from './crm.controller.js';
import { CrmService } from './crm.service.js';

@Module({
  controllers: [CrmController],
  providers: [CrmService, CompanyCnpjLookupService],
  exports: [CrmService],
})
export class CrmModule {}
