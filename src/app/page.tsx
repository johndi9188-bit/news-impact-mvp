"use client";

import { useCallback, useEffect, useState } from "react";
import type { AnalysisResult, NewsItem, NewsPayload } from "@/types/news";

const POLL_MS = 25_000;

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("zh-CN", { hour12: false });
  } catch {
    return iso;
  }
}

function directionLabel(d: string): string {
  if (d === "up") return "向上 / 偏正面";
  if (d === "down") return "向下 / 偏负面";
  return "不确定";
}

function sentimentLabel(s: AnalysisResult["marketSentiment"]): string {
  if (s === "bullish") return "利好倾向 / 风险偏好";
  if (s === "bearish") return "利空倾向 / 避险";
  if (s === "mixed") return "多空交织";
  return "中性";
}

export default function Home() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [warning, setWarning] = useState<string | undefined>();
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [selected, setSelected] = useState<NewsItem | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  const loadNews = useCallback(async (forceRefresh: boolean) => {
    setLoading(true);
    setLoadError(null);
    try {
      const q = forceRefresh ? "?refresh=1" : "";
      const res = await fetch(`/api/news${q}`);
      const data = (await res.json()) as
        | NewsPayload
        | { error?: string };
      if (!res.ok) {
        setLoadError(
          (data as { error?: string }).error || `HTTP ${res.status}`,
        );
        return;
      }
      const p = data as NewsPayload;
      setItems(p.items);
      setCachedAt(p.cachedAt);
      setStale(!!p.stale);
      setWarning(p.warning);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      void loadNews(false);
    }, 0);
    return () => clearTimeout(t);
  }, [loadNews]);

  useEffect(() => {
    const id = setInterval(() => {
      void loadNews(false);
    }, POLL_MS);
    return () => clearInterval(id);
  }, [loadNews]);

  const runAnalyze = useCallback(async () => {
    if (!selected) return;
    setAnalyzing(true);
    setAnalyzeError(null);
    setAnalysis(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: selected.title,
          summary: selected.summary,
          link: selected.link,
          contentSnippet: selected.summary,
        }),
      });
      const data = (await res.json()) as
        | { analysis: AnalysisResult }
        | { error?: string };
      if (!res.ok) {
        setAnalyzeError((data as { error?: string }).error || `HTTP ${res.status}`);
        return;
      }
      setAnalysis((data as { analysis: AnalysisResult }).analysis);
    } catch (e) {
      setAnalyzeError(e instanceof Error ? e.message : String(e));
    } finally {
      setAnalyzing(false);
    }
  }, [selected]);

  const closeDrawer = () => {
    setSelected(null);
    setAnalysis(null);
    setAnalyzeError(null);
  };

  return (
    <div className="flex min-h-full flex-1 flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <header className="border-b border-zinc-200 bg-white/90 px-4 py-4 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/90 sm:px-6">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-lg font-semibold tracking-tight sm:text-xl">
              世界资讯 · 资产影响（MVP）
            </h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              聚合公开 RSS 源；点击新闻可让 AI
              推测可能受影响的资产与逻辑。非投资建议，仅供学习研究。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
            {cachedAt && (
              <span title="列表数据缓存时间">
                更新于 {formatTime(cachedAt)}
                {stale && (
                  <span className="ml-1 text-amber-600 dark:text-amber-400">
                    （缓存）
                  </span>
                )}
              </span>
            )}
            <button
              type="button"
              onClick={() => void loadNews(true)}
              disabled={loading}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
            >
              {loading ? "刷新中…" : "立即刷新"}
            </button>
          </div>
        </div>
        {warning && (
          <p className="mx-auto mt-3 max-w-5xl text-sm text-amber-700 dark:text-amber-300">
            {warning}
          </p>
        )}
        {loadError && (
          <p className="mx-auto mt-3 max-w-5xl text-sm text-red-600 dark:text-red-400">
            加载失败：{loadError}
          </p>
        )}
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-6 sm:px-6">
        <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-500">
          列表约每 {POLL_MS / 1000}{" "}
          秒自动刷新；服务端聚合缓存约 120 秒；英文标题会尝试自动译中文（需配置
          OPENAI_API_KEY）。
        </p>

        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {items.length === 0 && !loading && (
              <div className="px-4 py-10 text-center text-sm text-zinc-500">
                暂无条目。可点击「立即刷新」或检查网络。
              </div>
            )}
            {items.map((it) => (
              <button
                key={it.id}
                type="button"
                onClick={() => {
                  setSelected(it);
                  setAnalysis(null);
                  setAnalyzeError(null);
                }}
                className="flex w-full flex-col gap-1 px-4 py-3 text-left transition hover:bg-zinc-50 dark:hover:bg-zinc-800/80"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    {it.source}
                  </span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-500">
                    {formatTime(it.publishedAt)}
                  </span>
                </div>
                <div className="space-y-1">
                  <span className="font-medium text-zinc-900 dark:text-zinc-50">
                    {it.title}
                  </span>
                  {it.titleZh ? (
                    <span className="block text-sm font-medium leading-snug text-emerald-800 dark:text-emerald-200/90">
                      {it.titleZh}
                    </span>
                  ) : null}
                </div>
                {(it.summary || it.summaryZh) && (
                  <div className="space-y-1">
                    {it.summary ? (
                      <span className="line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">
                        {it.summary}
                      </span>
                    ) : null}
                    {it.summaryZh ? (
                      <span className="line-clamp-2 text-sm text-emerald-800/90 dark:text-emerald-200/80">
                        {it.summaryZh}
                      </span>
                    ) : null}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      </main>

      {selected && (
        <div className="fixed inset-0 z-40 flex justify-end">
          <button
            type="button"
            aria-label="关闭"
            className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
            onClick={closeDrawer}
          />
          <aside className="relative z-50 flex h-full w-full max-w-lg flex-col border-l border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-start justify-between gap-3 border-b border-zinc-200 px-4 py-4 dark:border-zinc-800">
              <div className="min-w-0">
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  {selected.source}
                </p>
                <div className="mt-1 space-y-1">
                  <h2 className="text-base font-semibold leading-snug text-zinc-900 dark:text-zinc-50">
                    {selected.title}
                  </h2>
                  {selected.titleZh ? (
                    <p className="text-sm font-medium leading-snug text-emerald-800 dark:text-emerald-200/90">
                      {selected.titleZh}
                    </p>
                  ) : null}
                </div>
                <a
                  href={selected.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block break-all text-sm text-blue-600 underline-offset-2 hover:underline dark:text-blue-400"
                >
                  原文链接
                </a>
                {(selected.summary || selected.summaryZh) && (
                  <div className="mt-3 space-y-1 border-t border-zinc-100 pt-3 text-sm dark:border-zinc-800">
                    {selected.summary ? (
                      <p className="text-zinc-600 dark:text-zinc-400">
                        {selected.summary}
                      </p>
                    ) : null}
                    {selected.summaryZh ? (
                      <p className="text-emerald-800 dark:text-emerald-200/85">
                        {selected.summaryZh}
                      </p>
                    ) : null}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={closeDrawer}
                className="shrink-0 rounded-md px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                关闭
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4">
              <button
                type="button"
                onClick={() => void runAnalyze()}
                disabled={analyzing}
                className="w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white shadow hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
              >
                {analyzing ? "分析中…" : "AI 分析可能影响"}
              </button>

              {analyzeError && (
                <p className="mt-4 text-sm text-red-600 dark:text-red-400">
                  {analyzeError}
                </p>
              )}

              {analysis && (
                <div className="mt-6 space-y-5 text-sm leading-relaxed">
                  <section className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900/40">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        市场情绪
                      </span>
                      <span
                        className={
                          analysis.marketSentiment === "bullish"
                            ? "rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900 dark:bg-emerald-950/80 dark:text-emerald-200"
                            : analysis.marketSentiment === "bearish"
                              ? "rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-900 dark:bg-rose-950/80 dark:text-rose-200"
                              : analysis.marketSentiment === "mixed"
                                ? "rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950/80 dark:text-amber-200"
                                : "rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-800 dark:bg-zinc-700 dark:text-zinc-100"
                        }
                      >
                        {sentimentLabel(analysis.marketSentiment)}
                      </span>
                    </div>
                    {analysis.sentimentRationale ? (
                      <p className="mt-2 text-zinc-700 dark:text-zinc-300">
                        {analysis.sentimentRationale}
                      </p>
                    ) : null}
                  </section>

                  <section>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      要点
                    </h3>
                    <p className="mt-1 text-zinc-800 dark:text-zinc-200">
                      {analysis.thesis}
                    </p>
                  </section>

                  <section>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      影响链路推演
                    </h3>
                    <ol className="mt-2 list-decimal space-y-2 pl-5 text-zinc-700 dark:text-zinc-300">
                      {analysis.impactChain.map((step, idx) => (
                        <li key={`${idx}-${step.slice(0, 24)}`}>{step}</li>
                      ))}
                    </ol>
                  </section>

                  {(analysis.aShareCandidates.length > 0 ||
                    analysis.usShareCandidates.length > 0) && (
                    <section className="grid gap-4 sm:grid-cols-2">
                      {analysis.aShareCandidates.length > 0 ? (
                        <div>
                          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                            可能涉及的 A 股映射
                          </h3>
                          <ul className="mt-2 space-y-2">
                            {analysis.aShareCandidates.map((s, idx) => (
                              <li
                                key={`cn-${idx}-${s.name}`}
                                className="rounded-md border border-zinc-200 bg-white p-2 text-xs dark:border-zinc-700 dark:bg-zinc-900/60"
                              >
                                <div className="font-medium text-zinc-900 dark:text-zinc-50">
                                  {s.name}
                                  {s.symbol ? (
                                    <span className="ml-1 font-mono text-zinc-500">
                                      {s.symbol}
                                    </span>
                                  ) : null}
                                </div>
                                <p className="mt-1 text-zinc-600 dark:text-zinc-400">
                                  {s.rationale}
                                </p>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {analysis.usShareCandidates.length > 0 ? (
                        <div>
                          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                            可能涉及的美股映射
                          </h3>
                          <ul className="mt-2 space-y-2">
                            {analysis.usShareCandidates.map((s, idx) => (
                              <li
                                key={`us-${idx}-${s.name}`}
                                className="rounded-md border border-zinc-200 bg-white p-2 text-xs dark:border-zinc-700 dark:bg-zinc-900/60"
                              >
                                <div className="font-medium text-zinc-900 dark:text-zinc-50">
                                  {s.name}
                                  {s.symbol ? (
                                    <span className="ml-1 font-mono text-zinc-500">
                                      {s.symbol}
                                    </span>
                                  ) : null}
                                </div>
                                <p className="mt-1 text-zinc-600 dark:text-zinc-400">
                                  {s.rationale}
                                </p>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </section>
                  )}

                  {analysis.channels.length > 0 && (
                    <section>
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        传导维度
                      </h3>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-zinc-700 dark:text-zinc-300">
                        {analysis.channels.map((c) => (
                          <li key={c}>{c}</li>
                        ))}
                      </ul>
                    </section>
                  )}

                  <section>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      可能相关的资产
                    </h3>
                    <ul className="mt-2 space-y-3">
                      {analysis.assets.map((a, idx) => (
                        <li
                          key={`${a.name}-${idx}`}
                          className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900/50"
                        >
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <span className="font-medium text-zinc-900 dark:text-zinc-50">
                              {a.name}
                              {a.symbol ? (
                                <span className="ml-2 font-mono text-xs text-zinc-500">
                                  {a.symbol}
                                </span>
                              ) : null}
                            </span>
                            <span className="text-xs text-zinc-500">
                              {a.assetClass} · {directionLabel(a.direction)} ·{" "}
                              {a.horizon}
                            </span>
                          </div>
                          <p className="mt-2 text-zinc-700 dark:text-zinc-300">
                            {a.rationale}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </section>

                  <section>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      注意事项
                    </h3>
                    <p className="mt-1 text-zinc-700 dark:text-zinc-300">
                      {analysis.caveats}
                    </p>
                  </section>

                  <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
                    {analysis.disclaimer}
                  </p>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
