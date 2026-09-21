import { NextRequest, NextResponse } from "next/server";

const MUSIC_SERVER = process.env.MUSIC_SERVER || "http://127.0.0.1:8000";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") ?? "";
  if (!q.trim()) {
    return NextResponse.json({ error: "missing q" }, { status: 400 });
  }
  try {
    const upstream = await fetch(
      `${MUSIC_SERVER}/search?q=${encodeURIComponent(q)}`,
      { cache: "no-store" }
    );
    const body = await upstream.json();
    if (!upstream.ok) {
      return NextResponse.json(body, { status: upstream.status });
    }
    return NextResponse.json(body);
  } catch (err) {
    return NextResponse.json(
      { error: `Music service unreachable: ${(err as Error).message}` },
      { status: 502 }
    );
  }
}

export const dynamic = "force-dynamic";