import type {
  AnalysisResult,
  AssetImpact,
  StockCandidate,
} from "@/types/news";
import { getOpenAIClient } from "@/lib/openaiClient";

const MAX_SNIPPET = 4000;

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}

const directions = new Set<AssetImpact["direction"]>(["up", "down", "uncertain"]);
const horizons = new Set<AssetImpact["horizon"]>(["short", "medium", "long"]);
const sentiments = new Set<AnalysisResult["marketSentiment"]>([
  "bullish",
  "bearish",
  "neutral",
  "mixed",
]);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseAsset(raw: unknown): AssetImpact | null {
  if (!isRecord(raw)) return null;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const assetClass =
    typeof raw.assetClass === "string" ? raw.assetClass.trim() : "";
  const rationale =
    typeof raw.rationale === "string" ? raw.rationale.trim() : "";
  const direction = raw.direction;
  const horizon = raw.horizon;
  if (!name || !assetClass || !rationale) return null;
  if (
    typeof direction !== "string" ||
    !directions.has(direction as AssetImpact["direction"])
  )
    return null;
  if (
    typeof horizon !== "string" ||
    !horizons.has(horizon as AssetImpact["horizon"])
  )
    return null;
  const symbol =
    typeof raw.symbol === "string" && raw.symbol.trim()
      ? raw.symbol.trim()
      : undefined;
  return {
    symbol,
    name,
    assetClass,
    direction: direction as AssetImpact["direction"],
    horizon: horizon as AssetImpact["horizon"],
    rationale,
  };
}

function parseStockCandidate(raw: unknown): StockCandidate | null {
  if (!isRecord(raw)) return null;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const rationale =
    typeof raw.rationale === "string" ? raw.rationale.trim() : "";
  if (!name || !rationale) return null;
  const symbol =
    typeof raw.symbol === "string" && raw.symbol.trim()
      ? raw.symbol.trim()
      : undefined;
  return { symbol, name, rationale };
}

function parseAnalysisJson(text: string): AnalysisResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new Error("模型返回非合法 JSON");
  }
  if (!isRecord(parsed)) {
    throw new Error("JSON 根节点必须为对象");
  }
  const thesis = typeof parsed.thesis === "string" ? parsed.thesis.trim() : "";
  const caveats = typeof parsed.caveats === "string" ? parsed.caveats.trim() : "";
  const disclaimer =
    typeof parsed.disclaimer === "string"
      ? parsed.disclaimer.trim()
      : "本分析仅为基于公开信息的推测，不构成投资建议。";

  if (!thesis || !caveats) {
    throw new Error("缺少 thesis 或 caveats 字段");
  }

  const sentimentRaw =
    typeof parsed.marketSentiment === "string"
      ? parsed.marketSentiment.trim()
      : "neutral";
  const marketSentiment = sentiments.has(
    sentimentRaw as AnalysisResult["marketSentiment"],
  )
    ? (sentimentRaw as AnalysisResult["marketSentiment"])
    : "neutral";

  const sentimentRationale =
    typeof parsed.sentimentRationale === "string"
      ? parsed.sentimentRationale.trim()
      : "";

  const channels: string[] = [];
  if (Array.isArray(parsed.channels)) {
    for (const c of parsed.channels) {
      if (typeof c === "string" && c.trim()) channels.push(c.trim());
    }
  }

  const impactChain: string[] = [];
  if (Array.isArray(parsed.impactChain)) {
    for (const c of parsed.impactChain) {
      if (typeof c === "string" && c.trim()) impactChain.push(c.trim());
    }
  }
  const chain =
    impactChain.length > 0
      ? impactChain
      : channels.length > 0
        ? [...channels]
        : [thesis];

  const aShareCandidates: StockCandidate[] = [];
  if (Array.isArray(parsed.aShareCandidates)) {
    for (const a of parsed.aShareCandidates) {
      const p = parseStockCandidate(a);
      if (p) aShareCandidates.push(p);
    }
  }

  const usShareCandidates: StockCandidate[] = [];
  if (Array.isArray(parsed.usShareCandidates)) {
    for (const a of parsed.usShareCandidates) {
      const p = parseStockCandidate(a);
      if (p) usShareCandidates.push(p);
    }
  }

  const assets: AssetImpact[] = [];
  if (Array.isArray(parsed.assets)) {
    for (const a of parsed.assets) {
      const p = parseAsset(a);
      if (p) assets.push(p);
    }
  }

  if (assets.length === 0) {
    throw new Error("assets 为空或全部无法解析");
  }

  return {
    thesis,
    channels,
    impactChain: chain,
    marketSentiment,
    sentimentRationale,
    aShareCandidates,
    usShareCandidates,
    assets,
    caveats,
    disclaimer,
  };
}

const SYSTEM_PROMPT = `你是金融市场研究员助理。用户会提供一条资讯（新闻标题、摘要或宏观数据说明）。
请基于公开常识推理：市场情绪倾向、传导链路，以及对广义资产与具体股票市场（含 A 股、美股）的可能映射。

硬性规则：
1. 输出必须是单一 JSON 对象，不要 Markdown，不要代码围栏。
2. 必填键：
   - thesis（字符串）：一句话概括。
   - channels（字符串数组）：宏观/行业等粗略传导维度。
   - impactChain（字符串数组，至少 3 条）：按因果顺序写「事件→渠道→资产反应」的推演步骤，每一步一行。
   - marketSentiment（只能是 bullish / bearish / neutral / mixed）：相对中性基准下的风险偏好/折价溢价倾向。
   - sentimentRationale（字符串）：为何给出上述情绪判断（短）。
   - aShareCandidates（数组）：若与中国内地权益市场有关则列出可能的股票或行业映射；无关可为空数组。
   - usShareCandidates（数组）：若与美国权益市场有关则列出可能的股票或行业映射；无关可为空数组。
   - assets（数组）：更广义的资产类别条目。
   - caveats（字符串）。
   - disclaimer（字符串）：必须声明不构成投资建议。

3. aShareCandidates / usShareCandidates 每项含：name、rationale；symbol 可选（A 股示例 600519.SH / 美股 AAPL），仅在较确定时填写。
4. assets 每项必须含：name、assetClass、direction（up/down/uncertain）、horizon（short/medium/long）、rationale。
5. 禁止凭空捏造不存在的事件细节；不确定时用 neutral/mixed 并在 caveats 说明。
6. 语言：中文简体为主；专有名词可保留英文缩写。

情绪含义提示：
- bullish：偏风险偏好 / 对风险资产相对有利 interpreted broadly；
- bearish：偏避险 / 折价 interpreted broadly；
- neutral：方向不明确；
- mixed：分项多空并存。`;

export async function analyzeMarketImpact(input: {
  title: string;
  summary?: string;
  link?: string;
  contentSnippet?: string;
}): Promise<AnalysisResult> {
  const client = getOpenAIClient();
  if (!client) {
    throw new Error("缺少环境变量 OPENAI_API_KEY");
  }
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const userPayload = {
    title: input.title,
    summary: input.summary ?? "",
    link: input.link ?? "",
    contentSnippet: input.contentSnippet
      ? truncate(input.contentSnippet, MAX_SNIPPET)
      : "",
  };

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.35,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: JSON.stringify(userPayload),
      },
    ],
  });

  const text = completion.choices[0]?.message?.content?.trim();
  if (!text) {
    throw new Error("模型未返回内容");
  }

  return parseAnalysisJson(text);
}
