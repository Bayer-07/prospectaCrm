import { createContext, useContext } from 'react';
import type { Envelope } from './api';

export type RealtimeHistoryItem = { id: string; createdAt: string; [key: string]: unknown };
export type RealtimeHistoryPage = {
  messages: RealtimeHistoryItem[];
  events: RealtimeHistoryItem[];
  nextCursor: string | null;
};
export type RealtimeHistoryData = {
  pages: Array<Envelope<RealtimeHistoryPage>>;
  pageParams: unknown[];
};

export function mergeLatestHistory(current: RealtimeHistoryData | undefined, latest: Envelope<RealtimeHistoryPage>, pageSize = 30) {
  if (!current?.pages.length) return current;
  const messages = new Map<string, RealtimeHistoryItem>();
  for (const page of current.pages) for (const message of page.data.messages) messages.set(message.id, message);
  for (const message of latest.data.messages) messages.set(message.id, message);
  const ordered = [...messages.values()].sort((left, right) => {
    const byDate = new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    return byDate || right.id.localeCompare(left.id);
  });
  const previousLastCursor = current.pages.at(-1)?.data.nextCursor || null;
  const pageCount = Math.max(1, Math.ceil(ordered.length / pageSize));
  const pages = Array.from({ length: pageCount }, (_, index) => {
    const descending = ordered.slice(index * pageSize, (index + 1) * pageSize);
    const ascending = [...descending].reverse();
    const template = current.pages[Math.min(index, current.pages.length - 1)] || current.pages[0];
    const nextCursor = index < pageCount - 1 ? ascending[0]?.id || null : previousLastCursor;
    return {
      ...template,
      data: {
        ...template.data,
        messages: ascending,
        events: index === 0
          ? [...new Map([...current.pages[0].data.events, ...latest.data.events].map((item) => [item.id, item])).values()]
          : template.data.events,
        nextCursor,
      },
    };
  });
  const pageParams = pages.map((_page, index) => index === 0 ? '' : pages[index - 1].data.nextCursor || '');
  return { pages, pageParams };
}

export const RealtimeContext = createContext(false);

export function useRealtimeConnected() {
  return useContext(RealtimeContext);
}
