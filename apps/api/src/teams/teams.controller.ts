import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { RequirePermission } from '../auth/permission.decorator.js';
import type { AuthContext } from '../auth/types.js';
import { TeamsService } from './teams.service.js';

@ApiTags('Equipes e filas')
@Controller('teams')
export class TeamsController {
  constructor(private readonly teams: TeamsService) {}

  @RequirePermission('users', 'read')
  @Get()
  async list(@CurrentUser() auth: AuthContext) { return { data: await this.teams.list(auth) }; }

  @RequirePermission('users', 'write')
  @Post()
  async create(@CurrentUser() auth: AuthContext, @Body() body: { name: string; color: string }) {
    return { data: await this.teams.create(auth, body) };
  }

  @RequirePermission('users', 'write')
  @Patch(':id')
  async update(@CurrentUser() auth: AuthContext, @Param('id') id: string, @Body() body: { name: string; color: string }) {
    return { data: await this.teams.update(auth, id, body) };
  }

  @RequirePermission('users', 'write')
  @Delete(':id')
  async remove(@CurrentUser() auth: AuthContext, @Param('id') id: string) {
    return { data: await this.teams.remove(auth, id) };
  }
}
