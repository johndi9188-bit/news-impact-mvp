import type { NewsItem } from "@/types/news";
import { stableId } from "@/lib/id";

const FETCH_TIMEOUT_MS = 10_000;
const BASE = "https://api.stlouisfed.org/fred";

type SeriesConfig = { id: string; titleZh: string };

const WATCHED: SeriesConfig[] = [
  { id: "CPIAUCSL", titleZh: "美国 CPI（季调，指数）" },
  { id: "UNRATE", titleZh: "美国失业率" },
  { id: "DFF", titleZh: "联邦基金有效利率" },
  { id: "T10Y2Y", titleZh: "10 年与 2 年期美债收益率利差" },
];

type ObsResponse = {
  observations?: { date?: string; value?: string }[];
};

async function fetchLatestObservation(
  apiKey: string,
  seriesId: string,
  signal: AbortSignal,
): Promise<{ date: string; value: string } | null> {
  const url = new URL(`${BASE}/series/observations`);
  url.searchParams.set("series_id", seriesId);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("file_type", "json");
  url.searchParams.set("sort_order", "desc");
  url.searchParams.set("limit", "2");

  const res = await fetch(url.toString(), {
    signal,
    headers: { "User-Agent": "NewsImpactMVP/1.0" },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as ObsResponse;
  const o = data.observations?.[0];
  if (!o?.date || o.value == null || o.value === ".") return null;
  return { date: o.date, value: o.value };
}

export async function fetchFredDigestItems(): Promise<{
  items: NewsItem[];
  error?: string;
}> {
  const apiKey = process.env.FRED_API_KEY?.trim();
  if (!apiKey) {
    return { items: [] };
  }

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const items: NewsItem[] = [];
    const signal = controller.signal;

    for (const s of WATCHED) {
      const latest = await fetchLatestObservation(apiKey, s.id, signal);
      if (!latest) continue;

      const link = `https://fred.stlouisfed.org/series/${encodeURIComponent(s.id)}`;
      const title = `[FRED] ${s.titleZh} 最新：${latest.value}（截至 ${latest.date}）`;
      const id = stableId(`fred-${s.id}-${latest.date}`, 24);
      const publishedAt = `${latest.date}T16:00:00.000Z`;

      items.push({
        id,
        title,
        link,
        publishedAt,
        source: "FRED",
        summary: `圣路易斯联储 FRED 系列 ${s.id} 最近一期观测值。数据为公开宏观序列，不等同于新闻事件。`,
      });
    }

    return { items };
  } catch (e) {
    return {
      items: [],
      error: `FRED: ${e instanceof Error ? e.message : String(e)}`,
    };
  } finally {
    clearTimeout(t);
  }
}
