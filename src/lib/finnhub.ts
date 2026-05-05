import type { NewsItem } from "@/types/news";
import { stableId } from "@/lib/id";

const FETCH_TIMEOUT_MS = 10_000;
const BASE = "https://finnhub.io/api/v1";

type FinnhubNewsRow = {
  id?: number;
  headline?: string;
  summary?: string;
  url?: string;
  datetime?: number;
  source?: string;
};

export async function fetchFinnhubGeneralNews(): Promise<{
  items: NewsItem[];
  error?: string;
}> {
  const token = process.env.FINNHUB_API_KEY?.trim();
  if (!token) {
    return { items: [] };
  }

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const url = new URL(`${BASE}/news`);
    url.searchParams.set("category", "general");
    url.searchParams.set("token", token);

    const res = await fetch(url.toString(), {
      signal: controller.signal,
      headers: { "User-Agent": "NewsImpactMVP/1.0" },
    });
    if (!res.ok) {
      return {
        items: [],
        error: `Finnhub: HTTP ${res.status}`,
      };
    }
    const raw = (await res.json()) as unknown;
    if (!Array.isArray(raw)) {
      return { items: [], error: "Finnhub: 响应格式异常" };
    }

    const items: NewsItem[] = [];
    for (const row of raw.slice(0, 50) as FinnhubNewsRow[]) {
      const headline = row.headline?.trim();
      const link = row.url?.trim();
      if (!headline || !link) continue;
      const ts = row.datetime
        ? new Date(row.datetime * 1000).toISOString()
        : new Date().toISOString();
      const idBase = row.id != null ? `finnhub-${row.id}` : `finnhub-${link}`;
      const id = stableId(idBase, 24);
      const summary = row.summary?.trim() || undefined;
      const src = row.source?.trim()
        ? `Finnhub · ${row.source}`
        : "Finnhub";
      items.push({
        id,
        title: headline,
        link,
        publishedAt: ts,
        source: src,
        summary,
      });
    }
    return { items };
  } catch (e) {
    return {
      items: [],
      error: `Finnhub: ${e instanceof Error ? e.message : String(e)}`,
    };
  } finally {
    clearTimeout(t);
  }
}
