import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { analyzeMarketImpact } from "@/lib/llm";
import { getClientIp, rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
export const runtime = "edge";

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!rateLimit(`analyze:${ip}`, MAX_PER_WINDOW, WINDOW_MS)) {
    return NextResponse.json(
      { error: "请求过于频繁，请稍后再试。" },
      { status: 429 },
    );
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "服务器未配置 OPENAI_API_KEY。" },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体须为 JSON。" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "无效的请求体。" }, { status: 400 });
  }

  const title =
    typeof (body as { title?: unknown }).title === "string"
      ? (body as { title: string }).title.trim()
      : "";
  if (!title) {
    return NextResponse.json({ error: "缺少 title。" }, { status: 400 });
  }

  const summary =
    typeof (body as { summary?: unknown }).summary === "string"
      ? (body as { summary: string }).summary.trim()
      : undefined;
  const link =
    typeof (body as { link?: unknown }).link === "string"
      ? (body as { link: string }).link.trim()
      : undefined;
  const contentSnippet =
    typeof (body as { contentSnippet?: unknown }).contentSnippet === "string"
      ? truncate((body as { contentSnippet: string }).contentSnippet.trim(), 4000)
      : undefined;

  try {
    const analysis = await analyzeMarketImpact({
      title,
      summary,
      link,
      contentSnippet,
    });
    return NextResponse.json({ analysis });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
