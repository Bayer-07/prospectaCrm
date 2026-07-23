import { describe, expect, it } from 'vitest';
import { permissionScope, scopedWhere } from './data-scope.js';

describe('permissionScope', () => {
  it('prioriza a permissão correspondente ao recurso e ação', () => {
    const scope = permissionScope({
      type: 'session', organizationId: 'o', userId: 'u', name: 'Teste',
      permissions: [{ resource: 'contacts', action: 'read', scope: 'TEAM' }],
    }, 'contacts');
    expect(scope).toBe('TEAM');
  });

  it('gera filtros diferentes para equipe e registros próprios', () => {
    const base = { type: 'session' as const, organizationId: 'o', userId: 'u', teamId: 't', name: 'Teste' };
    expect(scopedWhere({ ...base, permissions: [{ resource: 'contacts', action: 'read', scope: 'TEAM' }] }, 'contacts')).toEqual({ teamId: 't' });
    expect(scopedWhere({ ...base, permissions: [{ resource: 'contacts', action: 'read', scope: 'OWN' }] }, 'contacts')).toEqual({ ownerId: 'u' });
    expect(scopedWhere({ ...base, permissions: [{ resource: '*', action: '*', scope: 'ALL' }] }, 'contacts')).toEqual({});
  });
});
