import time
import threading

import yt_dlp

YDL_OPTS = {
    "quiet": True,
    "no_warnings": True,
    "skip_download": True,
    "noplaylist": True,
}

_STREAM_CACHE = {}
_SEARCH_CACHE = {}
_CACHE_LOCK = threading.Lock()
_CACHE_TTL = 60 * 60  # 1 hour
_SEARCH_CACHE_TTL = 60 * 10  # 10 minutes for search results


def _pick_audio_url(info: dict) -> str:
    formats = info.get("formats") or []
    candidates = [
        f for f in formats
        if f.get("vcodec") == "none"
        and f.get("acodec") not in (None, "none")
        and f.get("protocol") in ("https", "http")
        and f.get("url")
    ]
    if not candidates:
        return info.get("url") or ""
    candidates.sort(key=lambda f: f.get("filesize") or 0, reverse=True)
    prefer_mp4 = [f for f in candidates if "mp4" in (f.get("mime_type") or "")]
    pool = prefer_mp4 or candidates
    return pool[0]["url"]


def resolve_stream_url(video_id: str) -> str:
    cached = _STREAM_CACHE.get(video_id)
    if cached and cached[1] > time.time():
        return cached[0]
    with yt_dlp.YoutubeDL(YDL_OPTS) as ydl:
        info = ydl.extract_info(
            f"https://www.youtube.com/watch?v={video_id}", download=False
        )
    url = _pick_audio_url(info)
    if not url:
        raise ValueError(f"No playable audio for {video_id}")
    _STREAM_CACHE[video_id] = (url, time.time() + _CACHE_TTL)
    return url


def search_best(query: str) -> dict:
    q = query.strip().lower()
    with _CACHE_LOCK:
        cached = _SEARCH_CACHE.get(q)
        if cached and cached[1] > time.time():
            return cached[0]
    opts = {
        **YDL_OPTS,
        "default_search": "ytsearch1",
        "format": "bestaudio/best",
    }
    with yt_dlp.YoutubeDL(opts) as ydl:
        result = ydl.extract_info(f"ytsearch1:{query}", download=False)
    entries = result.get("entries") or []
    if not entries:
        raise ValueError(f"No results for: {query}")
    entry = entries[0]
    data = {
        "videoId": entry.get("id"),
        "title": entry.get("title"),
        "duration": entry.get("duration"),
        "channel": entry.get("channel"),
    }
    with _CACHE_LOCK:
        _SEARCH_CACHE[q] = (data, time.time() + _SEARCH_CACHE_TTL)
    return data


def search_results(query: str, count: int = 5) -> list[dict]:
    safe_count = max(1, min(int(count), 30))
    cache_key = f"{query.strip().lower()}:{safe_count}"
    with _CACHE_LOCK:
        cached = _SEARCH_CACHE.get(cache_key)
        if cached and cached[1] > time.time():
            return cached[0]
    opts = {
        **YDL_OPTS,
        "default_search": f"ytsearch{safe_count}",
        "format": "bestaudio/best",
    }
    with yt_dlp.YoutubeDL(opts) as ydl:
        result = ydl.extract_info(
            f"ytsearch{safe_count}:{query}", download=False
        )
    entries = result.get("entries") or []
    results = []
    for entry in entries:
        if not entry:
            continue
        results.append(
            {
                "videoId": entry.get("id"),
                "title": entry.get("title"),
                "duration": entry.get("duration"),
                "channel": entry.get("channel"),
            }
        )
    with _CACHE_LOCK:
        _SEARCH_CACHE[cache_key] = (results, time.time() + _SEARCH_CACHE_TTL)
    return results