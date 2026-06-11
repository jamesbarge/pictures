import { z } from "zod";

export const MAX_FESTIVAL_SYNC_ITEMS = 500;
export const MAX_FILM_STATUS_SYNC_ITEMS = 5000;

export function boundedSyncArray<T extends z.ZodType>(
  itemSchema: T,
  maxItems = MAX_FESTIVAL_SYNC_ITEMS,
) {
  return z.array(itemSchema).max(maxItems);
}

export function newestByKey<T>(
  items: T[],
  getKey: (item: T) => string,
  getUpdatedAt: (item: T) => string,
): T[] {
  const newest = new Map<string, T>();

  for (const item of items) {
    const key = getKey(item);
    const existing = newest.get(key);
    if (
      !existing ||
      new Date(getUpdatedAt(item)).getTime() >= new Date(getUpdatedAt(existing)).getTime()
    ) {
      newest.set(key, item);
    }
  }

  return [...newest.values()];
}

export function idsMissingFrom(serverIds: string[], retainedIds: string[]): string[] {
  const retainedIdSet = new Set(retainedIds);
  return serverIds.filter((id) => !retainedIdSet.has(id));
}
