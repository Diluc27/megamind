"""
security.py - request guards for MegaMind.

1. Local-only guard: Core Space, /admin and /shelfd/internal must only be reachable
   directly from this PC. A tunnel (ngrok, cloudflared, ...) forwards requests from a
   local process, so request.client.host alone looks like 127.0.0.1. We also reject any
   request that carries proxy/forwarding headers or a non-local Host header.
2. Core unlock throttle: lock /api/core/unlock after repeated failed attempts.
"""
import os
import threading
import time

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

LOCAL_HOSTS = {"127.0.0.1", "::1", "localhost"}
LOCAL_ONLY_PREFIXES = ("/api/core", "/admin", "/shelfd/internal")
FORWARD_HEADERS = (
    "x-forwarded-for",
    "x-forwarded-host",
    "x-forwarded-proto",
    "x-forwarded-port",
    "forwarded",
    "x-real-ip",
)
UNLOCK_PATH = "/api/core/unlock"

MAX_ATTEMPTS = int(os.environ.get("MEGAMIND_CORE_MAX_ATTEMPTS", "5"))
WINDOW_SECONDS = int(os.environ.get("MEGAMIND_CORE_WINDOW_SECONDS", "900"))
LOCKOUT_SECONDS = int(os.environ.get("MEGAMIND_CORE_LOCKOUT_SECONDS", "900"))


def _hostname(host_header: str) -> str:
    host = (host_header or "").strip().lower()
    if host.startswith("["):  # IPv6 literal like [::1]:8000
        return host[1:].split("]", 1)[0]
    return host.split(":", 1)[0]


def _is_direct_local(request) -> bool:
    client = request.client.host if request.client else ""
    if client not in LOCAL_HOSTS:
        return False
    if _hostname(request.headers.get("host", "")) not in LOCAL_HOSTS:
        return False
    headers = request.headers
    if any(h in headers for h in FORWARD_HEADERS):
        return False
    if any(k.lower().startswith("ngrok-") for k in headers.keys()):
        return False
    return True


class _UnlockThrottle:
    def __init__(self):
        self._lock = threading.Lock()
        self._failures = []
        self._locked_until = 0.0

    def retry_after(self) -> int:
        with self._lock:
            remaining = self._locked_until - time.time()
            return int(remaining) + 1 if remaining > 0 else 0

    def record_failure(self) -> None:
        now = time.time()
        with self._lock:
            self._failures = [t for t in self._failures if now - t < WINDOW_SECONDS]
            self._failures.append(now)
            if len(self._failures) >= MAX_ATTEMPTS:
                self._locked_until = now + LOCKOUT_SECONDS
                self._failures = []

    def reset(self) -> None:
        with self._lock:
            self._failures = []
            self._locked_until = 0.0


_throttle = _UnlockThrottle()


class LocalOnlyGuard(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        path = request.url.path.rstrip("/") or "/"
        if path.startswith(LOCAL_ONLY_PREFIXES):
            if not _is_direct_local(request):
                return JSONResponse(
                    {"detail": "This endpoint is only available directly from this PC."},
                    status_code=403,
                )
            if path == UNLOCK_PATH and request.method == "POST":
                wait = _throttle.retry_after()
                if wait:
                    return JSONResponse(
                        {"detail": "Too many failed attempts. Try again later."},
                        status_code=429,
                        headers={"Retry-After": str(wait)},
                    )
                response = await call_next(request)
                if response.status_code == 401:
                    _throttle.record_failure()
                elif response.status_code == 200:
                    _throttle.reset()
                return response
        return await call_next(request)
