# Aurelia AI Testing Guide

## Quick Start

### Run all backend tests

```bash
cd backend
pytest
```

### Run a single test file

```bash
cd backend
pytest tests/test_api.py
```

### Run a single test

```bash
cd backend
pytest tests/test_api.py::test_name
```

### Common pytest options

```bash
pytest -v                     # verbose output
pytest -x                     # stop on first failure
pytest --tb=short             # shortened tracebacks
pytest -k "pattern"           # filter tests by name
pytest -v -x --tb=short       # combine options
```

## Test Layers

| Layer | Location | Framework | Command |
|------|------|------|----------|
| Backend unit tests | `backend/tests/unit/` | pytest | `cd backend && pytest tests/unit/` |
| Backend contract tests | `backend/tests/contracts/` | pytest | `cd backend && pytest tests/contracts/` |
| Backend integration tests | `backend/tests/integration/` | pytest | `cd backend && pytest tests/integration/` |
| Backend security/stress/robustness | `backend/tests/` root | pytest | `cd backend && pytest tests/test_*.py` |
| Frontend typecheck + tests | `frontend-nextjs/` | tsc + vitest | `npm run typecheck && npm run test` |
| Widget typecheck + tests | `widget/` | tsc + vitest | `npm run typecheck && npm run test` |
| E2E tests (repo root) | `tests/e2e/` | Playwright | `npm run test:e2e` |

## Backend Test Characteristics

Backend test configuration (`backend/pytest.ini` + `backend/tests/conftest.py`):

- Automatically sets `BASJOO_TEST_MODE=1`
- Each test uses an isolated SQLite database (`backend/.pytest_dbs/`)
- Qdrant/Jina/LLM integrations are monkeypatched, so most API tests need no external services
- Redis/Qdrant hostnames automatically fall back between Docker container names and localhost
- Use the `client` fixture for authenticated admin requests and the `public_client` fixture for unauthenticated/public route tests

## E2E Test Environments

E2E tests support two run modes:

| Mode | Target environment | Entry URL | Purpose |
|------|----------|----------|----------|
| **smoke (default)** | Docker dev stack | `http://localhost:3000` | Quick functional verification |
| **prod-like** | Docker production stack | `http://localhost:80` (nginx) | Production-like testing |

### Smoke Tests (Dev Environment)

```bash
# Playwright automatically checks whether :3000 is ready
npm run test:e2e
```

### Prod-like Tests (Production-like Environment)

**Important: prod-like tests require manually starting the production Docker stack**

```bash
# 1. Start the production environment (must be run manually)
docker compose --profile prod up -d

# 2. Confirm nginx is running on localhost:80
curl http://localhost/health  # should return 200

# 3. Run the prod-like tests
npm run test:e2e:prod
```

**Environment variables:**
| Variable | smoke | prod-like |
|------|-------|-----------|
| `E2E_ENV` | not set | `prod` |
| `API_BASE_URL` | `localhost:8000` | `localhost` (via nginx) |
| `BASE_URL` | `localhost:3000` | `localhost:80` |

### Cross-origin Widget Tests

```bash
# Requires configuring the host pages (allowed-host, blocked-host)
npm run test:e2e:widget
# Or equivalently:
HOST_ALLOWED_URL=http://allowed.local \
HOST_BLOCKED_URL=http://blocked.local \
npx playwright test --config=tests/e2e/playwright.config.ts --project=widget-cross-origin
```

#### Widget Cross-origin Test Configuration

Widget cross-origin tests need two host pages served from different origins.

**1. Configure /etc/hosts**

Add the following entries to `/etc/hosts`:

```
127.0.0.1 allowed.local
127.0.0.1 blocked.local
```

**2. Start the host services**

```bash
docker compose --profile dev up -d allowed-host blocked-host
```

Or serve the host pages manually:

```bash
cd tests/environments/host-pages/allowed-host
python3 -m http.server 8080

cd tests/environments/host-pages/blocked-host
python3 -m http.server 8081
```

**3. Set the environment variables**

```bash
export HOST_ALLOWED_URL=http://allowed.local:8080
export HOST_BLOCKED_URL=http://blocked.local:8081
```

**4. Run the tests**

```bash
npm run test:e2e:widget
```

### Run All E2E Tests

```bash
npm run test:e2e:all
# Or equivalently:
npx playwright test --config=tests/e2e/playwright.config.ts
```

## E2E Test Directory Structure

```
tests/
├── e2e/
│   ├── playwright.config.ts    # Playwright configuration
│   ├── global.setup.ts         # Global setup (creates admin, seeds data)
│   ├── fixtures/
│   │   ├── admin.fixture.ts    # Admin login helpers
│   │   └── widget.fixture.ts   # Widget interaction helpers
│   └── specs/
│       ├── admin-auth.spec.ts           # Admin authentication flow
│       ├── playground-streaming.spec.ts # Playground auto-save + streaming chat
│       ├── knowledge-indexing.spec.ts   # Knowledge base import -> indexing -> retrieval
│       ├── sessions-takeover.spec.ts    # Session center + human takeover
│       └── widget-cross-origin.spec.ts  # Widget cross-origin embedding
├── environments/
│   ├── host-pages/
│   │   ├── allowed-host/       # Host page where embedding is allowed
│   │   └── blocked-host/       # Host page where embedding is blocked
│   └── stubs/
│       └── crawl-target/       # Test site for URL crawling
└── README.md
```

## Environment Variables

| Variable | Description | Default |
|------|------|--------|
| `BASE_URL` | Admin dashboard URL | `http://localhost:3000` |
| `API_BASE_URL` | Backend API URL | `http://localhost:8000` |
| `ADMIN_EMAIL` | Test admin email | `test@example.com` |
| `ADMIN_PASSWORD` | Test admin password | `testpassword123` |
| `E2E_ENV` | Test environment (`dev`/`prod`) | `dev` |
| `HOST_ALLOWED_URL` | Host page URL where embedding is allowed | - |
| `HOST_BLOCKED_URL` | Host page URL where embedding is blocked | - |
| `CRAWL_TARGET_URL` | URL crawl test site | `http://host.docker.internal:8081` |
