import { NextRequest, NextResponse } from "next/server";

import { SESSION_COOKIE } from "@/lib/spotify";

export async function GET(request: NextRequest) {
  const res = NextResponse.redirect(new URL("/", request.url));
  res.cookies.delete(SESSION_COOKIE);
  return res;
}

export const dynamic = "force-dynamic";