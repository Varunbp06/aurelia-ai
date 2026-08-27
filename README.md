# Aurelia AI

> AI-powered customer support platform with multi-tenant knowledge bases, streaming chat, and an embeddable widget.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Python 3.11+](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/)
[![Next.js 14](https://img.shields.io/badge/Next.js-14-black.svg)](https://nextjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-green.svg)](https://fastapi.tiangolo.com/)

---

## What is Aurelia AI?

Aurelia AI is a full-stack AI customer support platform that lets you create intelligent chat agents backed by your own knowledge base. Upload documents, crawl websites, and build a Retrieval-Augmented Generation (RAG) system powered by Qdrant vector search. Deploy an embeddable chat widget on any website or manage agents through an admin dashboard.

### Key Features

- **Multi-Tenant Knowledge Bases** — Isolated per-agent knowledge with Qdrant-backed vector search
- **Streaming Chat (SSE)** — Real-time AI responses with source citations
- **Knowledge Ingestion** — Upload documents (PDF, DOCX, XLSX, TXT, MD, HTML) or crawl websites
- **Embeddable Widget** — Drop-in TypeScript widget for any website with localStorage sessions
- **Admin Dashboard** — Next.js 14 App Router dashboard with agent management, sessions, and settings
- **Multi-Provider LLM Support** — OpenAI, Anthropic Claude, Google Gemini, DeepSeek, and more
- **Human Takeover** — Support agents can take over AI conversations in real-time
- **Rate Limiting & Quotas** — Per-agent rate limits and workspace quotas
- **i18n** — English and Chinese localization
- **Dark/Light Theme** — Automatic theme detection with manual toggle

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Nginx (Reverse Proxy)             │
│                    Port 80 / 443                     │
├─────────────────┬───────────────────────────────────┤
│   Frontend      │           Backend                  │
│   Next.js 14    │           FastAPI                  │
│   Port 3000     │           Port 8000                │
│   App Router    │           Python 3.11+             │
│   React 18      │           SQLite / PostgreSQL      │
├─────────────────┼───────────────────────────────────┤
│                 │  ┌─────────┐  ┌─────────────────┐ │
│                 │  │  Redis  │  │     Qdrant      │ │
│                 │  │ Cache + │  │  Vector Search  │ │
│                 │  │  Queue  │  │  (RAG Backend)  │ │
│                 │  └─────────┘  └─────────────────┘ │
│                 │  ┌─────────────────────────────┐  │
│                 │  │   Scrapling Microservice    │  │
│                 │  │   Stealth URL Fetching      │  │
│                 │  └─────────────────────────────┘  │
└─────────────────┴───────────────────────────────────┘
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 14 (App Router), React 18, TypeScript |
| **Backend** | FastAPI, Python 3.11+, SQLAlchemy 2.0 (async) |
| **Database** | SQLite (dev) / PostgreSQL (prod), Redis (cache/queue) |
| **Vector DB** | Qdrant (per-tenant collections) |
| **Embeddings** | Jina AI, SiliconFlow, or OpenAI-compatible |
| **LLM Providers** | OpenAI, Anthropic, Google, DeepSeek, xAI, and more |
| **Scraping** | Scrapling (stealth HTTP + readability parsing) |
| **Widget** | TypeScript, esbuild, localStorage sessions |
| **Deployment** | Docker Compose, Nginx reverse proxy |

---

## Getting Started

### Prerequisites

- **Docker & Docker Compose** (recommended)
- Or: Python 3.11+, Node.js 18+, Redis, Qdrant

### Quick Start with Docker

```bash
# Clone the repository
git clone https://github.com/Varunbp06/aurelia-ai.git
cd aurelia-ai

# Start development environment
docker compose --profile dev up -d

# Access the application
# Frontend: http://localhost:3000
# Backend API: http://localhost:8000
# Qdrant Dashboard: http://localhost:6333/dashboard
```

### Local Development (without Docker)

```bash
# Backend
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp ../.env.example .env  # Configure your environment
python3 main.py

# Frontend (new terminal)
cd frontend-nextjs
npm install
npm run dev
```

### First-Time Setup

1. Navigate to `http://localhost:3000/register`
2. Create your admin account (first user becomes super_admin)
3. Configure your LLM provider API key in Settings
4. Set up embeddings (Jina, SiliconFlow, or OpenAI-compatible)
5. Create an agent and add knowledge sources

---

## Configuration

### Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Database (SQLite for dev, PostgreSQL for prod)
DATABASE_URL=sqlite:////app/data/aurelia.db

# Redis
REDIS_URL=redis://redis:6379/0

# Qdrant Vector Database
QDRANT_URL=http://qdrant:6333

# LLM API Key (configure per-agent in dashboard)
DEEPSEEK_API_KEY=your-key-here

# Embeddings (Jina for vector search)
JINA_API_KEY=your-jina-key-here

# JWT Authentication (auto-generated if empty)
SECRET_KEY=

# CORS (tighten for production)
ALLOWED_ORIGINS=https://yourdomain.com
```

### Per-Agent Configuration

Each agent has its own isolated configuration:
- **LLM Provider**: Model, API key, temperature, max tokens
- **Embeddings**: Provider (Jina/SiliconFlow), model, API base
- **Knowledge Base**: URLs, uploaded documents, similarity threshold
- **Widget**: Title, color, welcome message, allowed origins

---

## Production Deployment

### Docker Compose (Recommended)

```bash
# Production deployment
docker compose --profile prod up -d

# With HTTPS (place cert.pem and key.pem in ./ssl/)
docker compose --profile prod up -d
```

### Vercel (Frontend Only)

The Next.js frontend can be deployed to Vercel:

```bash
cd frontend-nextjs
vercel deploy
```

Set `NEXT_PUBLIC_API_BASE_URL` to your backend's public URL.

### Backend Deployment

The FastAPI backend requires a persistent server (not serverless). Options:
- **Railway** — Docker support, managed PostgreSQL/Redis
- **Render** — Docker support, free tier available
- **Fly.io** — Docker support, global edge deployment
- **VPS** — DigitalOcean, Linode, Hetzner

The backend needs:
1. Python 3.11+ runtime
2. Redis for caching and rate limiting
3. Qdrant for vector search
4. Persistent storage for SQLite or PostgreSQL

---

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/admin/register` | Register admin (bootstrap or public) |
| POST | `/api/admin/login` | Login, returns JWT token |
| GET | `/api/admin/me` | Get current admin profile |

### Agents
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/agents` | List all agents |
| POST | `/api/v1/agents` | Create new agent |
| PUT | `/api/v1/agent?agent_id=X` | Update agent config |
| DELETE | `/api/v1/agents/X` | Soft-delete agent |

### Chat
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/chat` | Non-streaming chat |
| POST | `/api/v1/chat/stream` | SSE streaming chat |

### Knowledge Base
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/urls:create` | Add URLs to crawl |
| POST | `/api/v1/files:upload` | Upload documents |
| POST | `/api/v1/index:rebuild` | Rebuild vector index |

---

## Security

- **JWT Authentication** with bcrypt password hashing
- **Rate Limiting** on login, registration, and API endpoints
- **SSRF Protection** via URL safety validation
- **CORS** configurable per-deployment
- **XSS Protection** with CSP headers
- **Input Validation** via Pydantic models
- **Workspace Isolation** per-tenant data separation
- **Soft Delete** with automatic purge scheduling

---

## Widget Integration

Embed the AI chat widget on any website:

```html
<script src="https://your-backend.com/sdk.js" data-agent-id="agt_xxxxxxxxxxxx"></script>
```

The widget provides:
- Floating chat bubble with customizable color
- Session persistence via localStorage
- Real-time streaming responses
- Source citations
- Human takeover support

---

## Project Structure

```
aurelia-ai/
├── backend/                 # FastAPI application
│   ├── api/                 # Route handlers
│   ├── services/            # Business logic
│   ├── models.py            # SQLAlchemy models
│   ├── config.py            # Settings & env
│   └── main.py              # App entrypoint
├── frontend-nextjs/         # Next.js 14 dashboard
│   ├── app/                 # App Router pages
│   ├── src/views/           # Page components
│   ├── src/components/      # Shared components
│   ├── src/services/        # API client
│   └── src/locales/         # i18n translations
├── widget/                  # Embeddable chat widget
├── scrapling-service/       # Stealth URL fetcher
├── nginx/                   # Reverse proxy config
├── tests/                   # E2E test suite
└── docker-compose.yml       # Docker orchestration
```

---

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

Copyright (c) 2026 haoyiyin

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/amazing-feature`)
3. Commit changes (`git commit -m 'feat: add amazing feature'`)
4. Push to branch (`git push origin feat/amazing-feature`)
5. Open a Pull Request

---

## Support

- **Issues**: [GitHub Issues](https://github.com/Varunbp06/aurelia-ai/issues)
- **Documentation**: See `docs/` directory
- **API Docs**: Available at `/docs` when backend is running
