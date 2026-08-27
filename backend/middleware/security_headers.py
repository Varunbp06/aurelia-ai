"""
Security headers middleware — minimal, compatible, no logic change.

Adds OWASP-recommended headers without breaking SSE/widget/docs.
Uses existing FastAPI middleware stack (starlette BaseHTTPMiddleware).
"""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        path = request.url.path

        # Core hardening — safe for all routes
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        response.headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
        # Allow widget embedding via script; deny framing of admin UI
        # Frontend served via nginx adds its own CSP; backend API keeps minimal CSP
        if path.startswith("/api/") or path in ("/health", "/openapi.json", "/docs"):
            response.headers.setdefault("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
        else:
            # SDK/widget/static assets may be embedded cross-origin
            response.headers.setdefault("Content-Security-Policy", "default-src 'self'; frame-ancestors 'none'")

        # HSTS — only when behind TLS (X-Forwarded-Proto=https from nginx)
        xfp = request.headers.get("x-forwarded-proto", "")
        if xfp == "https" or request.url.scheme == "https":
            response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")

        # Patch CSP to allow stitch Google Fonts (preserve stitch typography)
        csp = response.headers.get("Content-Security-Policy", "")
        if "fonts.googleapis.com" not in csp:
            # Backend CSP is minimal; allow stitch fonts without weakening API framing
            if "style-src" in csp:
                csp = csp.replace("style-src 'self'", "style-src 'self' https://fonts.googleapis.com")
                csp = csp.replace("font-src 'self'", "font-src 'self' https://fonts.gstatic.com")
                response.headers["Content-Security-Policy"] = csp

        return response
