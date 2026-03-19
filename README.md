<div align="center">

<img src="client/public/vite.svg" width="64" height="64" alt="PipelineXR Logo" />

# PipelineXR

**Real-time CI/CD observability for engineering teams**

[![License](https://img.shields.io/badge/license-Proprietary-red.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org)
[![Version](https://img.shields.io/badge/version-0.3.2-blue.svg)]()

[Overview](#overview) · [Features](#features) · [Quick Start](#quick-start) · [Configuration](#configuration) · [Architecture](#architecture) · [Contributing](#contributing)

</div>

---

## Overview

PipelineXR is a self-hosted DevOps analytics platform that gives engineering teams a single pane of glass over their GitHub Actions pipelines. It combines real-time pipeline monitoring, DORA metrics, multi-layer security scanning, and AI-assisted remediation into one cohesive dashboard — without sending your data to a third-party SaaS.

> Built for teams that care about pipeline health, security posture, and deployment confidence.

---

## Features

### Pipeline Observability
- Real-time pipeline feed powered by GitHub webhooks (no polling)
- Per-run stage visualization in enforced order: **Build → Security → Test → Deploy**
- Run history with duration, branch, trigger, and conclusion tracking
- Socket.io live updates across all connected clients

### DORA Metrics
- Deployment frequency, success rate, and average build duration
- 7-day trend charts with daily granularity
- Automatic sync from GitHub Actions on page load

### Security Scanning
- **Dependency audit** — npm audit with high/critical severity gating
- **Secret detection** — regex-based scan across the entire codebase
- **SAST** — static analysis for dangerous patterns (eval, hardcoded credentials)
- **Container scan** — Dockerfile best-practice validation
- **License scan** — open source license compliance
- **IaC scan** — Terraform / CloudFormation misconfiguration detection
- **SBOM generation** — CycloneDX 1.6 format, full transitive dependency tree
- **Trivy integration** — uses local binary when available, falls back to built-in TrivyLite engine automatically
- **Snyk integration** — additional vulnerability intelligence via Snyk API

### AI-Assisted Remediation
- Google Gemini-powered fix suggestions for detected vulnerabilities
- Contextual remediation steps surfaced directly in the Security page

### Audit Reports
- Workflow job archives with step-level pass/fail scoring
- Quality index per suite
- One-click PDF export via Puppeteer

### Multi-Repo Support
- Switch between repositories instantly from the global selector
- All views — pipelines, metrics, security, reports — scope to the selected repo

---

## Quick Start

### Prerequisites

| Requirement | Version |
|---|---|
| Node.js | ≥ 18.0.0 |
| npm | ≥ 9.0.0 |
| GitHub Account | OAuth App + Personal Access Token |

### 1. Clone the repository

```bash
git clone https://github.com/Dakshmulundkar/PipelineXR.git
cd PipelineXR
```

### 2. Install dependencies

```bash
npm install
cd client
npm install
cd ..
```

### 3. Configure environment

```bash
cp .env.example .env
```

Open `.env` and fill in your values — see [Configuration](#configuration) for details.

### 4. Initialize the database

```bash
node init-database.js
```

### 5. Start the application

```bash
node start-both.js
```

| Service | URL |
|---|---|
| Frontend | http://localhost:5174 |
| Backend API | http://localhost:3001 |

---

## Configuration

All configuration is managed via environment variables. Copy `.env.example` to `.env` to get started.

### GitHub OAuth App

1. Go to **GitHub → Settings → Developer Settings → OAuth Apps → New OAuth App**
2. Set the following:
   - Homepage URL: `http://localhost:5174`
   - Authorization callback URL: `http://localhost:3001/auth/github/callback`
3. Copy the **Client ID** and **Client Secret** into your `.env`

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GITHUB_CLIENT_ID` | ✅ | OAuth App Client ID |
| `GITHUB_CLIENT_SECRET` | ✅ | OAuth App Client Secret |
| `GITHUB_TOKEN` | ✅ | Personal Access Token (classic) — scopes: `repo`, `workflow`, `read:org` |
| `SESSION_SECRET` | ✅ | Random string for session encryption |
| `PORT` | ✅ | Backend port (default: `3001`) |
| `FRONTEND_URL` | ✅ | Frontend origin (default: `http://localhost:5174`) |
| `DATABASE_PATH` | ✅ | SQLite file path (default: `./devops.sqlite`) |
| `GEMINI_API_KEY` | ⚡ | Google Gemini API key for AI remediation |
| `SNYK_TOKEN` | ⚡ | Snyk Personal API Token |
| `SNYK_ORG_ID` | ⚡ | Snyk Organization ID |
| `GITHUB_WEBHOOK_SECRET` | ⚡ | Webhook signature validation secret |

> ⚡ Optional but recommended for full feature coverage.

### Webhook Setup (Live Pipeline Events)

Webhooks enable real-time pipeline updates without polling. Use [ngrok](https://ngrok.com) for local development:

```bash
ngrok http 3001
```

In your GitHub repository → **Settings → Webhooks → Add webhook**:

| Field | Value |
|---|---|
| Payload URL | `https://<your-ngrok-url>/api/github/webhook` |
| Content type | `application/json` |
| Events | `workflow_run`, `workflow_job`, `check_run` |

### Trivy (Optional)

PipelineXR uses its built-in TrivyLite engine by default. To use the full Trivy binary for more comprehensive scanning:

```bash
npm run install:trivy
```

---

## Docker

```bash
docker-compose up
```

The compose file starts the full stack. Ensure your `.env` is configured before running.

---

## Architecture

```
PipelineXR/
├── server/
│   └── index.js                  # Express 5, REST API, Socket.io, GitHub OAuth
├── services/
│   ├── github.js                 # GitHub API client (Octokit)
│   ├── github-webhook.js         # Webhook event processor
│   ├── pipeline.js               # Pipeline state management
│   ├── pipeline-logger.js        # Run persistence
│   ├── analytics.js              # Metrics aggregation
│   ├── metricsService.js         # DORA metrics + GitHub sync
│   ├── testService.js            # Audit report service
│   ├── realtime-stream.js        # Socket.io broadcaster
│   ├── database.js               # SQLite connection singleton
│   ├── db-init.js                # Schema bootstrap
│   ├── runner.js                 # Pipeline runner
│   ├── securityService.js        # Security API layer
│   └── security/
│       ├── securityScanner.js    # Scan orchestrator
│       ├── scanners.js           # All scan modules + SBOM generation
│       ├── scanner-processor.js  # Result normalizer
│       └── trivyLite.js          # Built-in fallback scanner engine
├── client/
│   └── src/
│       ├── pages/                # Dashboard, Pipelines, Metrics, Security, Reports
│       ├── components/           # Layout, StatCard, ChartCard, PipelineStageBar, DataTable
│       ├── contexts/             # AppContext — global repo selection and auth state
│       └── services/             # api.js — Axios-based API client
├── schema.sql                    # SQLite schema definition
├── init-database.js              # Database initializer
├── start-both.js                 # Concurrent server + Vite dev launcher
├── docker-compose.yml
└── .env.example
```

### Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS |
| Backend | Node.js, Express 5 |
| Realtime | Socket.io |
| Database | SQLite (sqlite3) |
| Auth | GitHub OAuth, express-session |
| Security | npm audit, custom SAST, Trivy / TrivyLite, Snyk |
| AI | Google Gemini (`@google/generative-ai`) |
| PDF | Puppeteer |

---

## Scripts

```bash
node start-both.js        # Start server + client (recommended)
node server/index.js      # Start server only
node init-database.js     # Initialize or reset the database
npm run install:trivy     # Install Trivy binary locally
docker-compose up         # Run full stack in Docker
```

---

## Contributing

This is a proprietary product. External contributions are not accepted at this time.  
For bug reports or feature requests, please open an issue.

---

## License

Copyright © 2026 Daksh Mulundkar. All rights reserved.  
See [LICENSE](LICENSE) for full terms.

