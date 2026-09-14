import { describe, expect, it } from 'vitest';
import { activityRequestRange, buildActivityChartSeries } from './dashboard-activity';

describe('dashboard activity period', () => {
  it('uses hours for a custom range with only one selected day', () => {
    expect(activityRequestRange('custom', '2026-09-14', '2026-09-14')).toMatchObject({
      fromKey: '2026-09-14',
      toKey: '2026-09-14',
      granularity: 'hour',
    });
  });

  it('uses days when the custom range crosses dates', () => {
    expect(activityRequestRange('custom', '2026-09-12', '2026-09-14')).toMatchObject({
      fromKey: '2026-09-12',
      toKey: '2026-09-14',
      granularity: 'day',
    });
    expect(activityRequestRange('custom', '2026-09-15', '2026-09-14')).toBeNull();
  });

  it('creates hourly buckets including hours without activity', () => {
    const rows = buildActivityChartSeries([
      { date: '2026-09-14T09:00:00', category: 'call', count: 3 },
      { date: '2026-09-14T10:00:00', category: 'whatsapp', count: 5 },
    ], { granularity: 'hour', fromKey: '2026-09-14', toKey: '2026-09-14', throughHour: 10 });

    expect(rows).toHaveLength(11);
    expect(rows[8]).toEqual({ date: '2026-09-14T08:00:00' });
    expect(rows[9]).toEqual({ date: '2026-09-14T09:00:00', call: 3 });
    expect(rows[10]).toEqual({ date: '2026-09-14T10:00:00', whatsapp: 5 });
  });

  it('creates one bucket for every requested day', () => {
    const rows = buildActivityChartSeries([
      { date: '2026-09-12', category: 'email', count: 2 },
      { date: '2026-09-14', category: 'email', count: 4 },
    ], { granularity: 'day', fromKey: '2026-09-12', toKey: '2026-09-14' });

    expect(rows).toEqual([
      { date: '2026-09-12', email: 2 },
      { date: '2026-09-13' },
      { date: '2026-09-14', email: 4 },
    ]);
  });
});
