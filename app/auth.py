"""
auth.py — Shared API key guard for MegaMind non-Core endpoints.

Setup
-----
1. Generate a key:  python -c "import secrets; print(secrets.token_urlsafe(32))"
2. Add to your .env:  MEGAMIND_API_KEY=<your_key>
3. Shelfd app + any external client sends:  X-API-Key: <your_key>

Core Space keeps its own separate password/token auth — untouched.
"""

import os
import hmac
from fastapi import Header, HTTPException, status
from typing import Optional


def require_api_key(x_api_key: Optional[str] = Header(default=None)) -> None:
    """
    FastAPI dependency — inject with `Depends(require_api_key)`.
    Returns None on success, raises 401/403 on failure.
    Skip this dependency on routes you want public (e.g. health check).
    """
    expected = os.environ.get("MEGAMIND_API_KEY", "")

    if not expected:
        if os.environ.get("MEGAMIND_DEV_OPEN_API") == "1":
            return
        import warnings
        warnings.warn(
            "MEGAMIND_API_KEY is not set. Set it in your .env file or set "
            "MEGAMIND_DEV_OPEN_API=1 for explicit local dev open-access mode.",
            stacklevel=2,
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="MEGAMIND_API_KEY is not configured",
        )

    if not x_api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing X-API-Key header",
        )

    # Constant-time comparison to prevent timing attacks
    if not hmac.compare_digest(x_api_key.strip(), expected.strip()):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid API key",
        )
