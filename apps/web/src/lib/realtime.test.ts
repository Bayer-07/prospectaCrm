import { describe, expect, it } from 'vitest';
import { mergeLatestHistory, type RealtimeHistoryData, type RealtimeHistoryItem } from './realtime';

const message = (position: number, text = `Mensagem ${position}`): RealtimeHistoryItem => ({
  id: `message-${String(position).padStart(2, '0')}`,
  createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, position)).toISOString(),
  text,
});

describe('atualizacao incremental do historico', () => {
  it('mescla apenas a janela recente sem perder a mensagem deslocada da pagina', () => {
    const current: RealtimeHistoryData = {
      pages: [{ data: { messages: Array.from({ length: 30 }, (_, index) => message(index + 1)), events: [], nextCursor: 'message-01' } }],
      pageParams: [''],
    };
    const latest = { data: { messages: Array.from({ length: 30 }, (_, index) => message(index + 2)), events: [], nextCursor: 'message-02' } };

    const merged = mergeLatestHistory(current, latest)!;

    expect(merged.pages).toHaveLength(2);
    expect(merged.pages.flatMap((page) => page.data.messages)).toHaveLength(31);
    expect(merged.pages.flatMap((page) => page.data.messages).some((item) => item.id === 'message-01')).toBe(true);
    expect(merged.pages.at(-1)?.data.nextCursor).toBe('message-01');
  });

  it('substitui os dados atualizados da mesma mensagem sem duplicar', () => {
    const current: RealtimeHistoryData = { pages: [{ data: { messages: [message(1, 'Antiga')], events: [], nextCursor: null } }], pageParams: [''] };
    const latest = { data: { messages: [message(1, 'Atualizada')], events: [], nextCursor: null } };

    const merged = mergeLatestHistory(current, latest)!;

    expect(merged.pages[0].data.messages).toHaveLength(1);
    expect(merged.pages[0].data.messages[0].text).toBe('Atualizada');
  });
});
