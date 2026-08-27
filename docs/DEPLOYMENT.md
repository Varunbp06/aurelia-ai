# Aurelia AI — Backend Deployment Guide

This guide covers deploying the FastAPI backend separately from the Next.js frontend (which runs on Vercel). The backend requires a persistent Python server with background tasks, SQLite/PostgreSQL, and optional Redis/Qdrant for production features.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  Frontend (Vercel)                                       │
│  https://aurelia-ai-topaz.vercel.app                    │
│  Next.js 14 App Router                                   │
└──────────────────────┬──────────────────────────────────┘
                       │ /api/* rewrites
                       ▼
┌─────────────────────────────────────────────────────────┐
│  Backend (Render / Railway / Fly.io / VPS)              │
│  https://your-backend.onrender.com                      │
│  FastAPI + Python 3.11                                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │ SQLite/  │  │  Redis   │  │  Qdrant  │              │
│  │PostgreSQL│  │ (cache)  │  │ (vectors)│              │
│  └──────────┘  └──────────┘  └──────────┘              │
└─────────────────────────────────────────────────────────┘
```

---

## Option 1: Render (Recommended)

Render provides managed PostgreSQL, Redis, and Docker web services.

### Prerequisites
- GitHub account with the repository
- Render account (https://dashboard.render.com)

### Step 1: Create Render Account
1. Go to https://render.com and sign up with GitHub
2. Verify your email

### Step 2: Get API Key
1. Go to Account Settings → API Keys
2. Click "Create API Key"
3. Copy the key (format: `rnd_...`)

### Step 3: Deploy via API

```bash
# Set your API key
export RENDER_API_KEY="rnd_your_api_key_here"

# Get your owner ID
curl -s "https://api.render.com/v1/owners" \
  -H "Authorization: Bearer $RENDER_API_KEY"

# Create the backend service
curl -X POST "https://api.render.com/v1/services" \
  -H "Authorization: Bearer $RENDER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "aurelia-backend",
    "ownerId": "YOUR_OWNER_ID",
    "type": "web_service",
    "autoDeploy": "yes",
    "repo": "https://github.com/Varunbp06/aurelia-ai",
    "branch": "main",
    "rootDir": "backend",
    "serviceDetails": {
      "env": "docker",
      "plan": "free",
      "region": "oregon",
      "numInstances": 1,
      "buildPlan": "starter",
      "healthCheckPath": "/health",
      "runtime": "docker",
      "envSpecificDetails": {
        "dockerfilePath": "./Dockerfile",
        "dockerContext": "."
      },
      "envVars": [
        {"key": "DATABASE_URL", "value": "sqlite:///./data/aurelia.db"},
        {"key": "ALLOWED_ORIGINS", "value": "https://aurelia-ai-topaz.vercel.app"},
        {"key": "PUBLIC_REGISTRATION_ENABLED", "value": "true"},
        {"key": "LOG_LEVEL", "value": "INFO"}
      ]
    }
  }'
```

### Step 4: Connect Frontend to Backend

```bash
# Set BACKEND_PROXY_TARGET on Vercel
cd frontend-nextjs
vercel env add BACKEND_PROXY_TARGET production
# Paste: https://your-backend.onrender.com

# Redeploy frontend
vercel --prod
```

### Step 5: Verify Deployment

```bash
# Test backend health
curl https://your-backend.onrender.com/health

# Test through Vercel proxy
curl https://aurelia-ai-topaz.vercel.app/health
```

### Render Free Tier Notes
- Spins down after 15 minutes of inactivity
- First request after spin-down takes 30-60 seconds
- SQLite data persists (ephemeral disk)
- Upgrade to paid plan for always-on service

---

## Option 2: Railway

Railway provides Docker support with managed databases.

### Prerequisites
- Railway account (https://railway.app)
- Railway CLI installed

### Step 1: Install Railway CLI

```bash
npm install -g @railway/cli
```

### Step 2: Login and Link Project

```bash
railway login
railway link
```

### Step 3: Create Services

```bash
# Create PostgreSQL database
railway service create aurelia-db --database postgresql

# Create Redis
railway service create aurelia-redis --database redis

# Create the backend service
railway service create aurelia-backend
```

### Step 4: Configure Environment Variables

```bash
# Set environment variables
railway variables set DATABASE_URL="${{PostgreSQL.DATABASE_URL}}"
railway variables set REDIS_URL="${{Redis.REDIS_URL}}"
railway variables set ALLOWED_ORIGINS="https://aurelia-ai-topaz.vercel.app"
railway variables set PUBLIC_REGISTRATION_ENABLED="true"
railway variables set LOG_LEVEL="INFO"
```

### Step 5: Deploy

```bash
# Deploy the backend
railway up --service aurelia-backend
```

### Step 6: Connect Frontend

```bash
# Get the backend URL
railway status --service aurelia-backend

# Set on Vercel
cd frontend-nextjs
vercel env add BACKEND_PROXY_TARGET production
# Paste the Railway backend URL

vercel --prod
```

---

## Option 3: Fly.io

Fly.io provides global edge deployment with Docker support.

### Prerequisites
- Fly.io account (https://fly.io)
- flyctl CLI installed

### Step 1: Install flyctl

```bash
curl -L https://fly.io/install.sh | sh
```

### Step 2: Login

```bash
fly auth login
```

### Step 3: Launch App

```bash
cd backend
fly launch --name aurelia-backend
```

### Step 4: Configure

Edit `fly.toml`:

```toml
app = "aurelia-backend"
primary_region = "sjc"

[build]
  dockerfile = "Dockerfile"

[http_service]
  internal_port = 8000
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 0

  [http_service.concurrency]
    type = "connections"
    hard_limit = 25
    soft_limit = 20

[[vm]]
  memory = "512mb"
  cpu_kind = "shared"
  cpus = 1
```

### Step 5: Set Secrets

```bash
fly secrets set DATABASE_URL="sqlite:///./data/aurelia.db"
fly secrets set ALLOWED_ORIGINS="https://aurelia-ai-topaz.vercel.app"
fly secrets set PUBLIC_REGISTRATION_ENABLED="true"
```

### Step 6: Deploy

```bash
fly deploy
```

### Step 7: Connect Frontend

```bash
# Get the backend URL
fly status

# Set on Vercel
cd frontend-nextjs
vercel env add BACKEND_PROXY_TARGET production
# Paste: https://aurelia-backend.fly.dev

vercel --prod
```

---

## Option 4: VPS (DigitalOcean, Linode, Hetzner)

For full control, deploy on a Virtual Private Server.

### Prerequisites
- VPS with Docker installed (Ubuntu 22.04+ recommended)
- SSH access to the server
- Domain name (optional, for HTTPS)

### Step 1: Prepare Server

```bash
# SSH into your server
ssh root@your-server-ip

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Install Docker Compose
apt install docker-compose -y

# Clone the repository
git clone https://github.com/Varunbp06/aurelia-ai.git
cd aurelia-ai
```

### Step 2: Create Environment File

```bash
cat > .env << 'EOF'
DATABASE_URL=sqlite:///./data/aurelia.db
ALLOWED_ORIGINS=https://your-domain.com,https://aurelia-ai-topaz.vercel.app
PUBLIC_REGISTRATION_ENABLED=true
LOG_LEVEL=INFO
SECRET_KEY=
ENCRYPTION_KEY=
EOF
```

### Step 3: Deploy with Docker Compose

```bash
# Start the backend
docker compose --profile prod up -d backend-prod

# Check status
docker compose --profile prod ps

# View logs
docker compose --profile prod logs -f backend-prod
```

### Step 4: Set Up Reverse Proxy (Optional)

For HTTPS, use nginx:

```bash
# Install nginx
apt install nginx -y

# Create nginx config
cat > /etc/nginx/sites-available/aurelia << 'EOF'
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

# Enable site
ln -s /etc/nginx/sites-available/aurelia /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

### Step 5: Set Up SSL (Optional)

```bash
# Install Certbot
apt install certbot python3-certbot-nginx -y

# Get SSL certificate
certbot --nginx -d your-domain.com
```

### Step 6: Connect Frontend

```bash
# Set on Vercel
cd frontend-nextjs
vercel env add BACKEND_PROXY_TARGET production
# Paste: https://your-domain.com

vercel --prod
```

---

## Environment Variables Reference

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | Database connection string | `sqlite:///./data/aurelia.db` |
| `ALLOWED_ORIGINS` | CORS allowed origins | `https://aurelia-ai-topaz.vercel.app` |
| `PUBLIC_REGISTRATION_ENABLED` | Allow public registration | `true` |

### Optional (Recommended for Production)

| Variable | Description | Default |
|----------|-------------|---------|
| `REDIS_URL` | Redis connection string | `redis://localhost:6379/0` |
| `QDRANT_URL` | Qdrant vector DB URL | `http://localhost:6333` |
| `SECRET_KEY` | JWT secret key | Auto-generated |
| `ENCRYPTION_KEY` | API key encryption key | Auto-generated |
| `LOG_LEVEL` | Logging level | `INFO` |
| `DEFAULT_RATE_LIMIT` | Default rate limit | `100` |
| `RATE_LIMIT_PER Minute` | Rate limit per minute | `1000` |

### LLM API Keys (Configure per-agent in dashboard)

| Variable | Description |
|----------|-------------|
| `DEEPSEEK_API_KEY` | DeepSeek API key |
| `OPENAI_API_KEY` | OpenAI API key |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `GOOGLE_API_KEY` | Google Gemini API key |
| `JINA_API_KEY` | Jina AI embedding key |

---

## Post-Deployment Steps

### 1. Create Admin Account
1. Open https://aurelia-ai-topaz.vercel.app/register
2. Create your admin account (first user = super_admin)
3. Login with your new credentials

### 2. Configure LLM Provider
1. Go to Agent Settings in the dashboard
2. Enter your LLM API key (DeepSeek, OpenAI, etc.)
3. Test the API connection

### 3. Set Up Embeddings
1. Go to Knowledge Base setup
2. Choose embedding provider (Jina or SiliconFlow)
3. Enter API key
4. Test embedding connection

### 4. Add Knowledge Sources
1. Create an agent
2. Add URLs to crawl or upload documents
3. Build the knowledge base index
4. Test chat with knowledge

---

## Troubleshooting

### Backend Not Responding
```bash
# Check backend logs
# Render: Dashboard → Logs
# Railway: railway logs
# Fly.io: fly logs
# VPS: docker compose logs backend-prod
```

### CORS Errors
Ensure `ALLOWED_ORIGINS` includes your Vercel frontend URL:
```
ALLOWED_ORIGINS=https://aurelia-ai-topaz.vercel.app
```

### Database Connection Issues
- SQLite: Ensure write permissions to `/data/` directory
- PostgreSQL: Verify `DATABASE_URL` format is correct

### API Key Not Working
- Check API key is valid with the provider
- Ensure no extra spaces in the key
- Test with the "Test API" button in dashboard

---

## Production Recommendations

1. **Use PostgreSQL** instead of SQLite for reliability
2. **Add Redis** for rate limiting and caching
3. **Deploy Qdrant** for vector search (RAG)
4. **Enable HTTPS** with SSL certificates
5. **Set up monitoring** (logs, health checks)
6. **Configure backups** for database
7. **Use environment-specific configs** (dev/staging/prod)

---

## Support

- **Issues**: https://github.com/Varunbp06/aurelia-ai/issues
- **Documentation**: See `docs/` directory
- **API Docs**: Available at `/docs` when backend is running
