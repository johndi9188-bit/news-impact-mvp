import type { NewsItem } from "@/types/news";
import { stableId } from "@/lib/id";

type FeedSource = { url: string; source: string };

const FEEDS: FeedSource[] = [
  { url: "https://feeds.bbci.co.uk/news/world/rss.xml", source: "BBC World" },
  {
    url: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml",
    source: "NYT World",
  },
  {
    url: "https://www.theguardian.com/world/rss",
    source: "The Guardian",
  },
  {
    url: "https://www.aljazeera.com/xml/rss/all.xml",
    source: "Al Jazeera",
  },
];

const FETCH_TIMEOUT_MS = 12_000;

const HTTP_HEADERS: Record<string, string> = {
  "User-Agent": "NewsImpactMVP/1.0",
  Accept: "application/rss+xml, application/xml, text/xml, */*",
};

function normalizeLink(link: string): string {
  try {
    const u = new URL(link);
    u.hash = "";
    return u.href;
  } catch {
    return link.trim();
  }
}

function itemId(link: string, guid?: string): string {
  const raw = guid && guid !== link ? `${guid}::${link}` : link;
  return stableId(raw, 24);
}

function parseDate(input: { pubDate?: string; isoDate?: string }): Date {
  const s = input.isoDate || input.pubDate;
  const d = s ? new Date(s) : new Date();
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function decodeXml(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'");
}

function extractTag(block: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = block.match(re);
  if (!m?.[1]) return undefined;
  const raw = m[1]
    .replace(/^<!\[CDATA\[/i, "")
    .replace(/\]\]>$/i, "")
    .trim();
  return decodeXml(raw);
}

type ParsedRssItem = {
  title?: string;
  link?: string;
  guid?: string;
  pubDate?: string;
  isoDate?: string;
  contentSnippet?: string;
  summary?: string;
};

function parseRssItems(xml: string): ParsedRssItem[] {
  const blocks = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)];
  if (blocks.length === 0) {
    const entries = [...xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)];
    return entries.map((m) => {
      const block = m[1] ?? "";
      const atomLink =
        block.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i)?.[1] ??
        extractTag(block, "link");
      return {
        title: extractTag(block, "title"),
        link: atomLink,
        guid: extractTag(block, "id"),
        pubDate: extractTag(block, "published"),
        isoDate: extractTag(block, "updated"),
        summary: extractTag(block, "summary") ?? extractTag(block, "content"),
      };
    });
  }
  return blocks.map((m) => {
    const block = m[1] ?? "";
    return {
      title: extractTag(block, "title"),
      link: extractTag(block, "link"),
      guid: extractTag(block, "guid"),
      pubDate: extractTag(block, "pubDate"),
      isoDate: extractTag(block, "isoDate"),
      contentSnippet:
        extractTag(block, "description") ?? extractTag(block, "content:encoded"),
      summary: extractTag(block, "summary"),
    };
  });
}

async function fetchFeed(src: FeedSource): Promise<NewsItem[]> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const raw = await fetch(src.url, {
      signal: controller.signal,
      headers: HTTP_HEADERS,
    });
    if (!raw.ok) {
      throw new Error(`${src.source}: HTTP ${raw.status}`);
    }
    const text = await raw.text();
    const out: NewsItem[] = [];
    for (const item of parseRssItems(text)) {
      const link = item.link?.trim();
      if (!link || !item.title?.trim()) continue;
      const publishedAt = parseDate(item).toISOString();
      const summary =
        item.contentSnippet?.trim() ||
        item.summary?.trim() ||
        undefined;
      const norm = normalizeLink(link);
      out.push({
        id: itemId(norm, item.guid as string | undefined),
        title: item.title.trim(),
        link: norm,
        publishedAt,
        source: src.source,
        summary,
      });
    }
    return out;
  } finally {
    clearTimeout(t);
  }
}

function mergeRSSBatches(batches: NewsItem[][]): NewsItem[] {
  const map = new Map<string, NewsItem>();
  for (const batch of batches) {
    for (const it of batch) {
      const key = normalizeLink(it.link).toLowerCase();
      const existing = map.get(key);
      if (
        !existing ||
        new Date(it.publishedAt) > new Date(existing.publishedAt)
      ) {
        map.set(key, { ...it, link: normalizeLink(it.link) });
      }
    }
  }
  return [...map.values()].sort(
    (a, b) =>
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );
}

/** RSS 与其它源解耦：部分源失败仍返回已成功部分。若全部失败则 items 为空。 */
export async function getRSSItemsPartial(): Promise<{
  items: NewsItem[];
  errors: string[];
}> {
  const results = await Promise.allSettled(FEEDS.map((f) => fetchFeed(f)));
  const batches: NewsItem[][] = [];
  const errors: string[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const name = FEEDS[i]?.source ?? `feed-${i}`;
    if (r.status === "fulfilled") {
      batches.push(r.value);
    } else {
      errors.push(
        `${name}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`,
      );
    }
  }
  if (batches.length === 0) {
    return { items: [], errors };
  }
  return { items: mergeRSSBatches(batches), errors };
}
