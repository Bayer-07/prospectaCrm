import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
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

  @Patch('me/profile-photo')
  async setProfilePhoto(@CurrentUser() auth: AuthContext, @Body() body: { mediaAssetId: string }) {
    return { data: await this.users.setMyProfilePhoto(auth, body.mediaAssetId) };
  }

  @Delete('me/profile-photo')
  async removeProfilePhoto(@CurrentUser() auth: AuthContext) {
    return { data: await this.users.removeMyProfilePhoto(auth) };
  }

  @Get(':id/profile-photo')
  async profilePhoto(
    @CurrentUser() auth: AuthContext,
    @Param('id') id: string,
    @Res() response: Response,
  ) {
    const photo = await this.users.profilePhotoUrl(auth, id);
    response.setHeader('Cache-Control', 'private, max-age=300');
    return response.redirect(302, photo.url);
  }

  @RequirePermission('users', 'write')
  @Post('invite')
  async invite(@CurrentUser() auth: AuthContext, @Body() body: { name: string; email: string; roleId: string; teamId?: string }) {
    return { data: await this.users.createInvite(auth, body) };
  }

  @RequirePermission('users', 'write')
  @Patch(':id')
  async update(
    @CurrentUser() auth: AuthContext,
    @Param('id') id: string,
    @Body() body: { name: string; email: string; roleId: string; teamId?: string | null },
  ) {
    return { data: await this.users.updateUser(auth, id, body) };
  }

  @RequirePermission('users', 'write')
  @Delete(':id')
  async remove(@CurrentUser() auth: AuthContext, @Param('id') id: string) {
    return { data: await this.users.deleteUser(auth, id) };
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
