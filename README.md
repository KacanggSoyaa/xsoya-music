# xSoya Music

Free music player that plays Spotify playlists by resolving each track to
YouTube audio via `yt-dlp`. No Spotify Premium required for playback.

- **svelte/** — SvelteKit (Svelte 5, TypeScript) frontend: UI, Spotify import,
  OAuth login, playback proxies
- **server/** — Python FastAPI service: YouTube search, audio streaming, download

> Only use this for content you have the right to access. Respect Spotify's and
> YouTube's terms of service.

## Requirements

- Node.js 18+
- Python 3.10+

## Setup

### 1. Python music service

```powershell
cd server
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
```

### 2. Web app

```powershell
cd svelte
npm install
```

### 3. Spotify credentials (optional)

**Playlist import by URL works with no credentials at all** — xSoya reads
public playlists through Spotify's public web player API, so no Premium is
required. Logging in with Spotify is only needed to load **private** playlists.

To enable login (and the official Web API path):

1. Create a free app at https://developer.spotify.com/dashboard
2. In the app settings, add redirect URI: `http://127.0.0.1:3000/api/auth/callback`
   (Spotify rejects `localhost` and plain `http`; only loopback IPs like
   `127.0.0.1` are allowed over http.)
3. Copy `svelte/.env.local.example` to `svelte/.env.local` and fill in:
   - `SPOTIFY_CLIENT_ID`
   - `SPOTIFY_CLIENT_SECRET`

> Note: since Feb 2026, Spotify's official Web API returns `403` unless the
> account that owns the developer app has Premium. That only affects the
> official login path; the default public-playlist import below does not need
> it.

## Run

Two terminals:

```powershell
# terminal 1 — music service (http://127.0.0.1:8000)
cd server
.\.venv\Scripts\python -m uvicorn main:app --port 8000
```

```powershell
# terminal 2 — web app (http://127.0.0.1:3000)
cd svelte
npm run dev
```

Open http://127.0.0.1:3000 (use 127.0.0.1, not localhost, so Spotify login works).

## Usage

- **Spotify playlist URL** — paste `https://open.spotify.com/playlist/...` and
  click Load. Works for public playlists with no login or Premium. Log in if the
  playlist is private.
- **Pasted list** — paste one track per line (`Artist - Title`) and click Load.
  Works with no setup.
- **Vibes** — instant preset playlists (Lo-fi Chill, Workout, Deep Focus).
  Edit or add your own; they're saved in the browser.
- **Search** — type any song and play it instantly.
- **Playback** — click a track, or use prev/play/next. Tracks resolve to YouTube
  in the background (two at a time). Space toggles play/pause, ←/→ seek ±10s,
  Ctrl+←/→ jump tracks.
- **Download** — the ⤓ button in the player saves the current track's audio.

## API

| Endpoint | Description |
| --- | --- |
| `GET /api/playlist?url=` | Import a Spotify playlist or parse a pasted list |
| `GET /api/search?q=` | Resolve a track to a YouTube video |
| `GET /api/stream/{videoId}` | Range-aware audio stream proxy |
| `GET /api/download/{videoId}?name=` | Download audio as a file |
| `GET /api/auth/login` \| `callback` \| `logout` \| `me` | Spotify OAuth |

## Notes

- Public playlists are read through Spotify's public web player API (same one
  open.spotify.com uses) — no credentials or Premium required. Please use it
  reasonably.
- Audio is streamed from YouTube; direct URLs are cached for ~1 hour.
- Downloads are the raw audio stream (`.m4a`/`.webm`); convert with ffmpeg if
  you need `.mp3`.
- Spotify's public embed no longer exposes track lists, so URL import requires
  the Web API (login or client credentials).