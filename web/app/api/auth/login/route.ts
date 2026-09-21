import { NextRequest, NextResponse } from "next/server";

import { STATE_COOKIE, buildAuthUrl, isConfigured } from "@/lib/spotify";

export async function GET(request: NextRequest) {
  if (!isConfigured()) {
    return NextResponse.redirect(
      new URL("/?authError=not_configured", request.url)
    );
  }
  const state = crypto.randomUUID().replace(/-/g, "");
  const res = NextResponse.redirect(buildAuthUrl(request, state));
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    path: "/",
    maxAge: 600,
    sameSite: "lax",
  });
  return res;
}

export const dynamic = "force-dynamic";