import { NextRequest } from "next/server";

const MUSIC_SERVER = process.env.MUSIC_SERVER || "http://127.0.0.1:8000";

const PASSTHROUGH = ["content-type", "content-length", "content-disposition"];

export async function GET(
  request: NextRequest,
  { params }: { params: { videoId: string } }
) {
  const { videoId } = params;
  if (!/^[A-Za-z0-9_-]{5,20}$/.test(videoId)) {
    return new Response("bad id", { status: 400 });
  }
  const name = request.nextUrl.searchParams.get("name") ?? "track";
  try {
    const upstream = await fetch(
      `${MUSIC_SERVER}/download/${videoId}?name=${encodeURIComponent(name)}`,
      { cache: "no-store" }
    );
    const headers = new Headers();
    for (const h of PASSTHROUGH) {
      const value = upstream.headers.get(h);
      if (value) headers.set(h, value);
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers,
    });
  } catch {
    return new Response("Music service unreachable", { status: 502 });
  }
}

export const dynamic = "force-dynamic";