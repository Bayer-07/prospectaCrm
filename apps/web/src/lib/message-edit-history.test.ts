import { describe, expect, it } from 'vitest';
import { isMessageEdited, messageEditedAt, messageEditHistory } from './message-edit-history';

describe('histórico de edição de mensagens', () => {
  it('mantém somente versões anteriores válidas', () => {
    const message = {
      payload: {
        edited: true,
        editedAt: '2026-07-27T14:30:00.000Z',
        editHistory: [
          { text: 'Texto original', editedAt: '2026-07-27T14:20:00.000Z', editedBy: 'user-1' },
          null,
          { text: 'Segunda versão', editedAt: '2026-07-27T14:30:00.000Z', editedBy: null },
          { editedAt: '2026-07-27T14:31:00.000Z' },
        ],
      },
    };

    expect(messageEditHistory(message)).toEqual([
      { text: 'Texto original', editedAt: '2026-07-27T14:20:00.000Z', editedBy: 'user-1' },
      { text: 'Segunda versão', editedAt: '2026-07-27T14:30:00.000Z', editedBy: null },
    ]);
    expect(messageEditedAt(message)).toBe('2026-07-27T14:30:00.000Z');
    expect(isMessageEdited(message)).toBe(true);
  });

  it('reconhece mensagens legadas marcadas como editadas', () => {
    expect(isMessageEdited({ payload: { edited: true } })).toBe(true);
    expect(isMessageEdited({ payload: {} })).toBe(false);
    expect(isMessageEdited({})).toBe(false);
  });
});
