import { getOpenAIClient } from "@/lib/openaiClient";
import type { NewsItem } from "@/types/news";

const BATCH = 20;

type ScoreRow = { id: string; score: number };

async function scoreChunk(
  client: NonNullable<ReturnType<typeof getOpenAIClient>>,
  chunk: { id: string; title: string; summary?: string }[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  try {
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `你是金融新闻重要性评分员。对每条新闻给出 1–10 的整数重要性评分。
评分标准：
- 9–10：影响全球或多国的重大事件（央行加降息、地缘冲突升级、系统性危机、重大政策出台）
- 7–8：重要宏观数据发布、重要央行表态、大型企业重大事件、显著市场波动
- 5–6：有一定影响的政策/行业新闻、企业财报、一般地区性事件
- 3–4：常规经济数据、企业日常公告、影响有限的行业动态
- 1–2：软新闻、观点评论、与市场关联极弱的事件

只输出 JSON：{"scores":[{"id":"...","score":数字},…]}
score 必须是 1–10 的整数，不要解释。`,
        },
        {
          role: "user",
          content: JSON.stringify({
            items: chunk.map((c) => ({
              id: c.id,
              title: c.title,
              summary: c.summary ?? "",
            })),
          }),
        },
      ],
    });
    const text = completion.choices[0]?.message?.content?.trim();
    if (!text) return result;
    const parsed = JSON.parse(text) as { scores?: unknown };
    const arr = parsed.scores;
    if (!Array.isArray(arr)) return result;
    for (const row of arr as ScoreRow[]) {
      if (!row || typeof row.id !== "string") continue;
      const s = Number(row.score);
      if (Number.isInteger(s) && s >= 1 && s <= 10) {
        result.set(row.id, s);
      }
    }
  } catch {
    /* 评分失败时保持无评分，不影响主流程 */
  }
  return result;
}

export async function attachImportanceScores(
  items: NewsItem[],
): Promise<NewsItem[]> {
  const client = getOpenAIClient();
  if (!client) return items;

  const out = items.map((it) => ({ ...it }));
  const indexById = new Map<string, number>(items.map((it, i) => [it.id, i]));

  for (let i = 0; i < items.length; i += BATCH) {
    const chunk = items.slice(i, i + BATCH).map((it) => ({
      id: it.id,
      title: it.titleZh ?? it.title,
      summary: it.summaryZh ?? it.summary,
    }));
    const scores = await scoreChunk(client, chunk);
    for (const [id, score] of scores) {
      const idx = indexById.get(id);
      if (idx !== undefined) {
        out[idx]!.importance = score;
      }
    }
  }

  return out;
}
