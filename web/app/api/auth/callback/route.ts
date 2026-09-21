import { NextRequest, NextResponse } from "next/server";

import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  STATE_COOKIE,
  exchangeCode,
  isConfigured,
  redirectUri,
} from "@/lib/spotify";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const error = request.nextUrl.searchParams.get("error");
  const storedState = request.cookies.get(STATE_COOKIE)?.value;

  if (error) {
    return NextResponse.redirect(
      new URL(`/?authError=${encodeURIComponent(error)}`, request.url)
    );
  }
  if (!isConfigured()) {
    return NextResponse.redirect(
      new URL("/?authError=not_configured", request.url)
    );
  }
  if (!code || !state || state !== storedState) {
    return NextResponse.redirect(
      new URL("/?authError=invalid_state", request.url)
    );
  }

  try {
    const session = await exchangeCode(code, redirectUri(request));
    const res = NextResponse.redirect(new URL("/", request.url));
    res.cookies.set(SESSION_COOKIE, JSON.stringify(session), {
      httpOnly: true,
      path: "/",
      maxAge: SESSION_MAX_AGE,
      sameSite: "lax",
    });
    res.cookies.delete(STATE_COOKIE);
    return res;
  } catch (err) {
    return NextResponse.json(
      { error: `Login failed: ${(err as Error).message}` },
      { status: 502 }
    );
  }
}

export const dynamic = "force-dynamic";