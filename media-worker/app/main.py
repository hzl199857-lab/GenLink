from __future__ import annotations

import base64
import hashlib
import hmac
import json
import math
import os
import re
import shutil
import sqlite3
import subprocess
import tempfile
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal
from urllib.parse import quote

import requests
import imageio_ffmpeg
from fastapi import BackgroundTasks, FastAPI, Header, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, HttpUrl

try:
    from scenedetect import ContentDetector, SceneManager, open_video
except Exception:  # pragma: no cover - optional runtime dependency check
    ContentDetector = None
    SceneManager = None
    open_video = None


JobKind = Literal["cut", "smart_clip"]
JobStatus = Literal["queued", "running", "done", "error"]

REDIS_REST_URL = os.environ.get("UPSTASH_REDIS_REST_URL", "").rstrip("/")
REDIS_REST_TOKEN = os.environ.get("UPSTASH_REDIS_REST_TOKEN", "")
STATE_DB_PATH = os.environ.get("MEDIA_WORKER_STATE_DB", "/data/jobs.sqlite3")
WORKER_TOKEN = os.environ.get("MEDIA_WORKER_TOKEN", "")
MAX_SOURCE_BYTES = int(os.environ.get("MAX_SOURCE_BYTES", str(1024 * 1024 * 1024)))
JOB_TTL_SECONDS = int(os.environ.get("JOB_TTL_SECONDS", str(60 * 60 * 6)))

OSS_BUCKET = os.environ.get("ALIYUN_VIDEO_OSS_BUCKET") or os.environ.get("ALIYUN_OSS_BUCKET", "")
OSS_REGION = os.environ.get("ALIYUN_VIDEO_OSS_REGION") or os.environ.get("ALIYUN_OSS_REGION", "")
OSS_ACCESS_KEY_ID = (
    os.environ.get("ALIYUN_VIDEO_OSS_ACCESS_KEY_ID")
    or os.environ.get("ALIYUN_OSS_ACCESS_KEY_ID", "")
)
OSS_ACCESS_KEY_SECRET = (
    os.environ.get("ALIYUN_VIDEO_OSS_ACCESS_KEY_SECRET")
    or os.environ.get("ALIYUN_OSS_ACCESS_KEY_SECRET", "")
)
OSS_PUBLIC_BASE_URL = (
    os.environ.get("ALIYUN_VIDEO_OSS_PUBLIC_BASE_URL")
    or os.environ.get("ALIYUN_OSS_PUBLIC_BASE_URL")
    or ""
).rstrip("/")
OSS_INTERNAL_ENDPOINT = (
    os.environ.get("ALIYUN_VIDEO_OSS_INTERNAL_ENDPOINT")
    or os.environ.get("ALIYUN_OSS_INTERNAL_ENDPOINT")
    or ""
).rstrip("/")


class SmartClipOptions(BaseModel):
    mode: Literal["stable", "balanced", "sensitive"] = "stable"
    maxSegments: int = Field(default=20, ge=2, le=25)
    fps: Literal[16, 24, 30] = 24


class CreateClipJobRequest(BaseModel):
    kind: JobKind
    sourceUrl: HttpUrl
    start: float | None = None
    end: float | None = None
    fps: Literal[16, 24, 30] | None = None
    options: SmartClipOptions | None = None


@dataclass
class Segment:
    index: int
    path: Path
    start: float
    end: float
    fps: int


app = FastAPI(title="GenLink Media Worker")


def ffmpeg_path() -> str:
    return imageio_ffmpeg.get_ffmpeg_exe()


def ffprobe_path() -> str | None:
    configured = os.environ.get("FFPROBE_PATH", "").strip()
    if configured and Path(configured).is_file():
        return configured
    discovered = shutil.which("ffprobe")
    if discovered:
        return discovered
    exe = Path(ffmpeg_path())
    sibling = exe.with_name("ffprobe.exe" if os.name == "nt" else "ffprobe")
    if sibling.is_file():
        return str(sibling)
    return None


def require_config() -> None:
    missing = []
    if not OSS_BUCKET:
        missing.append("ALIYUN_VIDEO_OSS_BUCKET or ALIYUN_OSS_BUCKET")
    if not OSS_REGION:
        missing.append("ALIYUN_VIDEO_OSS_REGION or ALIYUN_OSS_REGION")
    if not OSS_ACCESS_KEY_ID:
        missing.append("ALIYUN_VIDEO_OSS_ACCESS_KEY_ID or ALIYUN_OSS_ACCESS_KEY_ID")
    if not OSS_ACCESS_KEY_SECRET:
        missing.append("ALIYUN_VIDEO_OSS_ACCESS_KEY_SECRET or ALIYUN_OSS_ACCESS_KEY_SECRET")
    if missing:
        raise RuntimeError(f"Missing worker config: {', '.join(missing)}")


def authorize(authorization: str | None) -> None:
    if not WORKER_TOKEN:
        return
    expected = f"Bearer {WORKER_TOKEN}"
    if authorization != expected:
        raise HTTPException(status_code=401, detail="Unauthorized")


def redis_command(*args: Any) -> Any:
    if not REDIS_REST_URL or not REDIS_REST_TOKEN:
        raise RuntimeError("Upstash Redis is not configured")
    response = requests.post(
        REDIS_REST_URL,
        headers={"Authorization": f"Bearer {REDIS_REST_TOKEN}"},
        json=list(args),
        timeout=20,
    )
    response.raise_for_status()
    payload = response.json()
    if isinstance(payload, dict):
        if "error" in payload:
            raise RuntimeError(str(payload["error"]))
        return payload.get("result")
    raise RuntimeError("Invalid Redis response")


def use_redis_state() -> bool:
    return bool(REDIS_REST_URL and REDIS_REST_TOKEN)


def sqlite_connect() -> sqlite3.Connection:
    db_path = Path(STATE_DB_PATH)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(db_path, timeout=30)
    connection.execute("PRAGMA journal_mode=WAL")
    connection.execute("PRAGMA busy_timeout=30000")
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS jobs (
          job_id TEXT PRIMARY KEY,
          payload TEXT NOT NULL,
          expires_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
        """,
    )
    return connection


def cleanup_sqlite_jobs(connection: sqlite3.Connection) -> None:
    connection.execute("DELETE FROM jobs WHERE expires_at < ?", (int(time.time()),))


def job_key(job_id: str) -> str:
    return f"genlink:media-job:{job_id}"


def save_job(job: dict[str, Any]) -> None:
    if use_redis_state():
        redis_command("SET", job_key(job["jobId"]), json.dumps(job), "EX", JOB_TTL_SECONDS)
        return

    now = int(time.time())
    with sqlite_connect() as connection:
        cleanup_sqlite_jobs(connection)
        connection.execute(
            """
            INSERT INTO jobs (job_id, payload, expires_at, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(job_id) DO UPDATE SET
              payload=excluded.payload,
              expires_at=excluded.expires_at,
              updated_at=excluded.updated_at
            """,
            (job["jobId"], json.dumps(job), now + JOB_TTL_SECONDS, now),
        )


def load_job(job_id: str) -> dict[str, Any] | None:
    if use_redis_state():
        raw = redis_command("GET", job_key(job_id))
        if not raw:
            return None
        return json.loads(raw)

    with sqlite_connect() as connection:
        cleanup_sqlite_jobs(connection)
        row = connection.execute(
            "SELECT payload FROM jobs WHERE job_id = ? AND expires_at >= ?",
            (job_id, int(time.time())),
        ).fetchone()

    if not row:
        return None
    return json.loads(row[0])


def update_job(job_id: str, **updates: Any) -> None:
    job = load_job(job_id)
    if not job:
        return
    job.update(updates)
    job["updatedAt"] = int(time.time())
    save_job(job)


def run_cmd(args: list[str], timeout: int) -> None:
    completed = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
    if completed.returncode != 0:
        message = completed.stderr.strip() or completed.stdout.strip() or "Command failed"
        raise RuntimeError(message[-2000:])


def probe_duration(path: Path) -> float:
    probe = ffprobe_path()

    if probe:
        completed = subprocess.run(
            [
                probe,
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                str(path),
            ],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if completed.returncode == 0:
            duration = float(completed.stdout.strip())
            if math.isfinite(duration) and duration > 0:
                return duration

    completed = subprocess.run(
        [ffmpeg_path(), "-hide_banner", "-i", str(path)],
        capture_output=True,
        text=True,
        timeout=30,
    )
    output = f"{completed.stderr}\n{completed.stdout}"
    match = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", output)
    if not match:
        raise RuntimeError("Unable to read source video duration")
    hours, minutes, seconds = match.groups()
    duration = int(hours) * 3600 + int(minutes) * 60 + float(seconds)
    if not math.isfinite(duration) or duration <= 0:
        raise RuntimeError("Invalid source video duration")
    return duration


def probe_dimensions(path: Path) -> tuple[int | None, int | None]:
    probe = ffprobe_path()

    if probe:
        completed = subprocess.run(
            [
                probe,
                "-v",
                "error",
                "-select_streams",
                "v:0",
                "-show_entries",
                "stream=width,height",
                "-of",
                "csv=s=x:p=0",
                str(path),
            ],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if completed.returncode == 0:
            match = re.match(r"^(\d+)x(\d+)", completed.stdout.strip())
            if match:
                return int(match.group(1)), int(match.group(2))

    completed = subprocess.run(
        [ffmpeg_path(), "-hide_banner", "-i", str(path)],
        capture_output=True,
        text=True,
        timeout=30,
    )
    output = f"{completed.stderr}\n{completed.stdout}"
    match = re.search(r"Video:.*?(\d{2,5})x(\d{2,5})", output)
    if not match:
        return None, None
    return int(match.group(1)), int(match.group(2))


def download_source(url: str, target: Path) -> None:
    with requests.get(url, stream=True, timeout=(15, 120)) as response:
        response.raise_for_status()
        total = 0
        with target.open("wb") as file:
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                if not chunk:
                    continue
                total += len(chunk)
                if total > MAX_SOURCE_BYTES:
                    raise RuntimeError("Source video exceeds worker size limit")
                file.write(chunk)


def oss_endpoint() -> str:
    return f"https://{OSS_BUCKET}.{OSS_REGION}.aliyuncs.com"


def server_oss_endpoint() -> str:
    return OSS_INTERNAL_ENDPOINT or oss_endpoint()


def oss_public_base_url() -> str:
    return OSS_PUBLIC_BASE_URL or oss_endpoint()


def oss_signature(method: str, content_type: str, expires: int, object_key: str) -> str:
    canonicalized_resource = f"/{OSS_BUCKET}/{object_key}"
    string_to_sign = "\n".join([method, "", content_type, str(expires), canonicalized_resource])
    digest = hmac.new(
        OSS_ACCESS_KEY_SECRET.encode("utf-8"),
        string_to_sign.encode("utf-8"),
        hashlib.sha1,
    ).digest()
    return base64.b64encode(digest).decode("ascii")


def upload_to_oss(local_path: Path, object_key: str, content_type: str) -> str:
    expires = int(time.time()) + 10 * 60
    signature = oss_signature("PUT", content_type, expires, object_key)
    encoded_key = "/".join(quote(part) for part in object_key.split("/"))
    url = (
        f"{server_oss_endpoint()}/{encoded_key}"
        f"?OSSAccessKeyId={quote(OSS_ACCESS_KEY_ID)}"
        f"&Expires={expires}"
        f"&Signature={quote(signature)}"
    )
    with local_path.open("rb") as file:
        response = requests.put(url, data=file, headers={"Content-Type": content_type}, timeout=300)
    response.raise_for_status()
    return f"{oss_public_base_url()}/{encoded_key}"


def cut_video(source: Path, target: Path, start: float, end: float, fps: int | None) -> None:
    if end <= start:
        raise RuntimeError("Invalid cut range")
    args = [
        ffmpeg_path(),
        "-y",
        "-i",
        str(source),
        "-ss",
        f"{start:.3f}",
        "-t",
        f"{end - start:.3f}",
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-c:a",
        "aac",
    ]
    if fps:
        args.extend(["-r", str(fps)])
    args.append(str(target))
    run_cmd(args, timeout=600)


def detect_scene_ranges(source: Path, duration: float, options: SmartClipOptions) -> list[tuple[float, float]]:
    if not ContentDetector or not SceneManager or not open_video:
        return fallback_ranges(duration, options.maxSegments)

    profiles = {
        "stable": {"threshold": 27.0, "min_scene_sec": 1.0},
        "balanced": {"threshold": 23.0, "min_scene_sec": 0.6},
        "sensitive": {"threshold": 18.0, "min_scene_sec": 0.25},
    }
    profile = profiles[options.mode]
    min_scene_len = max(1, round(profile["min_scene_sec"] * options.fps))

    video = open_video(str(source))
    manager = SceneManager()
    manager.add_detector(ContentDetector(threshold=profile["threshold"], min_scene_len=min_scene_len))
    manager.detect_scenes(video=video)
    scenes = manager.get_scene_list()
    ranges = [(max(0.0, s.get_seconds()), min(duration, e.get_seconds())) for s, e in scenes]
    ranges = [(s, e) for s, e in ranges if e - s >= 0.2]

    if len(ranges) < 2:
        return fallback_ranges(duration, options.maxSegments)
    return merge_to_limit(ranges, options.maxSegments)


def fallback_ranges(duration: float, max_segments: int) -> list[tuple[float, float]]:
    count = max(2, min(max_segments, round(duration / 3) or 2))
    step = duration / count
    return [(i * step, duration if i == count - 1 else (i + 1) * step) for i in range(count)]


def merge_to_limit(ranges: list[tuple[float, float]], limit: int) -> list[tuple[float, float]]:
    ranges = sorted(ranges)
    while len(ranges) > limit:
        shortest_idx = min(range(len(ranges)), key=lambda i: ranges[i][1] - ranges[i][0])
        if shortest_idx == 0:
            ranges[1] = (ranges[0][0], ranges[1][1])
            ranges.pop(0)
        else:
            ranges[shortest_idx - 1] = (ranges[shortest_idx - 1][0], ranges[shortest_idx][1])
            ranges.pop(shortest_idx)
    return ranges


def segment_result(job_id: str, segment: Segment) -> dict[str, Any]:
    object_key = (
        f"processing/results/{time.strftime('%Y-%m-%d')}/{job_id}/"
        f"{segment.index:03d}-{uuid.uuid4().hex}.mp4"
    )
    url = upload_to_oss(segment.path, object_key, "video/mp4")
    width, height = probe_dimensions(segment.path)
    size_bytes = segment.path.stat().st_size
    return {
        "index": segment.index,
        "url": url,
        "start": round(segment.start, 3),
        "end": round(segment.end, 3),
        "duration": round(segment.end - segment.start, 3),
        "fps": segment.fps,
        "width": width,
        "height": height,
        "sizeBytes": size_bytes,
        "mimeType": "video/mp4",
    }


def process_job(job_id: str) -> None:
    tmp_dir = Path(tempfile.mkdtemp(prefix=f"{job_id}-"))
    try:
        job = load_job(job_id)
        if not job:
            return
        payload = job["payload"]
        update_job(job_id, status="running", stage="download", progress=0.02)

        source = tmp_dir / "source"
        download_source(payload["sourceUrl"], source)
        duration = probe_duration(source)

        results: list[dict[str, Any]] = []

        if payload["kind"] == "cut":
            start = max(0.0, float(payload["start"]))
            end = min(duration, float(payload["end"]))
            fps = payload.get("fps") or 24
            target = tmp_dir / "cut.mp4"
            update_job(job_id, stage="cut", progress=0.3, total=1, doneCount=0)
            cut_video(source, target, start, end, fps)
            segment = Segment(index=1, path=target, start=start, end=end, fps=fps)
            results.append(segment_result(job_id, segment))
            update_job(job_id, stage="upload", progress=0.9, total=1, doneCount=1)
        else:
            options = SmartClipOptions(**payload.get("options", {}))
            update_job(job_id, stage="detect", progress=0.08)
            ranges = detect_scene_ranges(source, duration, options)
            total = len(ranges)
            for idx, (start, end) in enumerate(ranges, start=1):
                target = tmp_dir / f"scene-{idx:03d}.mp4"
                update_job(
                    job_id,
                    stage="cut",
                    progress=0.1 + 0.75 * ((idx - 1) / max(total, 1)),
                    total=total,
                    doneCount=idx - 1,
                )
                cut_video(source, target, start, end, options.fps)
                segment = Segment(index=idx, path=target, start=start, end=end, fps=options.fps)
                results.append(segment_result(job_id, segment))
                update_job(
                    job_id,
                    stage="upload",
                    progress=0.1 + 0.85 * (idx / max(total, 1)),
                    total=total,
                    doneCount=idx,
                )

        update_job(
            job_id,
            status="done",
            stage="done",
            progress=1,
            segments=results,
            doneCount=len(results),
            total=len(results),
        )
    except Exception as exc:
        update_job(job_id, status="error", stage="error", error=str(exc), progress=0)
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


@app.get("/health")
def health() -> dict[str, Any]:
    return {"ok": True}


@app.post("/clip-jobs")
def create_clip_job(
    request: CreateClipJobRequest,
    background_tasks: BackgroundTasks,
    authorization: str | None = Header(default=None),
) -> JSONResponse:
    authorize(authorization)
    try:
        require_config()
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    payload = request.model_dump(mode="json")
    if request.kind == "cut":
        if request.start is None or request.end is None or request.end <= request.start:
            raise HTTPException(status_code=400, detail="Invalid cut range")

    job_id = f"{request.kind.replace('_', '-')}-{uuid.uuid4().hex}"
    now = int(time.time())
    save_job(
        {
            "ok": True,
            "jobId": job_id,
            "kind": request.kind,
            "status": "queued",
            "stage": "queued",
            "progress": 0,
            "payload": payload,
            "createdAt": now,
            "updatedAt": now,
        }
    )

    background_tasks.add_task(process_job, job_id)
    return JSONResponse({"ok": True, "jobId": job_id})


@app.get("/clip-jobs/{job_id}")
def get_clip_job(job_id: str, authorization: str | None = Header(default=None)) -> JSONResponse:
    authorize(authorization)
    if not re.match(r"^[A-Za-z0-9_.:-]+$", job_id):
        raise HTTPException(status_code=400, detail="Invalid job id")
    job = load_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.get("status") == "error":
        return JSONResponse(
            {
                "ok": False,
                "jobId": job_id,
                "status": "error",
                "error": job.get("error") or "Video processing failed",
            }
        )
    return JSONResponse(
        {
            "ok": True,
            "jobId": job_id,
            "status": job.get("status"),
            "stage": job.get("stage"),
            "progress": job.get("progress", 0),
            "doneCount": job.get("doneCount"),
            "total": job.get("total"),
            "segments": job.get("segments"),
        }
    )
