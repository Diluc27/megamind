#!/usr/bin/env python3
"""
shelfd_watcher.py — AI structuring watcher for Shelfd Space.

Two modes (read from MegaMind config):
  watcher   — polls on a fixed interval, only runs when pending items exist
  always_on — tighter loop, same logic but shorter sleep between checks

Run:  python tools/shelfd_watcher.py
Stop: Ctrl+C
"""

import atexit
import json
import os
import subprocess
import sys
import time
import urllib.request
from pathlib import Path


BASE_URL = "http://127.0.0.1:8000"
ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


def _resolve_opencode() -> str:
    """Locate the opencode CLI in PATH or common install locations."""
    candidates = [
        "opencode",
        "opencode.cmd",
        "npx opencode",
    ]
    for cmd in ["where", "where.exe"]:
        try:
            r = subprocess.run([cmd, "opencode"], capture_output=True, text=True, timeout=5)
            for line in r.stdout.strip().splitlines():
                if line.strip():
                    p = line.strip()
                    if p.endswith(".cmd") or p.endswith(".ps1") or p.endswith(".exe"):
                        return p
        except Exception:
            pass
    # fallback: common npm global install paths
    fallback_dirs = [
        Path(os.environ.get("APPDATA", "")) / "npm",
        Path(os.environ.get("LOCALAPPDATA", "")) / "npm",
        Path.home() / "nodejs",
        Path.home() / ".config/opencode/tools",
        Path("C:/Users/Sm1th/AppData/Roaming/npm"),
        Path("C:/Users/Sm1th/nodejs"),
    ]
    for d in fallback_dirs:
        if not d.exists():
            continue
        for exe in ["opencode.cmd", "opencode.ps1", "opencode.exe", "opencode"]:
            full = d / exe
            if full.exists():
                return str(full.resolve())
    return "opencode"  # last resort — rely on PATH


def _load_api_key() -> str:
    """Read MEGAMIND_API_KEY from .env file."""
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
            if line.startswith("MEGAMIND_API_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return os.environ.get("MEGAMIND_API_KEY", "")


def _api_headers(api_key: str) -> dict:
    return {"X-API-Key": api_key, "Content-Type": "application/json"}


def _get(url: str, headers: dict) -> dict | list | None:
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=10) as r:
            return json.loads(r.read())
    except Exception as e:
        print(f"[watcher] GET {url} failed: {e}")
        return None


def _patch(url: str, headers: dict, body: dict) -> dict | None:
    try:
        data = json.dumps(body).encode()
        req = urllib.request.Request(url, data=data, headers=headers, method="PATCH")
        with urllib.request.urlopen(req, timeout=10) as r:
            return json.loads(r.read())
    except Exception as e:
        print(f"[watcher] PATCH {url} failed: {e}")
        return None


def _post(url: str, headers: dict, body: dict | None = None) -> dict | None:
    try:
        data = json.dumps(body or {}).encode()
        req = urllib.request.Request(url, data=data, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=10) as r:
            return json.loads(r.read())
    except Exception as e:
        print(f"[watcher] POST {url} failed: {e}")
        return None


def _load_config() -> dict:
    """Fetch structuring config from internal endpoint."""
    result = _get(f"{BASE_URL}/shelfd/internal/structuring-config", {})
    if result:
        return result
    return {
        "mode": "watcher",
        "interval_seconds": 90,
        "enabled": True,
        "formatting_prompt": None,
    }


def _structure_with_opencode(project: dict, formatting_prompt: str) -> dict | None:
    """
    Call OpenCode CLI to structure a single project.
    Returns parsed JSON dict or None if failed.
    """
    raw_text = project.get("raw_text", "")
    if not raw_text or not raw_text.strip():
        return None

    if formatting_prompt and formatting_prompt.strip():
        prompt = f'{formatting_prompt.strip()}\n\nRaw text:\n"""{raw_text}"""'
    else:
        prompt = f'Returns JSON only: {{"title":"","summary":"","sections":[{{"title":"Notes","items":[]}}],"tags":"","category":""}} Text: """{raw_text}"""'

    opencode_bin = _resolve_opencode()
    print(f"[watcher] Structuring: '{project.get('title', project['id'])}' (opencode={opencode_bin})")

    try:
        result = subprocess.run(
            [opencode_bin, "run", "--agent", "summary", "--pure", prompt],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=120,
        )
        output = result.stdout.strip()
        if not output:
            print(f"[watcher] OpenCode returned empty stdout (stderr={result.stderr[:200]})")
            return None

        start = output.find("{")
        end = output.rfind("}") + 1
        if start == -1 or end == 0:
            print("[watcher] No JSON found in OpenCode output")
            return None

        json_str = output[start:end]
        return json.loads(json_str)

    except subprocess.TimeoutExpired:
        print(f"[watcher] OpenCode timed out for project {project['id']}")
        return None
    except json.JSONDecodeError as e:
        print(f"[watcher] JSON parse error: {e}")
        return None
    except FileNotFoundError:
        print(f"[watcher] ERROR: 'opencode' command not found at '{opencode_bin}'. Is OpenCode installed?")
        return None
    except Exception as e:
        print(f"[watcher] Unexpected error: {e}")
        return None


def _process_project(project: dict, api_key: str, formatting_prompt: str) -> bool:
    """Structure one project and push result back. Returns True on success."""
    structured = _structure_with_opencode(project, formatting_prompt)
    if not structured:
        return False

    patch_body = {}

    for field in ["title", "summary", "tags", "category"]:
        if field in structured and structured[field] is not None:
            patch_body[field] = structured[field]

    if "sections" in structured and structured["sections"]:
        valid_sections = []
        for section in structured["sections"]:
            if not isinstance(section, dict):
                continue
            if "title" not in section or "items" not in section:
                continue
            if not isinstance(section["items"], list) or len(section["items"]) == 0:
                continue
            valid_sections.append({
                "title": str(section["title"]),
                "items": [str(item) for item in section["items"]],
            })
        if valid_sections:
            patch_body["sections"] = valid_sections
    elif "key_ideas" in structured or "action_items" in structured:
        sections = []
        if structured.get("key_ideas"):
            sections.append({"title": "Key Ideas", "items": structured["key_ideas"]})
        if structured.get("action_items"):
            sections.append({"title": "Action Items", "items": structured["action_items"]})
        if sections:
            patch_body["sections"] = sections

    if not patch_body:
        print(f"[watcher] Empty structured output for {project['id']}, skipping")
        return False

    url = f"{BASE_URL}/shelfd/projects/{project['id']}/structured"
    result = _patch(url, _api_headers(api_key), patch_body)
    if result:
        title_clean = result.get('title', project['id']).encode('ascii', 'replace').decode('ascii')
        print(f"[watcher] OK Structured: '{title_clean}'")
        return True
    return False


def run():
    print("[watcher] Shelfd structuring watcher starting…")
    api_key = _load_api_key()
    if not api_key:
        print("[watcher] ERROR: MEGAMIND_API_KEY not found in .env")
        sys.exit(1)

    headers = _api_headers(api_key)
    config_refresh_every = 10
    cycle = 0

    config = _load_config()
    print(f"[watcher] Mode: {config['mode']} | Interval: {config['interval_seconds']}s | Enabled: {config['enabled']}")

    while True:
        try:
            if cycle % config_refresh_every == 0:
                config = _load_config()

            if not config.get("enabled", True):
                print("[watcher] Structuring disabled - sleeping 60s")
                time.sleep(60)
                cycle += 1
                continue

            mode = config.get("mode", "watcher")
            interval = int(config.get("interval_seconds", 90) or 90)
            formatting_prompt = config.get("formatting_prompt") or ""

            if not formatting_prompt.strip():
                print("[watcher] WARNING: No formatting prompt configured")

            sleep_time = interval if mode == "watcher" else min(interval, 30)

            pending = _get(f"{BASE_URL}/shelfd/pending", headers)
            if pending is None:
                print("[watcher] Backend unreachable, retrying in 30s")
                time.sleep(30)
                cycle += 1
                continue

            if len(pending) == 0:
                if cycle % 5 == 0:
                    print(f"[watcher] No pending items - sleeping {sleep_time}s")
                time.sleep(sleep_time)
                cycle += 1
                continue

            print(f"[watcher] Found {len(pending)} pending item(s)")

            processed = 0
            for project in pending:
                if _process_project(project, api_key, formatting_prompt):
                    processed += 1
                time.sleep(2)

            if processed > 0:
                _post(f"{BASE_URL}/shelfd/internal/last-processed", {})
                print(f"[watcher] Processed {processed}/{len(pending)} items")

            time.sleep(sleep_time)
            cycle += 1

        except KeyboardInterrupt:
            print("\n[watcher] Stopped.")
            break
        except Exception as e:
            print(f"[watcher] Unexpected error: {e}")
            time.sleep(30)
            cycle += 1


if __name__ == "__main__":
    run()
