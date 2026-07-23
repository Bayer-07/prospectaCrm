import { Body, Controller, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { RequirePermission } from '../auth/permission.decorator.js';
import type { AuthContext } from '../auth/types.js';
import { UsersService } from './users.service.js';

@ApiTags('Usuários e acessos')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @RequirePermission('users', 'read')
  @Get()
  async list(@CurrentUser() auth: AuthContext) { return { data: await this.users.list(auth) }; }

  @Get('metadata')
  async metadata(@CurrentUser() auth: AuthContext) { return { data: await this.users.metadata(auth) }; }

  @Patch('me')
  async profile(@CurrentUser() auth: AuthContext, @Body() body: { name: string; email: string }) {
    return { data: await this.users.updateMyProfile(auth, body) };
  }

  @Patch('me/preferences')
  async preferences(@CurrentUser() auth: AuthContext, @Body() body: { messageSignatureEnabled: boolean }) {
    return { data: await this.users.updateMyPreferences(auth, body) };
  }

  @RequirePermission('users', 'write')
  @Post('invite')
  async invite(@CurrentUser() auth: AuthContext, @Body() body: { name: string; email: string; roleId: string; teamId?: string }) {
    return { data: await this.users.createInvite(auth, body) };
  }

  @RequirePermission('users', 'write')
  @Post(':id/reset-link')
  async reset(@CurrentUser() auth: AuthContext, @Param('id') id: string) {
    return { data: await this.users.createReset(auth, id) };
  }

  @RequirePermission('api_keys', 'write')
  @Post('api-keys')
  async apiKey(@CurrentUser() auth: AuthContext, @Body() body: { name: string; scopes: string[]; expiresAt?: string }) {
    return { data: await this.users.createApiKey(auth, body) };
  }

  @RequirePermission('users', 'write')
  @Put('roles/:id/permissions')
  async permissions(@CurrentUser() auth: AuthContext, @Param('id') id: string, @Body() body: { permissions: Array<{ resource: string; action: string; scope: 'ALL' | 'TEAM' | 'OWN' }> }) {
    return { data: await this.users.updateRolePermissions(auth, id, body.permissions) };
  }
}
