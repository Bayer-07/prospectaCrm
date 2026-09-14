import { describe, expect, it } from 'vitest';
import { queueTransferAssigneeId } from './inbox-queue';

describe('troca rápida de fila', () => {
  it('mantém o usuário como responsável quando o ticket já pertence a ele', () => {
    expect(queueTransferAssigneeId('user-1', 'user-1')).toBe('user-1');
  });

  it('devolve o ticket para aguardando quando não pertence ao usuário atual', () => {
    expect(queueTransferAssigneeId('user-2', 'user-1')).toBeNull();
    expect(queueTransferAssigneeId(null, 'user-1')).toBeNull();
  });
});
