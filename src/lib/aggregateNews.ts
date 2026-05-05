import type { NewsItem, NewsPayload } from "@/types/news";
import { fetchFinnhubGeneralNews } from "@/lib/finnhub";
import { fetchFredDigestItems } from "@/lib/fred";
import { getRSSItemsPartial } from "@/lib/rss";

const CACHE_TTL_MS = 120_000;

let cache: { items: NewsItem[]; fetchedAt: number } | null = null;
let lastGood: { items: NewsItem[]; fetchedAt: number } | null = null;

async function enrichTranslations(items: NewsItem[]): Promise<NewsItem[]> {
  if (!process.env.OPENAI_API_KEY) return items;
  try {
    const { attachChineseTranslations } = await import("@/lib/translateNews");
    return await attachChineseTranslations(items);
  } catch {
    // Optional enrichment only: if SDK/runtime differs on edge, keep core feed available.
    return items;
  }
}

function mergeAndDedupe(batches: NewsItem[][]): NewsItem[] {
  const map = new Map<string, NewsItem>();
  for (const batch of batches) {
    for (const it of batch) {
      const key = it.link.trim().toLowerCase();
      const existing = map.get(key);
      if (
        !existing ||
        new Date(it.publishedAt) > new Date(existing.publishedAt)
      ) {
        map.set(key, { ...it, link: it.link.trim() });
      }
    }
  }
  return [...map.values()].sort(
    (a, b) =>
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );
}

export async function collectAndEnrichNews(): Promise<{
  items: NewsItem[];
  warning?: string;
}> {
  const errors: string[] = [];
  const batches: NewsItem[][] = [];

  const rss = await getRSSItemsPartial();
  if (rss.items.length > 0) batches.push(rss.items);
  if (rss.errors.length > 0) errors.push(...rss.errors);

  const finnhub = await fetchFinnhubGeneralNews();
  if (finnhub.items.length > 0) batches.push(finnhub.items);
  if (finnhub.error) errors.push(finnhub.error);

  const fred = await fetchFredDigestItems();
  if (fred.items.length > 0) batches.push(fred.items);
  if (fred.error) errors.push(fred.error);

  if (batches.length === 0) {
    throw new Error(errors.join("; ") || "所有新闻源均不可用");
  }

  let items = mergeAndDedupe(batches);
  items = await enrichTranslations(items.slice(0, 80));

  const warning =
    errors.length > 0 ? `部分源暂时不可用：${errors.join(" | ")}` : undefined;
  return { items, warning };
}

export async function getNewsPayload(forceRefresh = false): Promise<NewsPayload> {
  const now = Date.now();
  if (
    !forceRefresh &&
    cache &&
    now - cache.fetchedAt < CACHE_TTL_MS
  ) {
    return {
      items: cache.items,
      cachedAt: new Date(cache.fetchedAt).toISOString(),
    };
  }

  try {
    const { items, warning } = await collectAndEnrichNews();
    cache = { items, fetchedAt: now };
    lastGood = { items, fetchedAt: now };
    return {
      items,
      cachedAt: new Date(now).toISOString(),
      ...(warning ? { warning } : {}),
    };
  } catch (e) {
    const fallback = lastGood ?? cache;
    const msg = e instanceof Error ? e.message : String(e);
    if (fallback) {
      return {
        items: fallback.items,
        cachedAt: new Date(fallback.fetchedAt).toISOString(),
        stale: true,
        warning: `拉取失败，已显示上次成功缓存：${msg}`,
      };
    }
    throw e;
  }
}
