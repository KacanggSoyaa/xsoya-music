import { NextRequest } from "next/server";

const MUSIC_SERVER = process.env.MUSIC_SERVER || "http://127.0.0.1:8000";

const PASSTHROUGH = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
  "cache-control",
  "etag",
];

export async function GET(
  request: NextRequest,
  { params }: { params: { videoId: string } }
) {
  const { videoId } = params;
  if (!/^[A-Za-z0-9_-]{5,20}$/.test(videoId)) {
    return new Response("bad id", { status: 400 });
  }
  try {
    const headers: Record<string, string> = {};
    const range = request.headers.get("range");
    if (range) headers["range"] = range;
    const upstream = await fetch(`${MUSIC_SERVER}/stream/${videoId}`, {
      headers,
      cache: "no-store",
    });
    const outHeaders = new Headers();
    for (const name of PASSTHROUGH) {
      const value = upstream.headers.get(name);
      if (value) outHeaders.set(name, value);
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers: outHeaders,
    });
  } catch (err) {
    return new Response(`Music service unreachable`, { status: 502 });
  }
}

export const dynamic = "force-dynamic";