import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { RequirePermission } from '../auth/permission.decorator.js';
import type { AuthContext } from '../auth/types.js';
import { CrmService } from './crm.service.js';

@ApiTags('CRM')
@Controller()
export class CrmController {
  constructor(private readonly crm: CrmService) {}

  @Get('dashboard')
  async dashboard(@CurrentUser() auth: AuthContext) { return { data: await this.crm.dashboard(auth) }; }

  @RequirePermission('companies', 'read')
  @Get('companies')
  listCompanies(@CurrentUser() auth: AuthContext, @Query() query: { cursor?: string; limit?: number; search?: string }) { return this.crm.listCompanies(auth, query); }

  @RequirePermission('companies', 'read')
  @Get('companies/:id')
  async company(@CurrentUser() auth: AuthContext, @Param('id') id: string) { return { data: await this.crm.getCompany(auth, id) }; }

  @RequirePermission('companies', 'write')
  @Post('companies')
  async createCompany(@CurrentUser() auth: AuthContext, @Body() body: unknown) { return { data: await this.crm.createCompany(auth, body) }; }

  @RequirePermission('companies', 'write')
  @Patch('companies/:id')
  async updateCompany(@CurrentUser() auth: AuthContext, @Param('id') id: string, @Body() body: unknown) { return { data: await this.crm.updateCompany(auth, id, body) }; }

  @RequirePermission('companies', 'write')
  @Delete('companies/:id')
  async archiveCompany(@CurrentUser() auth: AuthContext, @Param('id') id: string) { return { data: await this.crm.archiveCompany(auth, id) }; }

  @RequirePermission('contacts', 'read')
  @Get('contacts')
  listContacts(@CurrentUser() auth: AuthContext, @Query() query: { cursor?: string; limit?: number; search?: string; consent?: string }) { return this.crm.listContacts(auth, query); }

  @RequirePermission('contacts', 'read')
  @Get('contacts/:id')
  async contact(@CurrentUser() auth: AuthContext, @Param('id') id: string) { return { data: await this.crm.getContact(auth, id) }; }

  @RequirePermission('contacts', 'write')
  @Post('contacts')
  async createContact(@CurrentUser() auth: AuthContext, @Body() body: unknown) { return { data: await this.crm.createContact(auth, body) }; }

  @RequirePermission('contacts', 'write')
  @Patch('contacts/:id')
  async updateContact(@CurrentUser() auth: AuthContext, @Param('id') id: string, @Body() body: unknown) { return { data: await this.crm.updateContact(auth, id, body) }; }

  @RequirePermission('contacts', 'write')
  @Delete('contacts/:id')
  async archiveContact(@CurrentUser() auth: AuthContext, @Param('id') id: string) { return { data: await this.crm.archiveContact(auth, id) }; }

  @Get('pipelines')
  async pipelines(@CurrentUser() auth: AuthContext) { return { data: await this.crm.pipelines(auth) }; }

  @RequirePermission('opportunities', 'read')
  @Get('pipelines/:id/kanban')
  async kanban(@CurrentUser() auth: AuthContext, @Param('id') id: string) { return { data: await this.crm.kanban(auth, id) }; }

  @RequirePermission('opportunities', 'write')
  @Post('opportunities')
  async createOpportunity(@CurrentUser() auth: AuthContext, @Body() body: unknown) { return { data: await this.crm.createOpportunity(auth, body) }; }

  @RequirePermission('opportunities', 'read')
  @Get('opportunities')
  async opportunities(@CurrentUser() auth: AuthContext, @Query() query: { cursor?: string; limit?: number; search?: string }) { return this.crm.listOpportunities(auth, query); }

  @RequirePermission('opportunities', 'read')
  @Get('opportunities/:id')
  async opportunity(@CurrentUser() auth: AuthContext, @Param('id') id: string) { return { data: await this.crm.getOpportunity(auth, id) }; }

  @RequirePermission('opportunities', 'write')
  @Patch('opportunities/:id')
  async updateOpportunity(@CurrentUser() auth: AuthContext, @Param('id') id: string, @Body() body: unknown) { return { data: await this.crm.updateOpportunity(auth, id, body) }; }

  @RequirePermission('opportunities', 'write')
  @Delete('opportunities/:id')
  async archiveOpportunity(@CurrentUser() auth: AuthContext, @Param('id') id: string) { return { data: await this.crm.archiveOpportunity(auth, id) }; }

  @RequirePermission('opportunities', 'write')
  @Patch('opportunities/:id/stage')
  async move(@CurrentUser() auth: AuthContext, @Param('id') id: string, @Body() body: { stageId: string; reason?: string }) {
    return { data: await this.crm.moveOpportunity(auth, id, body.stageId, body.reason) };
  }

  @RequirePermission('tasks', 'read')
  @Get('tasks')
  async tasks(@CurrentUser() auth: AuthContext) { return { data: await this.crm.tasks(auth) }; }

  @RequirePermission('tasks', 'write')
  @Post('tasks')
  async createTask(@CurrentUser() auth: AuthContext, @Body() body: unknown) { return { data: await this.crm.createTask(auth, body) }; }

  @RequirePermission('tasks', 'write')
  @Patch('tasks/:id/complete')
  async completeTask(@CurrentUser() auth: AuthContext, @Param('id') id: string) { return { data: await this.crm.completeTask(auth, id) }; }

  @RequirePermission('tasks', 'write')
  @Patch('tasks/:id')
  async updateTask(@CurrentUser() auth: AuthContext, @Param('id') id: string, @Body() body: unknown) { return { data: await this.crm.updateTask(auth, id, body) }; }

  @RequirePermission('tasks', 'write')
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
  @Get('tags')
  async tags(@CurrentUser() auth: AuthContext) { return { data: await this.crm.tags(auth) }; }

  @RequirePermission('contacts', 'write')
  @Post('tags')
  async createTag(@CurrentUser() auth: AuthContext, @Body() body: { name: string; color?: string }) { return { data: await this.crm.createTag(auth, body) }; }

  @RequirePermission('contacts', 'write')
  @Patch('tags/:id')
  async updateTag(@CurrentUser() auth: AuthContext, @Param('id') id: string, @Body() body: { name?: string; color?: string }) { return { data: await this.crm.updateTag(auth, id, body) }; }

  @RequirePermission('contacts', 'write')
  @Delete('tags/:id')
  async deleteTag(@CurrentUser() auth: AuthContext, @Param('id') id: string) { return { data: await this.crm.deleteTag(auth, id) }; }

  @RequirePermission('contacts', 'read')
  @Get('custom-fields')
  async customFields(@CurrentUser() auth: AuthContext, @Query('entityType') entityType?: string) { return { data: await this.crm.customFields(auth, entityType) }; }

  @RequirePermission('contacts', 'write')
  @Post('custom-fields')
  async createCustomField(@CurrentUser() auth: AuthContext, @Body() body: { entityType: string; key: string; label: string; fieldType: string; options?: unknown[]; required?: boolean; position?: number }) { return { data: await this.crm.createCustomField(auth, body) }; }

  @RequirePermission('contacts', 'write')
  @Patch('custom-fields/:id')
  async updateCustomField(@CurrentUser() auth: AuthContext, @Param('id') id: string, @Body() body: { label?: string; options?: unknown[]; required?: boolean; position?: number }) { return { data: await this.crm.updateCustomField(auth, id, body) }; }

  @RequirePermission('contacts', 'write')
  @Delete('custom-fields/:id')
  async deleteCustomField(@CurrentUser() auth: AuthContext, @Param('id') id: string) { return { data: await this.crm.deleteCustomField(auth, id) }; }

  @RequirePermission('contacts', 'read')
  @Get('segments')
  async segments(@CurrentUser() auth: AuthContext) { return { data: await this.crm.segments(auth) }; }

  @RequirePermission('contacts', 'write')
  @Post('segments')
  async createSegment(@CurrentUser() auth: AuthContext, @Body() body: { name: string; description?: string; filters?: Record<string, unknown>; contactIds?: string[] }) { return { data: await this.crm.createSegment(auth, body) }; }

  @RequirePermission('contacts', 'write')
  @Patch('segments/:id')
  async updateSegment(@CurrentUser() auth: AuthContext, @Param('id') id: string, @Body() body: { name?: string; description?: string; filters?: Record<string, unknown>; contactIds?: string[] }) { return { data: await this.crm.updateSegment(auth, id, body) }; }

  @RequirePermission('contacts', 'write')
  @Delete('segments/:id')
  async deleteSegment(@CurrentUser() auth: AuthContext, @Param('id') id: string) { return { data: await this.crm.deleteSegment(auth, id) }; }
}
