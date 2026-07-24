import { describe, expect, it } from 'vitest';
import { calculateWeekTaskLayout, snapTaskMinutes, taskDropDueAt } from './Tasks';

describe('drag and drop de tarefas', () => {
  it('preserva o horário ao mover uma tarefa no calendário mensal', () => {
    const moved = taskDropDueAt(new Date(2026, 6, 24, 14, 35), '2026-07-28');

    expect([moved.getFullYear(), moved.getMonth(), moved.getDate()]).toEqual([2026, 6, 28]);
    expect([moved.getHours(), moved.getMinutes()]).toEqual([14, 35]);
  });

  it('aplica o horário escolhido ao mover na visualização semanal', () => {
    const moved = taskDropDueAt(new Date(2026, 6, 24, 14, 35), '2026-07-29', 615);

    expect([moved.getFullYear(), moved.getMonth(), moved.getDate()]).toEqual([2026, 6, 29]);
    expect([moved.getHours(), moved.getMinutes()]).toEqual([10, 30]);
  });

  it('arredonda o posicionamento semanal para intervalos de 30 minutos', () => {
    expect(snapTaskMinutes(607)).toBe(600);
    expect(snapTaskMinutes(617)).toBe(630);
    expect(snapTaskMinutes(1500)).toBe(1410);
  });

  it('organiza tarefas próximas em camadas como no Google Agenda', () => {
    const layout = calculateWeekTaskLayout([
      { id: 'first', dueAt: new Date(2026, 6, 24, 15, 15) },
      { id: 'second', dueAt: new Date(2026, 6, 24, 15, 30) },
      { id: 'third', dueAt: new Date(2026, 6, 24, 16, 15) },
    ]);

    expect(layout).toEqual([
      { id: 'first', column: 0, columnCount: 2, stack: 0 },
      { id: 'second', column: 1, columnCount: 2, stack: 1 },
      { id: 'third', column: 0, columnCount: 2, stack: 2 },
    ]);
  });

  it('mantém largura total quando não existe conflito de horário', () => {
    const layout = calculateWeekTaskLayout([
      { id: 'morning', dueAt: new Date(2026, 6, 24, 9, 0) },
      { id: 'afternoon', dueAt: new Date(2026, 6, 24, 14, 0) },
    ]);

    expect(layout).toEqual([
      { id: 'morning', column: 0, columnCount: 1, stack: 0 },
      { id: 'afternoon', column: 0, columnCount: 1, stack: 0 },
    ]);
  });
});
