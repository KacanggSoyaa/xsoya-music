import { NextRequest, NextResponse } from "next/server";

import { isConfigured, readSession } from "@/lib/spotify";

export async function GET(request: NextRequest) {
  const session = readSession(request);
  return NextResponse.json({
    loggedIn: Boolean(session),
    configured: isConfigured(),
  });
}

export const dynamic = "force-dynamic";