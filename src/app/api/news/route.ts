import { NextResponse } from "next/server";
import { getNewsPayload } from "@/lib/aggregateNews";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const force =
      url.searchParams.get("refresh") === "1" ||
      url.searchParams.get("refresh") === "true";
    const payload = await getNewsPayload(force);
    return NextResponse.json(payload);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
