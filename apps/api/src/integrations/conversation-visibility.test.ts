import { describe, expect, it } from 'vitest';
import type { AuthContext } from '../auth/types.js';
import { conversationVisibilityWhere } from './conversation-visibility.js';

const auth = (roleKey: string, userId = 'user-1', teamId: string | null = 'team-1'): AuthContext => ({
  type: 'session', organizationId: 'org-1', userId, teamId, roleKey, name: 'Usuário', permissions: [],
});

describe('visibilidade de conversas', () => {
  it('limita usuários comuns às filas atribuídas e aos tickets sem fila sob sua responsabilidade', () => {
    expect(conversationVisibilityWhere(auth('manager'), true)).toEqual({ OR: [
      { teamId: { in: ['team-1'] } },
      { teamId: null, assigneeId: 'user-1' },
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

  it('considera todas as associações e ignora a coluna legada quando teamIds foi carregado', () => {
    expect(conversationVisibilityWhere({ ...auth('manager'), teamId: 'legacy', teamIds: ['team-1', 'team-2'] }, true)).toEqual({ OR: [
      { teamId: { in: ['team-1', 'team-2'] } },
      { teamId: null, assigneeId: 'user-1' },
    ] });
  });

  it('não libera a Geral legada quando o usuário ficou sem associações', () => {
    expect(conversationVisibilityWhere({ ...auth('manager'), teamId: 'team-geral', teamIds: [] }, true)).toEqual({ OR: [
      { teamId: null, assigneeId: 'user-1' },
    ] });
  });
});
