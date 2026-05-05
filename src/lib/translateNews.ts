import { getOpenAIClient } from "@/lib/openaiClient";
import type { NewsItem } from "@/types/news";

const BATCH = 14;

function hasLatinLetters(s: string): boolean {
  return /[a-zA-Z]{3,}/.test(s);
}

function needsTranslation(text: string | undefined): boolean {
  if (!text?.trim()) return false;
  return hasLatinLetters(text);
}

type BatchInput = { id: string; title: string; summary: string };

export async function attachChineseTranslations(
  items: NewsItem[],
): Promise<NewsItem[]> {
  const client = getOpenAIClient();
  if (!client) return items;

  const toTranslate: BatchInput[] = [];
  const indexById = new Map<string, number>();
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!it) continue;
    const tNeed = needsTranslation(it.title);
    const sNeed = needsTranslation(it.summary);
    if (!tNeed && !sNeed) continue;
    toTranslate.push({
      id: it.id,
      title: it.title,
      summary: it.summary ?? "",
    });
    indexById.set(it.id, i);
  }

  if (toTranslate.length === 0) return items;

  const out = items.map((it) => ({ ...it }));

  for (let i = 0; i < toTranslate.length; i += BATCH) {
    const chunk = toTranslate.slice(i, i + BATCH);
    const map = await translateChunk(client, chunk);
    for (const row of chunk) {
      const zh = map.get(row.id);
      const idx = indexById.get(row.id);
      if (idx === undefined || !zh) continue;
      const cur = out[idx];
      if (!cur) continue;
      if (zh.titleZh) cur.titleZh = zh.titleZh;
      if (zh.summaryZh) cur.summaryZh = zh.summaryZh;
    }
  }

  return out;
}

async function translateChunk(
  client: NonNullable<ReturnType<typeof getOpenAIClient>>,
  chunk: BatchInput[],
): Promise<Map<string, { titleZh: string; summaryZh?: string }>> {
  const result = new Map<string, { titleZh: string; summaryZh?: string }>();
  try {
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      temperature: 0.15,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `你是专业财经新闻翻译。将输入 JSON 里的每条英文标题、摘要译为简体中文（保留专有名词可读性）。
只输出 JSON：{"translations":[{"id":"...","titleZh":"...","summaryZh":"..."}]}。
若无摘要则 summaryZh 用空字符串。不要添加评论。`,
        },
        {
          role: "user",
          content: JSON.stringify({ items: chunk }),
        },
      ],
    });
    const text = completion.choices[0]?.message?.content?.trim();
    if (!text) return result;
    const parsed = JSON.parse(text) as { translations?: unknown };
    const arr = parsed.translations;
    if (!Array.isArray(arr)) return result;
    for (const row of arr) {
      if (!row || typeof row !== "object" || Array.isArray(row)) continue;
      const r = row as Record<string, unknown>;
      const id = typeof r.id === "string" ? r.id : "";
      const titleZh =
        typeof r.titleZh === "string" ? r.titleZh.trim() : "";
      const summaryZh =
        typeof r.summaryZh === "string" ? r.summaryZh.trim() : "";
      if (!id || !titleZh) continue;
      result.set(id, {
        titleZh,
        ...(summaryZh ? { summaryZh } : {}),
      });
    }
  } catch {
    /* 翻译失败则保留英文 */
  }
  return result;
}
