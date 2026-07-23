import { describe, expect, it } from 'vitest';
import type { AuthContext } from '../auth/types.js';
import { conversationVisibilityWhere } from './conversation-visibility.js';

const auth = (roleKey: string, userId = 'user-1', teamId: string | null = 'team-1'): AuthContext => ({
  type: 'session', organizationId: 'org-1', userId, teamId, roleKey, name: 'Usuário', permissions: [],
});

describe('visibilidade de conversas', () => {
  it('limita usuários comuns às conversas próprias e à fila sem responsável da equipe', () => {
    expect(conversationVisibilityWhere(auth('manager'), true)).toEqual({ OR: [
      { assigneeId: 'user-1' },
      { assigneeId: null, instance: { teams: { some: { teamId: 'team-1' } } } },
    ] });
  });

  it('mantém o administrador no modo próprio por padrão', () => {
    expect(conversationVisibilityWhere(auth('admin'))).toEqual({ OR: [
      { assigneeId: 'user-1' },
      { assigneeId: null },
    ] });
  });

  it('libera toda a organização somente para administrador no modo todos', () => {
    expect(conversationVisibilityWhere(auth('admin'), true)).toEqual({});
  });
});
