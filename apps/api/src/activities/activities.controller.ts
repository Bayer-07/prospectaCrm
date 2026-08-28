import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { RequirePermission } from '../auth/permission.decorator.js';
import type { AuthContext } from '../auth/types.js';
import { ActivitiesService, type ActivityListQuery } from './activities.service.js';

@Controller('activities')
export class ActivitiesController {
  constructor(private readonly activities: ActivitiesService) {}

  @RequirePermission('activities', 'read')
  @Get()
  list(@CurrentUser() auth: AuthContext, @Query() query: ActivityListQuery) {
    return this.activities.list(auth, query);
  }

  @RequirePermission('activities', 'read')
  @Get(':id')
  async get(@CurrentUser() auth: AuthContext, @Param('id') id: string) {
    return { data: await this.activities.get(auth, id) };
  }

  @RequirePermission('activities', 'write')
  @Post()
  async create(@CurrentUser() auth: AuthContext, @Body() body: unknown) {
    return { data: await this.activities.create(auth, body) };
  }

  @RequirePermission('activities', 'write')
  @Patch(':id')
  async update(@CurrentUser() auth: AuthContext, @Param('id') id: string, @Body() body: unknown) {
    return { data: await this.activities.update(auth, id, body) };
  }

  @RequirePermission('activities', 'write')
  @Delete(':id')
  async remove(@CurrentUser() auth: AuthContext, @Param('id') id: string) {
    return { data: await this.activities.remove(auth, id) };
  }
}
