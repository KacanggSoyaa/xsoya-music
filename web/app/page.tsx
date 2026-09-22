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

type HistoryEntry = {
  name: string;
  savedAt: number;
  tracks: { title: string; artist: string; duration_ms: number }[];
};

type Preset = { name: string; tracks: string[] };

function fmt(ms: number): string {
  if (!ms || ms <= 0) return "0:00";
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function fmtTotal(sec: number): string {
  if (!isFinite(sec) || sec <= 0) return "0:00";
  const total = Math.floor(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

function parseLine(line: string) {
  const parts = line.split(/\s+[-–—]\s+|\t+/);
  if (parts.length >= 2) {
    return { title: parts[0].trim(), artist: parts.slice(1).join(" ").trim(), duration_ms: 0 };
  }
  return { title: line.trim(), artist: "", duration_ms: 0 };
}

const statusGlyph: Record<TrackStatus, string> = {
  pending: "•",
  searching: "…",
  ready: "✔",
  error: "!",
};

const PRESETS: Preset[] = [
  {
    name: "Lo-fi Chill",
    tracks: [
      "Dreams - Joji",
      "Come and Get Your Love - Redbone",
      "Cigarette Daydreams - Cage the Elephant",
      "Lost in Japan - Shawn Mendes",
      "After Dark - Mr.Kitty",
      "Sunset Lover - Petit Biscuit",
      "Electric Feel - MGMT",
      "Chamber of Reflection - Mac DeMarco",
    ],
  },
  {
    name: "Workout",
    tracks: [
      "Till I Collapse - Eminem",
      "Stronger - Kanye West",
      "Eye of the Tiger - Survivor",
      "Lose Yourself - Eminem",
      "The Search - NF",
      "Power - Kanye West",
      "Remember the Name - Fort Minor",
      "Uptown Funk - Mark Ronson",
    ],
  },
  {
    name: "Deep Focus",
    tracks: [
      "Clair de Lune - Claude Debussy",
      "River Flows in You - Yiruma",
      "Experience - Ludovico Einaudi",
      "Weightless - Marconi Union",
      "Moonlight Sonata - Beethoven",
      "Nuvole Bianche - Ludovico Einaudi",
      "Comptine d'un autre été - Yann Tiersen",
      "Gymnopédie No. 1 - Erik Satie",
    ],
  },
];

export default function Home() {
  const [url, setUrl] = useState("");
  const [query, setQuery] = useState("");
  const [playlistName, setPlaylistName] = useState<string | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [auth, setAuth] = useState<{
    loggedIn: boolean;
    configured: boolean;
  } | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const [current, setCurrent] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [sessionSeconds, setSessionSeconds] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastTimeRef = useRef(-1);
  const sessionRef = useRef(0);

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

    try {
      const raw = localStorage.getItem("xs_music_history");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setHistory(parsed.slice(0, 5));
      }
      const total = Number(localStorage.getItem("xs_music_total") || 0);
      if (total > 0) {
        sessionRef.current = total;
        setSessionSeconds(total);
      }
    } catch {
      /* ignore */
    }
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
          await resolveTrack(t.index, `${t.title} ${t.artist}`.trim());
        }
      });
      await Promise.all(workers);
    },
    [resolveTrack]
  );

  const saveHistory = useCallback(
    (name: string, list: { title: string; artist: string; duration_ms: number }[]) => {
      const entry: HistoryEntry = {
        name,
        savedAt: Date.now(),
        tracks: list.map((t) => ({
          title: t.title,
          artist: t.artist,
          duration_ms: t.duration_ms,
        })),
      };
      setHistory((prev) => {
        const next = [entry, ...prev.filter((p) => p.name !== name)].slice(0, 5);
        try {
          localStorage.setItem("xs_music_history", JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
    },
    []
  );

  const applyTracks = useCallback(
    (
      name: string,
      list: { title: string; artist: string; duration_ms: number }[]
    ) => {
      setError(null);
      setPlaylistName(name);
      setCurrent(-1);
      setPlaying(false);
      const built: Track[] = list.map((t, i) => ({
        index: i,
        title: t.title,
        artist: t.artist,
        duration_ms: t.duration_ms || 0,
        status: "pending" as TrackStatus,
      }));
      setTracks(built);
      saveHistory(name, list);
      void preload(built);
    },
    [preload, saveHistory]
  );

  const loadPlaylist = useCallback(async () => {
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/playlist?url=${encodeURIComponent(url)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "load failed");
      applyTracks(data.name, data.tracks);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [url, loading, applyTracks]);

  const loadPreset = useCallback(
    (preset: Preset) => {
      if (loading) return;
      applyTracks(preset.name, preset.tracks.map(parseLine));
    },
    [applyTracks, loading]
  );

  const loadHistoryEntry = useCallback(
    (entry: HistoryEntry) => {
      if (loading) return;
      applyTracks(entry.name, entry.tracks);
    },
    [applyTracks, loading]
  );

  const searchAndPlay = useCallback(
    async (q: string) => {
      const term = q.trim();
      if (!term || searching) return;
      setSearching(true);
      setError(null);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
        const data = (await res.json()) as SearchResult & { error?: string };
        if (!res.ok) throw new Error(data.error || "search failed");
        const track: Track = {
          index: 0,
          title: data.title ?? term,
          artist: data.channel ?? "",
          duration_ms: (data.duration ?? 0) * 1000,
          videoId: data.videoId,
          status: "ready",
        };
        setPlaylistName(`Search: ${term}`);
        setTracks([track]);
        setCurrent(0);
        setPlaying(true);
        setQuery("");
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setSearching(false);
      }
    },
    [searching]
  );

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
      lastTimeRef.current = -1;
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

  const totalDurationMs = tracks.reduce((sum, t) => sum + (t.duration_ms || 0), 0);
  const currentSource = videoId ? `/api/stream/${videoId}` : undefined;

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
          <button className="btn-primary" onClick={loadPlaylist} disabled={loading || !url.trim()}>
            {loading ? "Loading…" : "Load"}
          </button>
        </div>

        <div className="search-row">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void searchAndPlay(query);
            }}
            placeholder="Search any song and play it instantly…"
          />
          <button
            className="btn-primary"
            onClick={() => void searchAndPlay(query)}
            disabled={searching || !query.trim()}
          >
            {searching ? "Searching…" : "Play"}
          </button>
        </div>

        <div className="presets">
          <span className="section-label">Vibes</span>
          {PRESETS.map((p) => (
            <button
              key={p.name}
              className="preset"
              disabled={loading}
              onClick={() => loadPreset(p)}
            >
              {p.name}
            </button>
          ))}
        </div>

        {error && <p className="error">{error}</p>}
        {playlistName && <p className="playlist-name">{playlistName}</p>}
      </header>

      {tracks.length > 0 && (
        <div className="stats">
          <span>
            <b>{tracks.length}</b> tracks
          </span>
          <span>
            <b>{fmtTotal(totalDurationMs / 1000)}</b> total
          </span>
          <span className="stats-accent">
            Listened <b>{fmtTotal(sessionSeconds)}</b> total
          </span>
        </div>
      )}

      {currentTrack && (
        <section className="hero">
          <div className={`disc${playing ? " spin" : ""}`}>
            <span className="hero-initial">
              {(currentTrack.title || "?").charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="hero-meta">
            <span className="hero-kicker">{playlistName ?? "Now playing"}</span>
            <div className="hero-title">{currentTrack.title}</div>
            <div className="hero-artist">{currentTrack.artist || "Unknown artist"}</div>
          </div>
        </section>
      )}

      {tracks.length === 0 && history.length > 0 && (
        <div className="history">
          <div className="section-label">Recently played</div>
          <div className="history-scroll">
            {history.map((h) => (
              <button
                key={h.savedAt}
                className="history-card"
                disabled={loading}
                onClick={() => loadHistoryEntry(h)}
              >
                <span className="history-name">{h.name}</span>
                <span className="history-meta">
                  {h.tracks.length} tracks ·{" "}
                  {fmt(h.tracks.reduce((sum, t) => sum + (t.duration_ms || 0), 0))}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <section className="track-list">
        {tracks.length === 0 && (
          <div className="empty empty-visual">
            {loading ? (
              <p>Loading…</p>
            ) : (
              <>
                <div className="disc-empty">
                  <svg width="130" height="130" viewBox="0 0 130 130" fill="none" aria-hidden="true">
                    <circle cx="65" cy="65" r="60" fill="#0d1118" stroke="#242e40" strokeWidth="2" />
                    <circle cx="65" cy="65" r="58" fill="none" stroke="#1a2030" strokeWidth="1" />
                    <circle cx="65" cy="65" r="46" fill="#151b28" />
                    <circle cx="65" cy="65" r="40" fill="none" stroke="#2a3547" strokeWidth="2" strokeDasharray="2 5" />
                    <circle cx="65" cy="65" r="34" fill="none" stroke="#2a3547" strokeWidth="2" strokeDasharray="2 5" />
                    <circle cx="65" cy="65" r="28" fill="none" stroke="#2a3547" strokeWidth="2" strokeDasharray="2 5" />
                    <circle cx="65" cy="65" r="14" fill="#202738" />
                    <circle cx="65" cy="65" r="6" fill="#b48cff" />
                    <circle cx="65" cy="65" r="2.5" fill="#0b0e14" />
                    <path d="M98 76v10M98 76l-9 4m9-26v10M89 54l9 4" stroke="#b48cff" strokeWidth="2.4" strokeLinecap="round" />
                  </svg>
                </div>
                <p>
                  Paste a Spotify playlist, pick a vibe above, or search any song to
                  start.
                </p>
              </>
            )}
          </div>
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
          src={currentSource}
          autoPlay
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => step(1)}
          onTimeUpdate={(e) => {
            const audio = e.currentTarget;
            setProgress((audio.currentTime / audio.duration) * 100 || 0);
            const t = audio.currentTime;
            if (lastTimeRef.current >= 0 && t > lastTimeRef.current) {
              const delta = t - lastTimeRef.current;
              if (delta < 10) {
                sessionRef.current += delta;
                setSessionSeconds(sessionRef.current);
                try {
                  localStorage.setItem("xs_music_total", String(sessionRef.current));
                } catch {
                  /* ignore */
                }
              }
            }
            lastTimeRef.current = t;
          }}
          onLoadedMetadata={(e) => {
            setDuration(e.currentTarget.duration);
            lastTimeRef.current = 0;
          }}
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