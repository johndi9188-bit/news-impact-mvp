export type NewsItem = {
  id: string;
  title: string;
  /** 服务端批量翻译；与英文并列展示 */
  titleZh?: string;
  link: string;
  publishedAt: string;
  source: string;
  summary?: string;
  summaryZh?: string;
  /** AI 重要性评分 1–10；越高越重要（央行/政策/重大事件等） */
  importance?: number;
};

export type NewsPayload = {
  items: NewsItem[];
  cachedAt: string;
  stale?: boolean;
  warning?: string;
};

export type AssetImpact = {
  symbol?: string;
  name: string;
  assetClass: string;
  direction: "up" | "down" | "uncertain";
  horizon: "short" | "medium" | "long";
  rationale: string;
};

export type StockCandidate = {
  symbol?: string;
  name: string;
  rationale: string;
};

export type AnalysisResult = {
  thesis: string;
  channels: string[];
  /** 事件 → 市场传导的分步推演（有序） */
  impactChain: string[];
  /** 整体市场情绪倾向（相对基准假设下的风险偏好） */
  marketSentiment: "bullish" | "bearish" | "neutral" | "mixed";
  sentimentRationale: string;
  /** 若新闻可能波及 A 股相关标的（行业/指数/个股） */
  aShareCandidates: StockCandidate[];
  /** 若新闻可能波及美股相关标的 */
  usShareCandidates: StockCandidate[];
  assets: AssetImpact[];
  caveats: string;
  disclaimer: string;
};
