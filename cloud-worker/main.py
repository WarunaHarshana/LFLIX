#!/usr/bin/env python3
"""
LFLIX Headless Cloud Worker — 24/7 Server-to-Server Downloader for Google Drive
Designed for Hugging Face Spaces (Docker), Render, or any Linux server.
Downloads direct video streams and torrents directly into Google Drive with zero client PC disk or bandwidth usage.
"""

import os
import sys
import time
import base64
import shutil
import uuid
import subprocess
from pathlib import Path
from typing import Dict, Any, Optional

try:
    from fastapi import FastAPI, HTTPException, Header, Depends, BackgroundTasks, status
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel
    import uvicorn
except ImportError:
    print("Dependencies not installed. Run: pip install -r requirements.txt")
    sys.exit(1)

# Configuration
PORT = int(os.environ.get("PORT", "7860"))
API_KEY = os.environ.get("LFLIX_API_KEY", "").strip()
RCLONE_REMOTE = os.environ.get("RCLONE_REMOTE", "gdrive").strip()
RCLONE_BASE_PATH = os.environ.get("RCLONE_BASE_PATH", "Media").strip()

# Setup rclone config directory
RCLONE_CONFIG_DIR = Path.home() / ".config" / "rclone"
RCLONE_CONFIG_FILE = RCLONE_CONFIG_DIR / "rclone.conf"

def init_rclone_config():
    """Initializes rclone.conf from environment variables if present."""
    RCLONE_CONFIG_DIR.mkdir(parents=True, exist_ok=True)

    # 1. Base64-encoded rclone config (recommended for secrets)
    b64_conf = os.environ.get("RCLONE_CONFIG_BASE64", "").strip()
    if b64_conf:
        try:
            decoded = base64.b64decode(b64_conf).decode("utf-8")
            RCLONE_CONFIG_FILE.write_text(decoded)
            print("[Rclone] Config initialized from RCLONE_CONFIG_BASE64")
            return
        except Exception as e:
            print(f"[Rclone] Error decoding RCLONE_CONFIG_BASE64: {e}")

    # 2. Raw rclone config string
    raw_conf = os.environ.get("RCLONE_CONFIG", "").strip()
    if raw_conf:
        RCLONE_CONFIG_FILE.write_text(raw_conf)
        print("[Rclone] Config initialized from RCLONE_CONFIG")

init_rclone_config()

app = FastAPI(title="LFLIX Cloud Worker", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Authentication dependency
def verify_api_key(
    authorization: Optional[str] = Header(None),
    x_api_key: Optional[str] = Header(None),
):
    if not API_KEY:
        return True  # No auth required if not set in environment

    token = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:].strip()
    elif x_api_key:
        token = x_api_key.strip()

    if token != API_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API key",
        )
    return True

# Data Models
class DownloadRequest(BaseModel):
    url: str
    type: Optional[str] = "direct"  # 'direct' | 'torrent'
    dest_path: Optional[str] = "Media/Movies"
    filename: Optional[str] = None
    media_type: Optional[str] = "movie"

class SetupConfigRequest(BaseModel):
    rclone_config: str

# In-memory tracking
active_jobs: Dict[str, Dict[str, Any]] = {}
job_processes: Dict[str, subprocess.Popen] = {}

def is_rclone_configured() -> bool:
    if not RCLONE_CONFIG_FILE.exists():
        return False
    try:
        res = subprocess.run(["rclone", "listremotes"], capture_output=True, text=True, timeout=5)
        remotes = [r.strip().rstrip(":") for r in res.stdout.splitlines() if r.strip()]
        return RCLONE_REMOTE in remotes
    except Exception:
        return False

@app.get("/")
@app.get("/health")
@app.get("/api/health")
def health_check():
    configured = is_rclone_configured()
    free_bytes = shutil.disk_usage("/tmp").free
    active_count = sum(1 for j in active_jobs.values() if j.get("status") in ["queued", "downloading", "uploading"])

    return {
        "status": "online",
        "worker": "headless-container",
        "rclone_configured": configured,
        "remote": RCLONE_REMOTE,
        "base_path": RCLONE_BASE_PATH,
        "free_space_bytes": free_bytes,
        "active_jobs_count": active_count,
        "api_key_required": bool(API_KEY),
        "timestamp": int(time.time()),
    }

@app.post("/api/setup", dependencies=[Depends(verify_api_key)])
def setup_rclone(req: SetupConfigRequest):
    """Dynamically configure rclone credentials from client."""
    try:
        conf_text = req.rclone_config.strip()
        if not conf_text:
            raise HTTPException(status_code=400, detail="Empty config provided")

        RCLONE_CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        RCLONE_CONFIG_FILE.write_text(conf_text)
        configured = is_rclone_configured()

        return {
            "success": configured,
            "message": "rclone config saved" if configured else "Config saved but remote verification failed",
            "remote": RCLONE_REMOTE,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def execute_direct_download(job_id: str, url: str, remote_dest_path: str):
    """
    Streams a direct HTTP URL directly to Google Drive via rclone copyurl.
    Zero local container disk used.
    """
    job = active_jobs[job_id]
    job["status"] = "downloading"
    job["phase"] = "cloud_stream"
    job["started_at"] = int(time.time())

    full_remote_dest = f"{RCLONE_REMOTE}:{remote_dest_path.lstrip('/')}"
    remote_dir = full_remote_dest.rsplit("/", 1)[0]
    filename = full_remote_dest.rsplit("/", 1)[-1]

    cmd = [
        "rclone", "copyurl", url, f"{remote_dir}/{filename}",
        "--progress",
        "--stats", "1s",
        "--stats-one-line",
        "--drive-chunk-size", "64M",
        "--drive-upload-cutoff", "64M",
        "--retries", "8",
        "--low-level-retries", "20",
    ]

    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            universal_newlines=True,
        )
        job_processes[job_id] = proc

        for line in proc.stdout:
            line = line.strip()
            # Rclone stats format:
            # 1.250 GiB / 10.500 GiB, 12%, 45.200 MiB/s, ETA 3m10s
            if "%" in line and "/" in line:
                try:
                    parts = [p.strip() for p in line.split(",")]
                    for part in parts:
                        if "%" in part:
                            job["progress"] = float("".join(c for c in part if c.isdigit() or c == "."))
                        elif "ETA" in part:
                            job["eta_str"] = part.replace("ETA", "").strip()
                        elif "/s" in part.lower():
                            job["speed_str"] = part
                            s_val = float("".join(c for c in part if c.isdigit() or c == "."))
                            if "kib" in part.lower(): s_val *= 1024
                            elif "mib" in part.lower(): s_val *= 1024**2
                            elif "gib" in part.lower(): s_val *= 1024**3
                            job["download_speed"] = int(s_val)

                    # Extract transferred string
                    if "/" in parts[0]:
                        job["transferred_str"] = parts[0]

                    job["last_progress_at"] = int(time.time())
                except Exception:
                    pass

        proc.wait()
        job_processes.pop(job_id, None)

        if proc.returncode == 0:
            job["status"] = "completed"
            job["progress"] = 100.0
            job["download_speed"] = 0
            job["completed_at"] = int(time.time())
        else:
            if job["status"] != "cancelled":
                job["status"] = "error"
                job["error_message"] = f"rclone copyurl exited with code {proc.returncode}"
    except Exception as e:
        job_processes.pop(job_id, None)
        job["status"] = "error"
        job["error_message"] = str(e)

def execute_torrent_download(job_id: str, magnet_url: str, remote_dest_path: str, custom_filename: Optional[str]):
    """
    Downloads torrent pieces via aria2c, then uploads directly to Google Drive via rclone moveto.
    """
    job = active_jobs[job_id]
    staging_dir = Path(f"/tmp/lflix-staging-{job_id}")
    staging_dir.mkdir(parents=True, exist_ok=True)

    job["status"] = "downloading"
    job["phase"] = "downloading_torrent"
    job["started_at"] = int(time.time())

    cmd = [
        "aria2c",
        "--continue=true",
        "--max-connection-per-server=16",
        "--split=16",
        "--min-split-size=1M",
        "--dir", str(staging_dir),
        "--summary-interval=1",
        "--seed-time=0",
        "--follow-torrent=mem",
        "--auto-file-renaming=false",
        "--allow-overwrite=true",
    ]
    if custom_filename:
        cmd.extend(["--out", custom_filename])
    cmd.append(magnet_url)

    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            universal_newlines=True,
        )
        job_processes[job_id] = proc

        for line in proc.stdout:
            line = line.strip()
            if "[" in line and "]" in line and ("DL:" in line or "ETA:" in line):
                try:
                    if "%" in line:
                        percent_part = line.split("%")[0].split("(")[-1]
                        job["progress"] = min(90.0, float(percent_part) * 0.9)  # 0-90% download, 90-100% upload

                    if "DL:" in line:
                        dl_part = line.split("DL:")[1].split()[0].replace("]", "")
                        job["speed_str"] = dl_part
                        val = float("".join(c for c in dl_part if c.isdigit() or c == "."))
                        if "kib" in dl_part.lower(): val *= 1024
                        elif "mib" in dl_part.lower(): val *= 1024**2
                        elif "gib" in dl_part.lower(): val *= 1024**3
                        job["download_speed"] = int(val)

                    if "ETA:" in line:
                        job["eta_str"] = line.split("ETA:")[1].split()[0].replace("]", "")

                    if "/" in line:
                        parts = line.split("[")[1].split("]")[0].split()
                        for p in parts:
                            if "/" in p and ("B" in p or "b" in p):
                                d_str, t_str = p.split("/")[:2]
                                t_clean = t_str.split("(")[0]
                                job["transferred_str"] = f"{d_str}/{t_clean}"
                                break

                    job["last_progress_at"] = int(time.time())
                except Exception:
                    pass

        proc.wait()
        job_processes.pop(job_id, None)

        if proc.returncode != 0:
            if job["status"] != "cancelled":
                job["status"] = "error"
                job["error_message"] = f"aria2c failed with code {proc.returncode}"
            shutil.rmtree(staging_dir, ignore_errors=True)
            return

        # Phase 2: Upload to Google Drive via rclone
        job["phase"] = "uploading_to_gdrive"
        job["status"] = "uploading"
        job["speed_str"] = "Uploading..."

        full_remote_dest = f"{RCLONE_REMOTE}:{remote_dest_path.lstrip('/')}"
        
        # Find largest downloaded file or folder
        downloaded_items = list(staging_dir.iterdir())
        if not downloaded_items:
            job["status"] = "error"
            job["error_message"] = "No files downloaded by aria2"
            shutil.rmtree(staging_dir, ignore_errors=True)
            return

        source_file = max(downloaded_items, key=lambda p: p.stat().st_size if p.is_file() else 0)

        upload_cmd = [
            "rclone", "moveto", str(source_file), full_remote_dest,
            "--drive-chunk-size", "64M",
            "--drive-upload-cutoff", "64M",
            "--retries", "8",
            "--low-level-retries", "20",
        ]

        up_proc = subprocess.Popen(upload_cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        job_processes[job_id] = up_proc
        up_proc.wait()
        job_processes.pop(job_id, None)

        shutil.rmtree(staging_dir, ignore_errors=True)

        if up_proc.returncode == 0:
            job["status"] = "completed"
            job["progress"] = 100.0
            job["download_speed"] = 0
            job["completed_at"] = int(time.time())
        else:
            if job["status"] != "cancelled":
                job["status"] = "error"
                job["error_message"] = f"rclone upload failed with code {up_proc.returncode}"
    except Exception as e:
        job_processes.pop(job_id, None)
        shutil.rmtree(staging_dir, ignore_errors=True)
        job["status"] = "error"
        job["error_message"] = str(e)

@app.post("/api/download", dependencies=[Depends(verify_api_key)])
def queue_download(req: DownloadRequest, background_tasks: BackgroundTasks):
    if not is_rclone_configured():
        raise HTTPException(
            status_code=400,
            detail=f"rclone is not configured for remote '{RCLONE_REMOTE}'. Please set RCLONE_CONFIG_BASE64 in your Space secrets.",
        )

    job_id = str(uuid.uuid4())[:8]
    dest_path = req.dest_path.strip("/\\") if req.dest_path else "Media/Movies"

    filename = req.filename
    if not filename:
        filename = f"download_{Date_now}.mkv" if "Date_now" in globals() else f"download_{job_id}.mkv"

    remote_file_path = f"{dest_path}/{filename}"

    job_info = {
        "id": job_id,
        "url": req.url,
        "type": req.type,
        "filename": filename,
        "dest_path": dest_path,
        "remote_file_path": remote_file_path,
        "status": "queued",
        "phase": "queued",
        "progress": 0.0,
        "download_speed": 0,
        "speed_str": "0 KB/s",
        "transferred_str": "",
        "eta_str": "",
        "error_message": None,
        "created_at": int(time.time()),
    }
    active_jobs[job_id] = job_info

    if req.type == "torrent" or req.url.startswith("magnet:"):
        background_tasks.add_task(execute_torrent_download, job_id, req.url, remote_file_path, filename)
    else:
        background_tasks.add_task(execute_direct_download, job_id, req.url, remote_file_path)

    return {
        "success": True,
        "job_id": job_id,
        "status": "queued",
        "target": f"{RCLONE_REMOTE}:{remote_file_path}",
    }

@app.get("/api/downloads", dependencies=[Depends(verify_api_key)])
def list_downloads():
    return {
        "downloads": list(active_jobs.values()),
        "count": len(active_jobs),
    }

@app.get("/api/downloads/{job_id}", dependencies=[Depends(verify_api_key)])
def get_download(job_id: str):
    if job_id not in active_jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    return active_jobs[job_id]

@app.delete("/api/downloads/{job_id}", dependencies=[Depends(verify_api_key)])
def cancel_download(job_id: str):
    if job_id not in active_jobs:
        raise HTTPException(status_code=404, detail="Job not found")

    job = active_jobs[job_id]
    job["status"] = "cancelled"

    proc = job_processes.get(job_id)
    if proc:
        try:
            proc.terminate()
            proc.kill()
        except Exception:
            pass
        job_processes.pop(job_id, None)

    return {"success": True, "message": f"Job {job_id} cancelled"}

if __name__ == "__main__":
    print("=" * 60)
    print(f"  LFLIX Headless Cloud Worker running on port {PORT}")
    print(f"  Rclone configured: {is_rclone_configured()}")
    print("=" * 60)
    uvicorn.run(app, host="0.0.0.0", port=PORT)
