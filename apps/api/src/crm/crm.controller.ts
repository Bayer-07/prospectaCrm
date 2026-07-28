import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { RequirePermission } from '../auth/permission.decorator.js';
import type { AuthContext } from '../auth/types.js';
import {
  ApiArchiveCompanyDocumentation,
  ApiArchiveContactDocumentation,
  ApiArchiveOpportunityDocumentation,
  ApiCancelTaskDocumentation,
  ApiCompleteTaskDocumentation,
  ApiCreateCompanyDocumentation,
  ApiCreateContactDocumentation,
  ApiCreateCustomFieldDocumentation,
  ApiCreateOpportunityDocumentation,
  ApiCreateSegmentDocumentation,
  ApiCreateTagDocumentation,
  ApiCreateTaskDocumentation,
  ApiCrmDocumentationModels,
  ApiDeleteCustomFieldDocumentation,
  ApiDeleteSegmentDocumentation,
  ApiDeleteTagDocumentation,
  ApiGetCompanyDocumentation,
  ApiGetContactDocumentation,
  ApiGetOpportunityDocumentation,
  ApiListCompaniesDocumentation,
  ApiListContactsDocumentation,
  ApiListCustomFieldsDocumentation,
  ApiListOpportunitiesDocumentation,
  ApiListSegmentsDocumentation,
  ApiListTagsDocumentation,
  ApiListTasksDocumentation,
  ApiUpdateCompanyDocumentation,
  ApiUpdateContactDocumentation,
  ApiUpdateCustomFieldDocumentation,
  ApiUpdateOpportunityDocumentation,
  ApiUpdateSegmentDocumentation,
  ApiUpdateTagDocumentation,
  ApiUpdateTaskDocumentation,
} from '../swagger/crm-openapi.js';
import { CompanyCnpjLookupService } from './company-cnpj-lookup.service.js';
import { CrmService } from './crm.service.js';

@ApiTags('CRM')
@ApiCrmDocumentationModels()
@Controller()
export class CrmController {
  constructor(
    private readonly crm: CrmService,
    private readonly companyCnpjLookup: CompanyCnpjLookupService,
  ) {}

  @Get('dashboard')
  async dashboard(@CurrentUser() auth: AuthContext) { return { data: await this.crm.dashboard(auth) }; }

  @RequirePermission('companies', 'read')
  @ApiListCompaniesDocumentation()
  @Get('companies')
  listCompanies(
    @CurrentUser() auth: AuthContext,
    @Query() query: {
      cursor?: string;
      limit?: number;
      search?: string;
      ownerId?: string;
      teamId?: string;
      sector?: string;
      size?: string;
      hasContacts?: string;
    },
  ) { return this.crm.listCompanies(auth, query); }

  @RequirePermission('companies', 'write')
  @ApiExcludeEndpoint()
  @Get('companies/lookup/cnpj/:cnpj')
  async lookupCompanyByCnpj(@Param('cnpj') cnpj: string) {
    return { data: await this.companyCnpjLookup.lookup(cnpj) };
  }

  @RequirePermission('companies', 'read')
  @ApiGetCompanyDocumentation()
  @Get('companies/:id')
  async company(@CurrentUser() auth: AuthContext, @Param('id') id: string) { return { data: await this.crm.getCompany(auth, id) }; }

  @RequirePermission('companies', 'write')
  @ApiCreateCompanyDocumentation()
  @Post('companies')
  async createCompany(@CurrentUser() auth: AuthContext, @Body() body: unknown) { return { data: await this.crm.createCompany(auth, body) }; }

  @RequirePermission('companies', 'write')
  @ApiUpdateCompanyDocumentation()
  @Patch('companies/:id')
  async updateCompany(@CurrentUser() auth: AuthContext, @Param('id') id: string, @Body() body: unknown) { return { data: await this.crm.updateCompany(auth, id, body) }; }

  @RequirePermission('companies', 'write')
  @ApiArchiveCompanyDocumentation()
  @Delete('companies/:id')
  async archiveCompany(@CurrentUser() auth: AuthContext, @Param('id') id: string) { return { data: await this.crm.archiveCompany(auth, id) }; }

  @RequirePermission('contacts', 'read')
  @ApiListContactsDocumentation()
  @Get('contacts')
  listContacts(
    @CurrentUser() auth: AuthContext,
    @Query() query: {
      cursor?: string;
      limit?: number;
      search?: string;
      consent?: string;
      emailOnly?: string;
      ownerId?: string;
      teamId?: string;
      tagId?: string;
      company?: string;
      hasPhone?: string;
      hasEmail?: string;
    },
  ) { return this.crm.listContacts(auth, query); }

  @RequirePermission('contacts', 'read')
  @ApiGetContactDocumentation()
  @Get('contacts/:id')
  async contact(@CurrentUser() auth: AuthContext, @Param('id') id: string) { return { data: await this.crm.getContact(auth, id) }; }

  @RequirePermission('contacts', 'write')
  @ApiCreateContactDocumentation()
  @Post('contacts')
  async createContact(@CurrentUser() auth: AuthContext, @Body() body: unknown) { return { data: await this.crm.createContact(auth, body) }; }

  @RequirePermission('contacts', 'write')
  @Post('contacts/shared')
  async saveSharedContact(@CurrentUser() auth: AuthContext, @Body() body: unknown) { return { data: await this.crm.saveSharedContact(auth, body) }; }

  @RequirePermission('contacts', 'write')
  @ApiUpdateContactDocumentation()
  @Patch('contacts/:id')
  async updateContact(@CurrentUser() auth: AuthContext, @Param('id') id: string, @Body() body: unknown) { return { data: await this.crm.updateContact(auth, id, body) }; }

  @RequirePermission('contacts', 'write')
  @ApiArchiveContactDocumentation()
  @Delete('contacts/:id')
  async archiveContact(@CurrentUser() auth: AuthContext, @Param('id') id: string) { return { data: await this.crm.archiveContact(auth, id) }; }

  @RequirePermission('opportunities', 'read')
  @Get('pipelines')
  async pipelines(@CurrentUser() auth: AuthContext) { return { data: await this.crm.pipelines(auth) }; }

  @RequirePermission('opportunities', 'read')
  @Get('pipelines/:id/kanban')
  async kanban(@CurrentUser() auth: AuthContext, @Param('id') id: string) { return { data: await this.crm.kanban(auth, id) }; }

  @RequirePermission('opportunities', 'write')
  @ApiCreateOpportunityDocumentation()
  @Post('opportunities')
  async createOpportunity(@CurrentUser() auth: AuthContext, @Body() body: unknown) { return { data: await this.crm.createOpportunity(auth, body) }; }

  @RequirePermission('opportunities', 'read')
  @ApiListOpportunitiesDocumentation()
  @Get('opportunities')
  async opportunities(@CurrentUser() auth: AuthContext, @Query() query: { cursor?: string; limit?: number; search?: string }) { return this.crm.listOpportunities(auth, query); }

  @RequirePermission('opportunities', 'read')
  @ApiGetOpportunityDocumentation()
  @Get('opportunities/:id')
  async opportunity(@CurrentUser() auth: AuthContext, @Param('id') id: string) { return { data: await this.crm.getOpportunity(auth, id) }; }

  @RequirePermission('opportunities', 'write')
  @ApiUpdateOpportunityDocumentation()
  @Patch('opportunities/:id')
  async updateOpportunity(@CurrentUser() auth: AuthContext, @Param('id') id: string, @Body() body: unknown) { return { data: await this.crm.updateOpportunity(auth, id, body) }; }

  @RequirePermission('opportunities', 'write')
  @ApiArchiveOpportunityDocumentation()
  @Delete('opportunities/:id')
  async archiveOpportunity(@CurrentUser() auth: AuthContext, @Param('id') id: string) { return { data: await this.crm.archiveOpportunity(auth, id) }; }

  @RequirePermission('opportunities', 'write')
  @Patch('opportunities/:id/stage')
  async move(@CurrentUser() auth: AuthContext, @Param('id') id: string, @Body() body: { stageId: string; reason?: string }) {
    return { data: await this.crm.moveOpportunity(auth, id, body.stageId, body.reason) };
  }

  @RequirePermission('tasks', 'read')
  @ApiListTasksDocumentation()
  @Get('tasks')
  async tasks(
    @CurrentUser() auth: AuthContext,
    @Query() query: { from?: string; to?: string; status?: string },
  ) { return { data: await this.crm.tasks(auth, query) }; }

  @RequirePermission('tasks', 'write')
  @ApiCreateTaskDocumentation()
  @Post('tasks')
  async createTask(@CurrentUser() auth: AuthContext, @Body() body: unknown) { return { data: await this.crm.createTask(auth, body) }; }

  @RequirePermission('tasks', 'write')
  @ApiCompleteTaskDocumentation()
  @Patch('tasks/:id/complete')
  async completeTask(@CurrentUser() auth: AuthContext, @Param('id') id: string) { return { data: await this.crm.completeTask(auth, id) }; }

  @RequirePermission('tasks', 'write')
  @ApiUpdateTaskDocumentation()
  @Patch('tasks/:id')
  async updateTask(@CurrentUser() auth: AuthContext, @Param('id') id: string, @Body() body: unknown) { return { data: await this.crm.updateTask(auth, id, body) }; }

  @RequirePermission('tasks', 'write')
  @ApiCancelTaskDocumentation()
  @Delete('tasks/:id')
  async cancelTask(@CurrentUser() auth: AuthContext, @Param('id') id: string) { return { data: await this.crm.cancelTask(auth, id) }; }

  @Get('metadata')
  async metadata(@CurrentUser() auth: AuthContext) { return { data: await this.crm.metadata(auth) }; }

  @RequirePermission('contacts', 'write')
  @Post('imports/csv')
  async importCsv(@CurrentUser() auth: AuthContext, @Body() body: { entityType: 'companies' | 'contacts'; csv: string; mapping: Record<string, string>; commit?: boolean }) {
    return { data: await this.crm.importCsv(auth, body) };
  }

  @RequirePermission('contacts', 'read')
  @ApiListTagsDocumentation()
  @Get('tags')
  async tags(@CurrentUser() auth: AuthContext) { return { data: await this.crm.tags(auth) }; }

  @RequirePermission('contacts', 'write')
  @ApiCreateTagDocumentation()
  @Post('tags')
  async createTag(@CurrentUser() auth: AuthContext, @Body() body: { name: string; color?: string }) { return { data: await this.crm.createTag(auth, body) }; }

  @RequirePermission('contacts', 'write')
  @ApiUpdateTagDocumentation()
  @Patch('tags/:id')
  async updateTag(@CurrentUser() auth: AuthContext, @Param('id') id: string, @Body() body: { name?: string; color?: string }) { return { data: await this.crm.updateTag(auth, id, body) }; }

  @RequirePermission('contacts', 'write')
  @ApiDeleteTagDocumentation()
  @Delete('tags/:id')
  async deleteTag(@CurrentUser() auth: AuthContext, @Param('id') id: string) { return { data: await this.crm.deleteTag(auth, id) }; }

  @RequirePermission('contacts', 'read')
  @ApiListCustomFieldsDocumentation()
  @Get('custom-fields')
  async customFields(@CurrentUser() auth: AuthContext, @Query('entityType') entityType?: string) { return { data: await this.crm.customFields(auth, entityType) }; }

  @RequirePermission('contacts', 'write')
  @ApiCreateCustomFieldDocumentation()
  @Post('custom-fields')
  async createCustomField(@CurrentUser() auth: AuthContext, @Body() body: { entityType: string; key: string; label: string; fieldType: string; options?: unknown[]; required?: boolean; position?: number }) { return { data: await this.crm.createCustomField(auth, body) }; }

  @RequirePermission('contacts', 'write')
  @ApiUpdateCustomFieldDocumentation()
  @Patch('custom-fields/:id')
  async updateCustomField(@CurrentUser() auth: AuthContext, @Param('id') id: string, @Body() body: { label?: string; options?: unknown[]; required?: boolean; position?: number }) { return { data: await this.crm.updateCustomField(auth, id, body) }; }

  @RequirePermission('contacts', 'write')
  @ApiDeleteCustomFieldDocumentation()
  @Delete('custom-fields/:id')
  async deleteCustomField(@CurrentUser() auth: AuthContext, @Param('id') id: string) { return { data: await this.crm.deleteCustomField(auth, id) }; }

  @RequirePermission('contacts', 'read')
  @ApiListSegmentsDocumentation()
  @Get('segments')
  async segments(@CurrentUser() auth: AuthContext) { return { data: await this.crm.segments(auth) }; }

  @RequirePermission('contacts', 'write')
  @ApiCreateSegmentDocumentation()
  @Post('segments')
  async createSegment(@CurrentUser() auth: AuthContext, @Body() body: { name: string; description?: string; filters?: Record<string, unknown>; contactIds?: string[] }) { return { data: await this.crm.createSegment(auth, body) }; }

  @RequirePermission('contacts', 'write')
  @ApiUpdateSegmentDocumentation()
  @Patch('segments/:id')
  async updateSegment(@CurrentUser() auth: AuthContext, @Param('id') id: string, @Body() body: { name?: string; description?: string; filters?: Record<string, unknown>; contactIds?: string[] }) { return { data: await this.crm.updateSegment(auth, id, body) }; }

  @RequirePermission('contacts', 'write')
  @ApiDeleteSegmentDocumentation()
  @Delete('segments/:id')
  async deleteSegment(@CurrentUser() auth: AuthContext, @Param('id') id: string) { return { data: await this.crm.deleteSegment(auth, id) }; }
}
