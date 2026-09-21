"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type SearchResult = {
  videoId: string;
  title: string;
  duration: number | null;
  channel?: string;
};

type TrackStatus = "pending" | "searching" | "ready" | "error";

type Track = {
  index: number;
  title: string;
  artist: string;
  duration_ms: number;
  videoId?: string;
  status: TrackStatus;
  error?: string;
};

function fmt(ms: number): string {
  if (!ms || ms <= 0) return "0:00";
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const statusGlyph: Record<TrackStatus, string> = {
  pending: "•",
  searching: "…",
  ready: "✔",
  error: "!",
};

export default function Home() {
  const [url, setUrl] = useState("");
  const [playlistName, setPlaylistName] = useState<string | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [auth, setAuth] = useState<{
    loggedIn: boolean;
    configured: boolean;
  } | null>(null);

  const [current, setCurrent] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authError = params.get("authError");
    if (authError) {
      setError(
        authError === "not_configured"
          ? "Spotify login isn't configured. Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in web/.env.local."
          : authError === "invalid_state"
            ? "That login didn't complete. Make sure you're using http://127.0.0.1:3000 and try again."
            : `Spotify login failed: ${authError}`
      );
      window.history.replaceState({}, "", "/");
    }
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then(setAuth)
      .catch(() => setAuth(null));
  }, []);

  const resolveTrack = useCallback(async (index: number, q: string) => {
    setTracks((prev) =>
      prev.map((t) => (t.index === index ? { ...t, status: "searching" } : t))
    );
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data = (await res.json()) as SearchResult & { error?: string };
      if (!res.ok) throw new Error(data.error || "search failed");
      setTracks((prev) =>
        prev.map((t) =>
          t.index === index
            ? { ...t, videoId: data.videoId, status: "ready" as TrackStatus }
            : t
        )
      );
    } catch (err) {
      setTracks((prev) =>
        prev.map((t) =>
          t.index === index
            ? {
                ...t,
                status: "error" as TrackStatus,
                error: (err as Error).message,
              }
            : t
        )
      );
    }
  }, []);

  const preload = useCallback(
    async (list: Track[]) => {
      let next = 0;
      const workers = [0, 1].map(async () => {
        while (next < list.length) {
          const i = next++;
          const t = list[i];
          await resolveTrack(t.index, `${t.title} ${t.artist}`);
        }
      });
      await Promise.all(workers);
    },
    [resolveTrack]
  );

  const loadPlaylist = useCallback(async () => {
    setError(null);
    setLoading(true);
    setCurrent(-1);
    setPlaying(false);
    setPlaylistName(null);
    setTracks([]);
    try {
      const res = await fetch(`/api/playlist?url=${encodeURIComponent(url)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "load failed");
      setPlaylistName(data.name);
      const list: Track[] = data.tracks.map(
        (t: { title: string; artist: string; duration_ms: number }, i: number) => ({
          index: i,
          title: t.title,
          artist: t.artist,
          duration_ms: t.duration_ms,
          status: "pending",
        })
      );
      setTracks(list);
      void preload(list);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [url, preload]);

  const playIndex = useCallback(
    (index: number) => {
      const track = tracks[index];
      if (!track || track.status !== "ready" || !track.videoId) return;
      if (index === current) {
        const audio = audioRef.current;
        if (!audio) return;
        if (audio.paused) void audio.play();
        else audio.pause();
        return;
      }
      setCurrent(index);
      setPlaying(true);
    },
    [tracks, current]
  );

  const step = useCallback(
    (delta: number) => {
      const target = current + delta;
      if (target >= 0 && target < tracks.length) {
        playIndex(target);
      }
    },
    [current, tracks, playIndex]
  );

  const currentTrack = current >= 0 ? tracks[current] : undefined;
  const videoId = currentTrack?.status === "ready" ? currentTrack.videoId : undefined;

  useEffect(() => {
    if (videoId && currentTrack) {
      setProgress(0);
      setDuration(0);
    }
  }, [videoId, currentTrack]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (
        el.tagName === "TEXTAREA" ||
        el.tagName === "INPUT" ||
        el.isContentEditable
      )
        return;
      const audio = audioRef.current;
      const toggle = () => {
        if (!audio) return;
        if (audio.paused) void audio.play();
        else audio.pause();
      };
      switch (e.key) {
        case " ":
        case "MediaPlayPause":
          e.preventDefault();
          toggle();
          break;
        case "ArrowUp":
        case "MediaTrackNext":
          e.preventDefault();
          step(1);
          break;
        case "ArrowDown":
        case "MediaTrackPrevious":
          e.preventDefault();
          step(-1);
          break;
        case "ArrowRight":
          if (e.ctrlKey) {
            e.preventDefault();
            step(1);
          } else if (audio && audio.duration) {
            e.preventDefault();
            audio.currentTime = Math.min(
              audio.duration,
              audio.currentTime + 10
            );
          }
          break;
        case "ArrowLeft":
          if (e.ctrlKey) {
            e.preventDefault();
            step(-1);
          } else if (audio && audio.duration) {
            e.preventDefault();
            audio.currentTime = Math.max(0, audio.currentTime - 10);
          }
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step]);

  return (
    <main className="app">
      <header className="header">
        <div className="header-top">
          <h1>🎧 xSoya Music</h1>
          <div className="auth">
            {auth?.loggedIn ? (
              <a className="auth-btn" href="/api/auth/logout">
                Log out
              </a>
            ) : auth?.configured ? (
              <a className="auth-btn" href="/api/auth/login">
                Log in with Spotify
              </a>
            ) : (
              <span className="auth-hint">Spotify login not configured</span>
            )}
          </div>
        </div>
        <div className="load-row">
          <textarea
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            rows={2}
            placeholder={
              "Paste a Spotify playlist link…\n…or a multi-line track list (Artist - Title per line)"
            }
          />
          <button onClick={loadPlaylist} disabled={loading || !url.trim()}>
            {loading ? "Loading…" : "Load"}
          </button>
        </div>
        {error && <p className="error">{error}</p>}
        {playlistName && <p className="playlist-name">{playlistName}</p>}
      </header>

      <section className="track-list">
        {tracks.length === 0 && (
          <p className="empty">
            {loading
              ? "Loading…"
              : "Paste a Spotify playlist link above to start listening for free 😄"}
          </p>
        )}
        {tracks.map((t) => (
          <div
            key={t.index}
            className={[
              "track",
              current === t.index ? "current" : "",
              t.status === "error" ? "failed" : "",
            ].join(" ")}
            onClick={() => playIndex(t.index)}
          >
            <span className="index">
              {current === t.index ? (
                <span className={`eq${playing ? "" : " paused"}`}>
                  <i />
                  <i />
                  <i />
                </span>
              ) : (
                String(t.index + 1).padStart(2, "0")
              )}
            </span>
            <div className="meta">
              <div className="title">{t.title}</div>
              <div className="artist">{t.artist}</div>
            </div>
            {t.status === "error" ? (
              <span className="badge error-badge" title={t.error}>
                ! unfound
              </span>
            ) : (
              <span className="duration">{fmt(t.duration_ms)}</span>
            )}
            <span
              className={`badge st-${t.status}`}
              title={`status: ${t.status}`}
            >
              {statusGlyph[t.status]}
            </span>
          </div>
        ))}
      </section>

      <footer className="player">
        <audio
          ref={audioRef}
          src={videoId ? `/api/stream/${videoId}` : undefined}
          autoPlay
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => step(1)}
          onTimeUpdate={(e) =>
            setProgress((e.currentTarget.currentTime / e.currentTarget.duration) * 100 || 0)
          }
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        />
        <div className="player-controls">
          <div
            className={`disc${playing ? " spin" : ""}${currentTrack ? "" : " idle"}`}
            title={currentTrack ? `${currentTrack.title} — ${currentTrack.artist}` : "Nothing playing"}
          />
          <button
            onClick={() => step(-1)}
            disabled={current <= 0}
            className="ctl"
            title="Previous (Ctrl+← / ↓)"
          >
            ⏮
          </button>
          <button
            onClick={() => playIndex(current)}
            disabled={!videoId}
            className="ctl play"
            title={playing ? "Pause (Space)" : "Play (Space)"}
          >
            {playing ? "⏸" : "▶"}
          </button>
          <button
            onClick={() => step(1)}
            disabled={current < 0 || current >= tracks.length - 1}
            className="ctl"
            title="Next (Ctrl+→ / ↑)"
          >
            ⏭
          </button>
          {videoId && currentTrack && (
            <a
              className="ctl"
              href={`/api/download/${videoId}?name=${encodeURIComponent(
                `${currentTrack.artist} - ${currentTrack.title}`
              )}`}
              title="Download"
            >
              ⤓
            </a>
          )}
          <div className="now-playing">
            {currentTrack
              ? `${currentTrack.title} — ${currentTrack.artist}`
              : "Nothing playing"}
          </div>
        </div>
        <div className="seek">
          <span>{fmt((progress / 100) * duration * 1000)}</span>
          <input
            type="range"
            min={0}
            max={1000}
            value={Math.round(progress * 10)}
            className="seekbar"
            style={{
              background: `linear-gradient(to right, var(--accent) ${progress}%, var(--border) ${progress}%)`,
            }}
            onChange={(e) => {
              const audio = audioRef.current;
              if (audio && duration) {
                audio.currentTime = (Number(e.target.value) / 10 / 100) * duration;
              }
            }}
            disabled={!videoId}
            title="Seek (←/→ ±10s)"
          />
          <span>{fmt(duration * 1000)}</span>
        </div>
        <p className="keys-hint">
          Space: play/pause · ←/→: seek ±10s · Ctrl+←/→ : prev/next track
        </p>
      </footer>
    </main>
  );
}