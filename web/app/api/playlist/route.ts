import { NextRequest, NextResponse } from "next/server";

import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  getClientToken,
  readSession,
  refreshSession,
} from "@/lib/spotify";

export type PlaylistTrack = {
  title: string;
  artist: string;
  duration_ms: number;
};

export type PlaylistResult = {
  name: string;
  tracks: PlaylistTrack[];
};

const PARTNER_QUERY_HASH =
  "908a5597b4d0af0489a9ad6a2d41bc3b416ff47c0884016d92bbd6822d0eb6d8";

function extractPlaylistId(input: string): string | null {
  const match = input.match(/playlist[/:]([A-Za-z0-9]+)/);
  return match ? match[1] : null;
}

function parseManualList(input: string): PlaylistTrack[] {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\s+[-–—]\s+|\t+/);
      if (parts.length >= 2) {
        return {
          title: parts[0].trim(),
          artist: parts.slice(1).join(" ").trim(),
          duration_ms: 0,
        };
      }
      return { title: line, artist: "", duration_ms: 0 };
    });
}

/* Official Web API — requires the app-owner account to have Premium (2026+). */
async function fetchSpotifyPlaylist(
  playlistId: string,
  token: string
): Promise<PlaylistResult> {
  const tracks: PlaylistTrack[] = [];
  const limit = 100;
  let offset = 0;

  while (offset < 1000) {
    const res = await fetch(
      `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=${limit}&offset=${offset}`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
    );
    if (!res.ok) throw new Error(`Spotify API ${res.status}`);
    const page = await res.json();
    for (const item of page.items ?? []) {
      const track = item?.track;
      if (!track?.name) continue;
      tracks.push({
        title: track.name,
        artist: (track.artists ?? []).map((a: any) => a.name).join(", "),
        duration_ms: track.duration_ms ?? 0,
      });
    }
    if (!page.next) break;
    offset += limit;
  }

  let name = "Spotify playlist";
  const meta = await fetch(
    `https://api.spotify.com/v1/playlists/${playlistId}?fields=name`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
  );
  if (meta.ok) {
    const data = await meta.json();
    if (data.name) name = data.name;
  }

  return { name, tracks };
}

/* Anonymous partner API used by open.spotify.com — no login/Premium needed. */
async function getPartnerToken(): Promise<string> {
  const res = await fetch("https://open.spotify.com/embed/api/token", {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`token ${res.status}`);
  const data = await res.json();
  const token = data.accessToken ?? data.access_token;
  if (!token) throw new Error("no token");
  return token;
}

async function queryPartnerPlaylist(
  token: string,
  uri: string,
  offset: number
): Promise<any> {
  const res = await fetch(
    "https://api-partner.spotify.com/pathfinder/v1/query",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        origin: "https://open.spotify.com",
        referer: "https://open.spotify.com/",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "app-platform": "MobilePlayer",
        "spotify-app-version": "1.0.0",
      },
      body: JSON.stringify({
        variables: { uri, limit: 100, offset },
        operationName: "queryPlaylist",
        extensions: {
          persistedQuery: { version: 1, sha256Hash: PARTNER_QUERY_HASH },
        },
      }),
      cache: "no-store",
    }
  );
  if (!res.ok) throw new Error(`partner ${res.status}`);
  return res.json();
}

async function fetchPartnerPlaylist(
  playlistId: string
): Promise<PlaylistResult> {
  const token = await getPartnerToken();
  const uri = `spotify:playlist:${playlistId}`;
  const tracks: PlaylistTrack[] = [];
  let offset = 0;
  let name = "Spotify playlist";

  for (let page = 0; page < 20; page++) {
    const data = await queryPartnerPlaylist(token, uri, offset);
    const pv = data?.data?.playlistV2;
    if (pv?.name) name = pv.name;
    for (const it of (pv?.content?.items ?? []) as any[]) {
      const track = it?.itemV2?.data;
      if (!track?.name) continue;
      tracks.push({
        title: track.name,
        artist: (track.artists?.items ?? [])
          .map((a: any) => a.profile?.name)
          .filter(Boolean)
          .join(", "),
        duration_ms: track.duration?.totalMilliseconds ?? 0,
      });
    }
    const next = pv?.content?.pagingInfo?.nextOffset;
    if (next == null) break;
    offset = next;
  }

  return { name, tracks };
}

async function fetchEmbedName(playlistId: string): Promise<string> {
  const res = await fetch(
    `https://open.spotify.com/embed/playlist/${playlistId}`,
    { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" }
  );
  if (!res.ok) return "Spotify playlist";
  const html = await res.text();
  const match = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/
  );
  if (!match) return "Spotify playlist";
  try {
    const data = JSON.parse(match[1]);
    return data?.props?.pageProps?.state?.data?.entity?.name ?? "Spotify playlist";
  } catch {
    return "Spotify playlist";
  }
}

export async function GET(request: NextRequest) {
  const input = (request.nextUrl.searchParams.get("url") ?? "").trim();
  if (!input) {
    return NextResponse.json({ error: "Nothing to load." }, { status: 400 });
  }

  if (input.includes("\n")) {
    const tracks = parseManualList(input);
    if (tracks.length === 0) {
      return NextResponse.json({ error: "No tracks found." }, { status: 400 });
    }
    return NextResponse.json({
      name: "Pasted list",
      tracks,
    } satisfies PlaylistResult);
  }

  const playlistId = extractPlaylistId(input);
  if (!playlistId) {
    return NextResponse.json(
      { error: "Paste a Spotify playlist link or a multi-line track list." },
      { status: 400 }
    );
  }

  /* 1) Logged-in user via official API (needed for private playlists). */
  const session = readSession(request);
  let refreshed: Awaited<ReturnType<typeof refreshSession>> | null = null;
  let userToken: string | null = null;
  if (session) {
    if (session.expires_at > Date.now() + 10_000) {
      userToken = session.access_token;
    } else if (session.refresh_token) {
      try {
        refreshed = await refreshSession(session);
        userToken = refreshed.access_token;
      } catch {
        userToken = null;
      }
    }
  }
  if (userToken) {
    try {
      const result = await fetchSpotifyPlaylist(playlistId, userToken);
      if (result.tracks.length) {
        const response = NextResponse.json(result);
        if (refreshed) {
          response.cookies.set(SESSION_COOKIE, JSON.stringify(refreshed), {
            httpOnly: true,
            path: "/",
            maxAge: SESSION_MAX_AGE,
            sameSite: "lax",
          });
        }
        return response;
      }
    } catch {
      /* fall through to anonymous path */
    }
  }

  /* 2) Anonymous partner API (public playlists, no Premium needed). */
  try {
    const result = await fetchPartnerPlaylist(playlistId);
    if (result.tracks.length) {
      return NextResponse.json(result);
    }
  } catch {
    /* fall through */
  }

  /* 3) Client credentials as a last resort. */
  const appToken = await getClientToken();
  if (appToken) {
    try {
      const result = await fetchSpotifyPlaylist(playlistId, appToken);
      if (result.tracks.length) {
        return NextResponse.json(result);
      }
    } catch {
      /* fall through */
    }
  }

  const name = await fetchEmbedName(playlistId);
  return NextResponse.json(
    {
      error:
        "Couldn't load this playlist. It may be private, or Spotify is rate-limiting requests. If the playlist is yours, log in with Spotify so it can be read.",
      playlistName: name,
    },
    { status: 404 }
  );
}

export const dynamic = "force-dynamic";