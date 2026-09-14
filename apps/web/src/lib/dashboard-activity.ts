export type ActivityPeriodMode = 'today' | 'custom';
export type ActivityGranularity = 'hour' | 'day';

export type ActivitySeriesItem = {
  date: string;
  category: string;
  count: number;
};

export type ActivityChartRow = Record<string, string | number> & { date: string };

function pad(value: number) {
  return String(value).padStart(2, '0');
}

export function localDateKey(value = new Date()) {
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

function parseLocalDate(value: string, endOfDay = false) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 999 : 0,
  );
  return localDateKey(date) === value ? date : null;
}

export function activityRequestRange(mode: ActivityPeriodMode, customFrom: string, customTo: string) {
  const today = localDateKey();
  const fromKey = mode === 'today' ? today : customFrom;
  const toKey = mode === 'today' ? today : customTo;
  const from = parseLocalDate(fromKey);
  const to = parseLocalDate(toKey, true);
  if (!from || !to || from > to) return null;
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    fromKey,
    toKey,
    granularity: fromKey === toKey ? 'hour' as const : 'day' as const,
  };
}

export function buildActivityChartSeries(
  items: ActivitySeriesItem[],
  options: { granularity: ActivityGranularity; fromKey: string; toKey: string; throughHour?: number },
) {
  const rows = new Map<string, ActivityChartRow>();
  if (options.granularity === 'hour') {
    const lastHour = Math.min(Math.max(options.throughHour ?? 23, 0), 23);
    for (let hour = 0; hour <= lastHour; hour += 1) {
      const key = `${options.fromKey}T${pad(hour)}:00:00`;
      rows.set(key, { date: key });
    }
  } else {
    const from = parseLocalDate(options.fromKey);
    const to = parseLocalDate(options.toKey);
    if (from && to) {
      for (const cursor = new Date(from); cursor <= to; cursor.setDate(cursor.getDate() + 1)) {
        const key = localDateKey(cursor);
        rows.set(key, { date: key });
      }
    }
  }

  items.forEach((item) => {
    const key = options.granularity === 'hour'
      ? `${item.date.slice(0, 13)}:00:00`
      : item.date.slice(0, 10);
    const row = rows.get(key);
    if (!row) return;
    row[item.category] = Number(row[item.category] || 0) + item.count;
  });
  return [...rows.values()];
}
