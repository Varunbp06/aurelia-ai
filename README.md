# Aurelia AI — AI Customer Support Platform

[![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js)](https://nextjs.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-Python-009688?logo=fastapi)](https://fastapi.tiangolo.com)
[![Qdrant](https://img.shields.io/badge/Qdrant-Vector_DB-FF6B6B)](https://qdrant.tech)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Aurelia AI** is a production-grade, self-hostable AI customer-support platform. Create isolated AI agents, connect website URLs and documents as knowledge, and embed a streaming chat widget on any site — with human takeover, multi-tenant isolation, and provider-agnostic LLM/embedding support.

> **Original project:** `haoyiyin/basjoo` (MIT, Copyright 2026 haoyiyin) — attribution preserved in [LICENSE](LICENSE). This repository is a deployment-hardened, Vercel-ready distribution under your GitHub identity.

---

## Purpose

Enable support teams to handle high-volume, emotionally charged customer interactions with a calm, reliable AI partner — not a cold analytics tool. The UI follows a **Humanistic Utility** design (warm stone-white, indigo primary, tactile paper layering) to reduce eye strain during long shifts.

## Features

- **Isolated agents** — per-workspace, per-agent knowledge, persona, rate limits, widget appearance
- **Knowledge ingestion** — URL crawling (Scrapling microservice with TLS impersonation) + file upload (PDF/TXT/MD/HTML/DOCX/XLSX) → chunk → embed (Jina/SiliconFlow/custom OpenAI-compatible) → Qdrant per-tenant collections
- **Streaming chat** — SSE `POST /api/v1/chat/stream` with source citations, RRF similarity scores, context-aware retrieval
- **Embeddable widget** — `widget/src/AureliaWidget.tsx` (esbuild ESM + IIFE), auto-detects `apiBase`, persists `visitor/session` in `localStorage`, human-takeover polling
- **Human takeover** — `POST /api/v1/admin/sessions/{id}/takeover` pauses AI, admin composes via `POST /api/v1/admin/sessions/send` + WebSocket `WS /api/v1/ws/admin`
- **Sessions center** — three-pane (list / conversation / context), real visitor `city/country`, status `active|taken_over|closed`
- **Playground** — two-pane tester with 400px Inspector: Provider/Temperature/System Prompt/Retrieved Context (real `sources`)
- **Team management** — `super_admin | admin | support` + per-agent `AgentMember`, JWT auth, rate limits, encrypted API keys (Fernet)
- **Dashboard** — real metrics: active sessions, knowledge sources, ready blocks, 7-day session volume (bars from `sessions:summary`), activity feed, coverage, system status + WebGL shader (dashboard hero only, lazy, `prefers-reduced-motion` fallback)

## Architecture

```
[Browser] → Next.js 14 (App Router) → rewrites /api/* → FastAPI (8000)
                                         ↕
[Widget] → SSE /api/v1/chat/stream → llm_service (OpenAI/Google/Anthropic/DeepSeek/xAI/OpenRouter/SiliconFlow)
[Scrapling:8001] ← url_safety (SSRF) ← kb_document_processor → Qdrant (6333) ← kb_retrieval
Postgres (5432) / Redis (6379) — workspaces, agents, sessions, quotas, locks
```

- `backend/main.py` — app factory, CORS/i18n/rate-limit/body-size middleware, scheduler/Redis
- `backend/api/` — thin routers; `backend/services/` — logic; `backend/models.py` — `Workspace|Agent|URLSource|KnowledgeFile|ChatSession|...`
- `frontend-nextjs/app/` — routes, `src/views/` — screens, `src/components/AdminLayout.tsx:506` — shell (260px fixed, 64px tablet rail)
- `stitch_aurelia_ai_support_dashboard/` — authoritative visual source (8 HTML + DESIGN.md + shader), never modified
- `widget/` — `dist/aurelia-widget.js` (ESM) + `.min.js` (IIFE), `npm run sync-widget` → `backend/static/`

## Technology Stack

- **Frontend:** Next.js 14, React 18, TypeScript, i18next, `react-markdown` — plain CSS variables (no Tailwind runtime), `src/router/react-router-dom.tsx` shim preserved
- **Backend:** FastAPI, SQLAlchemy async (SQLite/Postgres), Redis, Qdrant REST, pgvector, APScheduler, `curl_cffi` + `readability-lxml`
- **Widget:** TypeScript, esbuild, SSE
- **Infra:** Docker Compose (dev `3000:3000`/`8000:8000`, prod `nginx` 80/443), `install-deploy.sh` one-command Ubuntu/Debian

## Setup

### Docker (recommended)

```bash
docker compose --profile dev up -d --build   # dev: http://localhost:3000 + http://localhost:18000
docker compose --profile prod up -d --build  # prod: nginx 80/443 + backend-data volume
docker compose logs -f backend-dev frontend-dev
```

Default dev admin (auto-created if no admins): `admin@aurelia.ai` / `Aurelia123!` — or register at `/register` (public registration `PUBLIC_REGISTRATION_ENABLED=true`).

### Local (without Docker)

```bash
# Backend
cd backend && python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt && python3 main.py  # http://localhost:8000

# Frontend
cd frontend-nextjs && npm install && npm run dev     # http://localhost:3000 (proxies /api → BACKEND_PROXY_TARGET)

# Widget
cd widget && npm install && npm run build && npm run sync-widget
```

Health: `curl http://localhost:18000/health` / `curl http://localhost:3000/health` (via rewrites)

## Usage

1. **Create agent** at `/agents` — name (≤10 display width), type (`website_support|ai_clone|sales_outreach|custom`), description
2. **Configure KB** — `Agents → Dashboard → Initialize Knowledge Base` (choose `jina|siliconflow|custom`, model, `jina_...`/`sk-...` — tested via `testEmbeddingApi`, stored encrypted)
3. **Add knowledge** — `/agents/:id/urls` (Add URL / Crawl Site) + `/agents/:id/files` (drop PDF/DOCX/XLSX)
4. **Test** — `/agents/:id/playground` (Provider/Temperature/System Prompt → streaming chat + Retrieved Context)
5. **Embed** — `/agents/:id/settings/agent` → copy `<script src=".../sdk.js" data-agent-id="agt_...">`
6. **Operate** — `/agents/:id/sessions` → `Take Over` → compose as human (WebSocket live)

## Configuration

Backend `pydantic-settings` (`.env` or env vars, persisted to `/app/data/`):

| Var | Purpose | Default |
|-----|---------|---------|
| `DATABASE_URL` | `sqlite:////app/data/aurelia.db` or `postgresql://...` | `sqlite` |
| `REDIS_URL` | rate-limit/cache | `redis://redis:6379/0` |
| `QDRANT_URL` | vector DB | `http://qdrant:6333` |
| `SECRET_KEY` / `SECRET_KEY_FILE` | JWT | auto-generated → `/app/data/.secret_key` |
| `ENCRYPTION_KEY` / `ENCRYPTION_KEY_FILE` | Fernet for `api_key` | auto → `/app/data/.encryption_key` |
| `DEFAULT_AGENT_ID` | preserve old widget embeds across redeploys | auto |
| `PUBLIC_REGISTRATION_ENABLED` | self-service sign-up (isolated workspace per signup) | `true` (dev) |
| `DEEPSEEK_API_KEY` / `JINA_API_KEY` / `SILICONFLOW_API_KEY` | provider keys (also per-agent encrypted) | `""` |
| `BACKEND_PROXY_TARGET` | Next.js rewrites target (Docker `http://backend-dev:8000`, Vercel `https://your-backend.example.com`) | `http://localhost:8000` |
| `NEXT_PUBLIC_API_BASE_URL` | browser API base (empty = same-origin rewrites) | `""` |

Frontend `frontend-nextjs/.env.example` documents the above; never commit `.env`.

## Security Considerations

- **SSRF:** all URLs via `backend/services/url_safety.py` (blocks loopback/RFC1918/link-local, LRU DNS cache, allows `198.18.0.0/15` benchmarking)
- **Widget whitelist:** per-agent `allowed_widget_origins` enforced on public chat; admin bypasses for testing
- **CORS:** `backend/middleware/rate_limit.py` `apply_cors_headers` handles early 429/413; `cors_allow_null_origin` off by default
- **Headers:** `next.config.mjs:22` `nosniff/DENY/strict-origin-when-cross-origin/Permissions-Policy/CSP frame-ancestors 'none'` + `/_next/static` immutable
- **Secrets:** never in `localStorage` except JWT `token`; `api_key` masked `api_key_masked`, encrypted at rest; `.gitignore` excludes `.env`, `*.db`, `ssl/`, `backend/data/`
- **XSS:** `MarkdownRenderer.tsx:19` `react-markdown` + `rel=noopener`, no `dangerouslySetInnerHTML` for user content (only Next.js error page), password fields `suppressHydrationWarning` + `data-1p-ignore` to avoid manager injection `img` hydration mismatch
- **Rate limits:** `RATE_LIMIT_PER_MINUTE/BURST_SIZE`, `login 5/300s`, `register 5/3600s`, `TaskLock` for crawl/rebuild
- **Validation:** file upload validated (5 files, 20MB, txt/md/html/pdf/docx/xlsx), URL `normalizeUrl`, Zod where applicable

## Deployment

### Vercel (frontend)

Frontend is **Vercel-ready** (`VERCEL=1` build `✓ Compiled`, `output` conditional `...(VERCEL!=='1'?{standalone}:{})`, `getLocale` guards `window`):

1. Import GitHub repo in Vercel → Root Directory `frontend-nextjs`
2. Environment Variables: `BACKEND_PROXY_TARGET=https://your-backend.example.com` (keep `NEXT_PUBLIC_API_BASE_URL` empty for same-origin rewrites)
3. Build Command `npm run build` (runs `tsc`/`eslint` — warnings only, no `ignoreDuringBuilds`)
4. Backend/Qdrant/Redis/Postgres stay on your VM/Docker (not on Vercel)

### Docker prod

```bash
sudo sh install-deploy.sh  # or docker compose --profile prod up -d --build
# Preserve volume: backend-data (contains aurelia.db + .secret_key + .agent_id)
```

## Important Notes

- `stitch_aurelia_ai_support_dashboard/` is the visual source of truth — do not edit; `src/index.css:7` tokens + `AdminLayout.tsx` re-skin preserve `navItemsConfig` + SVG meaning
- `src/router/react-router-dom.tsx` shim is intentional — do not install real `react-router-dom` runtime
- Keep Next 14 / React 18 unless verified requirement
- Direct-login: `AuthContext.tsx:89` auto-logs `admin@aurelia.ai` on first load so `http://localhost:3000/` is immediately usable without manual login (bypasses the `img` hydration gate); manual `http://localhost:3000/login` still works
- Original attribution: see [LICENSE](LICENSE) (MIT © 2026 haoyiyin) — presentation/ownership under your GitHub identity, source preserved

---

**Local quick start:** `docker compose --profile dev up -d` → `http://localhost:3000/` (auto `admin@aurelia.ai` / `Aurelia123!`) → `http://localhost:3000/login` / `http://localhost:3000/register` — both `Aurelia AI` / `Secure Admin Console`, zero `Basjoo` user-facing.
