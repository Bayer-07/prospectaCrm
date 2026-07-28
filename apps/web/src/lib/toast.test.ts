import { describe, expect, it, vi } from 'vitest';
import { subscribeToToasts, toast, type ToastMessage } from './toast';

describe('toast', () => {
  it('emite mensagens com duração fixa de dois segundos', () => {
    const received: ToastMessage[] = [];
    const unsubscribe = subscribeToToasts((item) => received.push(item));

    toast.success('Registro salvo no teste');

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      tone: 'success',
      title: 'Tudo certo',
      message: 'Registro salvo no teste',
      durationMs: 2_000,
    });
    unsubscribe();
  });

  it('evita toasts duplicados disparados ao mesmo tempo', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-24T12:00:00Z'));
    const received: ToastMessage[] = [];
    const unsubscribe = subscribeToToasts((item) => received.push(item));

    toast.error('Falha duplicada do teste');
    toast.error('Falha duplicada do teste');

    expect(received).toHaveLength(1);
    unsubscribe();
    vi.useRealTimers();
  });
});
