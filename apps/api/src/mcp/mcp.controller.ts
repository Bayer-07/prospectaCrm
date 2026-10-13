import { Controller, ForbiddenException, Get } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { RequirePermission } from '../auth/permission.decorator.js';
import type { AuthContext } from '../auth/types.js';
import { PrismaService } from '../prisma/prisma.service.js';

@ApiExcludeController()
@Controller('mcp')
export class McpController {
  constructor(private readonly db: PrismaService) {}

  @Get('context')
  context(@CurrentUser() auth: AuthContext) {
    this.assertMcpAuth(auth);
    return {
      data: {
        name: auth.name,
        userId: auth.userId ?? null,
        email: auth.email ?? null,
        scopes: auth.apiScopes ?? this.scopesFromPermissions(auth),
      },
    };
  }

  @RequirePermission('tasks', 'read')
  @Get('directory')
  async directory(@CurrentUser() auth: AuthContext) {
    this.assertMcpAuth(auth);
    const [users, teams] = await Promise.all([
      this.db.user.findMany({
        where: { organizationId: auth.organizationId, status: 'ACTIVE' },
        select: { id: true, name: true, email: true, teamId: true },
        orderBy: { name: 'asc' },
      }),
      this.db.team.findMany({
        where: { organizationId: auth.organizationId },
        select: { id: true, name: true, color: true },
        orderBy: { name: 'asc' },
      }),
    ]);
    return { data: { users, teams } };
  }

  private assertMcpAuth(auth: AuthContext) {
    if (auth.type !== 'apiKey' && auth.type !== 'session') {
      throw new ForbiddenException('Autenticação MCP inválida');
    }
  }

  private scopesFromPermissions(auth: AuthContext) {
    return [...new Set(auth.permissions.map((permission) => `${permission.resource}:${permission.action}`))];
  }
}
