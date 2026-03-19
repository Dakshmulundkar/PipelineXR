# PipelineXR

> PipelineXR is a real-time DevOps analytics dashboard that monitors CI/CD pipelines, deployments, and security via GitHub integration. It delivers live build metrics, failure analysis, vulnerability scanning, and test reports through an intuitive dark UI powered by React, Express, Socket.io, and SQLite.

---

## The Problem

DevOps teams are flying blind. Pipeline failures, security vulnerabilities, and deployment issues are scattered across GitHub, terminal logs, and disconnected tools. There's no single place to see what's happening right now — or why things broke.

---

## Our Solution

PipelineXR brings everything into one real-time dashboard:

- **Live pipeline monitoring** via GitHub webhooks — no polling, event-driven updates
- **Build analytics** — success rates, duration trends, failure root cause analysis
- **Security scanning** — dependency audit, secret detection, SAST, container validation
- **Deployment tracking** — environment-specific stats and history
- **Test reports** — execution results and quality metrics
- **Multi-repo support** — switch between repositories instantly
- **GitHub OAuth** — secure login, no token juggling

---

## Setup

### Prerequisites

- Node.js 18+
- npm
- A GitHub account with OAuth app credentials

### 1. Clone & Install

```bash
git clone https://github.com/Dakshmulundkar/PipelineXR.git
cd PipelineXR
npm install
cd client && npm install && cd ..
```

### 2. Configure Environment

Copy `.env.example` to `.env` and fill in your values:

```env
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
GITHUB_TOKEN=your_personal_access_token
GITHUB_WEBHOOK_SECRET=your_webhook_secret
PORT=3001
SESSION_SECRET=your_session_secret
FRONTEND_URL=http://localhost:3001
```

**Create a GitHub OAuth App:**
1. Go to GitHub → Settings → Developer Settings → OAuth Apps → New OAuth App
2. Homepage URL: `http://localhost:3001`
3. Callback URL: `http://localhost:3001/auth/github/callback`
4. Copy the Client ID and Secret into `.env`

### 3. Initialize Database

```bash
node init-database.js
```

### 4. Webhook Setup (for live pipeline events)

Use [ngrok](https://ngrok.com) to expose your local server:

```bash
ngrok http 3001
```

Then in your GitHub repo → Settings → Webhooks → Add webhook:
- Payload URL: `https://<ngrok-url>/api/github/webhook`
- Content type: `application/json`
- Events: `workflow_run`, `workflow_job`, `check_run`

---

## Commands

```bash
# Start both server and client (recommended)
node start-both.js

# Start server only
node server/index.js

# Initialize / reset database
node init-database.js

# Docker
docker-compose up
```

App runs at **http://localhost:3001**

---

## Architecture

```
PipelineXR/
├── server/
│   └── index.js              # Express server, API routes, Socket.io
├── services/
│   ├── github.js             # GitHub API integration
│   ├── pipeline.js           # Pipeline state management
│   ├── analytics.js          # Metrics aggregation
│   ├── github-webhook.js     # Webhook event processor
│   ├── realtime-stream.js    # Socket.io event emitter
│   ├── metricsService.js     # Live metrics service
│   ├── testService.js        # Test report service
│   └── security/
│       ├── securityScanner.js  # Orchestrates all scans
│       ├── scanners.js         # Individual scan modules
│       ├── scanner-processor.js
│       └── trivyLite.js        # Container scanning
├── client/
│   ├── src/
│   │   ├── components/       # Layout, charts, stat cards
│   │   ├── pages/            # Dashboard, Pipelines, Security, Metrics, Reports
│   │   ├── contexts/         # AppContext (global state)
│   │   └── services/         # API client
│   └── vite.config.js
├── schema.sql                # SQLite schema
├── docker-compose.yml
└── .env.example
```

**Stack:**
- Frontend: React + Vite + Tailwind CSS
- Backend: Node.js + Express
- Realtime: Socket.io
- Database: SQLite
- Auth: GitHub OAuth
- Security: npm audit, custom SAST, Trivy (container)

---

## License

Copyright (c) 2026 Daksh Mulundkar. All rights reserved.
See [LICENSE](LICENSE) for details.
