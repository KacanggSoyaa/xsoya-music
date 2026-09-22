import re

import requests
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from music import resolve_stream_url, search_best, search_results

app = FastAPI(title="xSoya Music service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

_PASSTHROUGH_HEADERS = (
    "content-type",
    "content-length",
    "content-range",
    "accept-ranges",
    "cache-control",
    "etag",
)


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/search")
def search(q: str):
    if not q.strip():
        raise HTTPException(status_code=400, detail="query is empty")
    try:
        return search_best(q)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"search failed: {exc}") from exc


@app.get("/search/results")
def search_many(q: str, count: int = 8):
    if not q.strip():
        raise HTTPException(status_code=400, detail="query is empty")
    try:
        return {"results": search_results(q, count)}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"search failed: {exc}") from exc


@app.get("/stream/{video_id}")
async def stream(video_id: str, request: Request):
    try:
        target = resolve_stream_url(video_id)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"resolve failed: {exc}") from exc

    if not target.startswith("https://"):
        raise HTTPException(status_code=502, detail="unsupported stream url")

    headers = {}
    range_header = request.headers.get("range")
    if range_header:
        headers["Range"] = range_header

    try:
        upstream = requests.get(
            target, headers=headers, stream=True, timeout=30
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"upstream failed: {exc}") from exc

    if upstream.status_code not in (200, 206):
        upstream.close()
        raise HTTPException(status_code=502, detail=f"upstream status {upstream.status_code}")

    out_headers = {
        k: v
        for k, v in upstream.headers.items()
        if k.lower() in _PASSTHROUGH_HEADERS
    }
    return StreamingResponse(
        upstream.iter_content(chunk_size=1 << 16),
        status_code=upstream.status_code,
        headers=out_headers,
    )


@app.get("/download/{video_id}")
async def download(video_id: str, name: str = "track"):
    try:
        target = resolve_stream_url(video_id)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"resolve failed: {exc}") from exc

    if not target.startswith("https://"):
        raise HTTPException(status_code=502, detail="unsupported stream url")

    try:
        upstream = requests.get(target, stream=True, timeout=30)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"upstream failed: {exc}") from exc

    if upstream.status_code != 200:
        upstream.close()
        raise HTTPException(status_code=502, detail=f"upstream status {upstream.status_code}")

    content_type = upstream.headers.get("content-type", "audio/mp4")
    if "mp4" in content_type:
        ext = ".m4a"
    elif "webm" in content_type:
        ext = ".webm"
    else:
        ext = ".audio"
    safe = re.sub(r"[^\w\-. ]+", "_", name).strip() or "track"

    headers = {
        "Content-Type": content_type,
        "Content-Disposition": f'attachment; filename="{safe}{ext}"',
    }
    length = upstream.headers.get("content-length")
    if length:
        headers["Content-Length"] = length

    return StreamingResponse(
        upstream.iter_content(chunk_size=1 << 16),
        headers=headers,
    )