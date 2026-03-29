<div align="center">

<img src="client/public/vite.svg" width="64" height="64" alt="PipelineXR Logo" />

# PipelineXR

**Real-time CI/CD observability for engineering teams**

[![License](https://img.shields.io/badge/license-Proprietary-red.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org)
[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)]()

[Overview](#overview) · [Features](#features) · [Getting Started](#getting-started) · [Configuration](#configuration) · [Architecture](#architecture) · [Contributing](#contributing)

</div>

---

## Overview

PipelineXR is a DevOps analytics service that gives engineering teams a single pane of glass over their GitHub Actions pipelines. It combines real-time pipeline monitoring, DORA metrics, multi-layer security scanning, uptime monitoring, and AI-assisted remediation into one cohesive dashboard — purpose-built for teams that need visibility without the noise.

> Built for teams that care about pipeline health, security posture, and deployment confidence.

---

## Features

### Pipeline Observability
- Real-time pipeline feed powered by GitHub webhooks — no polling
- Per-run stage visualization in enforced order: **Build → Security → Test → Deploy**
- Run history with duration, branch, trigger, actor, and conclusion tracking
- Socket.io live updates pushed to all connected clients instantly
- Blended risk score per run — deployment risk + security vulnerability index combined

### DORA Metrics
- Deployment frequency, change failure rate, success rate, and average build duration
- Lead time for changes and average queue wait time
- 7 / 30 / 90-day trend charts with daily granularity
- Automatic sync from GitHub Actions API on page load

### Security Scanning
- **Trivy** — full vulnerability, secret, and misconfiguration scanning via Docker; automatically falls back to the built-in TrivyLite engine when Docker is unavailable
- **Dependency audit** — npm audit with high/critical severity gating
- **Secret detection** — regex-based scan across the entire codebase
- **SAST** — static analysis for dangerous patterns (eval, hardcoded credentials)
- **Container scan** — Dockerfile best-practice validation
- **License scan** — open source license compliance checking
- **IaC scan** — Terraform / CloudFormation misconfiguration detection
- **SBOM generation** — CycloneDX 1.6 format, full transitive dependency tree from package-lock.json
- **Dependabot integration** — syncs open Dependabot alerts directly from GitHub and persists them
- **Snyk integration** — additional vulnerability intelligence via Snyk API
- Per-run blended risk score (60% deployment + 40% security) with Healthy / Suspect / Risky levels

### AI-Assisted Remediation
- Google Gemini-powered fix suggestions for detected vulnerabilities
- Contextual remediation steps surfaced directly in the Security page
- Sanitized, minimal data sent to the AI — never raw user-controlled strings

### Uptime Monitoring
- Add any public URL and get 60-second interval health checks via background cron
- Live reachability probe on add — rejects non-existent or unreachable domains immediately with a clear error
- Uptime percentage, avg / min / max response time, and total check count per time range
- Visual 90-slot uptime bar and response time line chart
- Incident log with start time, resolve time, and duration
- Email alerts on site down and recovery via Gmail SMTP (App Password)
- Admin mode — unlimited monitored sites; free users get one

### Audit Reports
- Workflow job archives with step-level pass/fail scoring
- Quality index per suite with pass rate calculation
- One-click PDF export powered by pdfkit — no headless browser required, works on any host
- Sync jobs and steps directly from the GitHub Actions API

### Intrusion Detection (IDS)
- In-memory sliding window rate tracking per IP (1-minute window)
- Automatic IP blocking at 300 req/min with a 10-minute cooldown
- Path traversal detection, scanner probe blocking, missing User-Agent flagging
- Admin dashboard showing blocked IPs, top traffic by request count, and full anomaly log
- All events persisted to the database for audit trail

### Visitor Analytics
- Embeddable JavaScript beacon for tracking visitors on any external site
- Page views, unique sessions, unique IPs, top pages, top referrers
- Hourly view chart per monitored site
- Admin-only — script generation and stats locked behind admin access

### Multi-Repo Support
- Switch between repositories instantly from the global selector
- All views — pipelines, metrics, security, reports — scope to the selected repo automatically

---

## Getting Started

### Prerequisites

| Requirement | Version |
|---|---|
| Node.js | ≥ 18.0.0 |
| npm | ≥ 9.0.0 |
| PostgreSQL | Neon (recommended) or any Postgres instance |
| GitHub Account | OAuth App + Personal Access Token |

### 1. Install dependencies

```bash
npm install
cd client && npm install && cd ..
```

### 2. Configure environment

```bash
cp .env.example .env
```

Open `.env` and fill in your values — see [Configuration](#configuration) for details.

### 3. Initialize the database

```bash
node init-database.js
```

This runs the full schema bootstrap against your `DATABASE_URL`. Safe to re-run — all statements use `IF NOT EXISTS`.

### 4. Start the application

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
   - Homepage URL: your frontend URL
   - Authorization callback URL: `<FRONTEND_URL>/auth/github/callback`
3. Copy the **Client ID** and **Client Secret** into your `.env`

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GITHUB_CLIENT_ID` | ✅ | GitHub OAuth App Client ID |
| `GITHUB_CLIENT_SECRET` | ✅ | GitHub OAuth App Client Secret |
| `GITHUB_TOKEN` | ✅ | Personal Access Token (classic) — scopes: `repo`, `workflow`, `read:org` |
| `SESSION_SECRET` | ✅ | Strong random string for session signing — app refuses to start without it |
| `PORT` | ✅ | Backend port (default: `3001`) |
| `FRONTEND_URL` | ✅ | Frontend origin (e.g. `http://localhost:5174`) |
| `DATABASE_URL` | ✅ | PostgreSQL connection string (e.g. Neon `postgresql://user:pass@host/db?sslmode=require`) |
| `GEMINI_API_KEY` | ⚡ | Google Gemini API key for AI-assisted remediation |
| `SNYK_TOKEN` | ⚡ | Snyk Personal API Token |
| `SNYK_ORG_ID` | ⚡ | Snyk Organization ID |
| `GITHUB_WEBHOOK_SECRET` | ⚡ | HMAC secret for webhook signature validation |
| `DATADOG_API_KEY` | ⚡ | Datadog API key for metric forwarding |
| `DATADOG_APP_KEY` | ⚡ | Datadog Application key |
| `DATADOG_SITE` | ⚡ | Datadog site region (e.g. `ap1.datadoghq.com`) |
| `SMTP_USER` | ⚡ | Gmail address for uptime alert emails |
| `SMTP_PASS` | ⚡ | Gmail App Password (not your account password) |

> ⚡ Optional but recommended for full feature coverage.

> **Admin access** is resolved automatically from `GITHUB_TOKEN` — whoever owns that token gets elevated access. No separate admin variable needed.

### Webhook Setup (Live Pipeline Events)

Webhooks enable real-time pipeline updates without polling.

In your GitHub repository → **Settings → Webhooks → Add webhook**:

| Field | Value |
|---|---|
| Payload URL | `https://<your-domain>/api/github/webhook` |
| Content type | `application/json` |
| Secret | Value of `GITHUB_WEBHOOK_SECRET` |
| Events | `workflow_run`, `workflow_job` |

For local development, use [ngrok](https://ngrok.com) to expose your local server:

```bash
ngrok http 3001
```

Then set the Payload URL to `https://<your-ngrok-url>/api/github/webhook`.

### Trivy (Optional)

PipelineXR uses its built-in TrivyLite engine by default. To use the full Trivy binary via Docker for more comprehensive scanning, ensure Docker Desktop is running — the scanner will detect it automatically and use `aquasec/trivy` via `docker run`. No binary installation needed.

To install the Trivy binary locally instead:

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
│   └── index.js                  # Express 5, REST API, Socket.io, GitHub OAuth, all routes
├── services/
│   ├── github.js                 # GitHub API client (Octokit) — repos, commits, workflows, Dependabot
│   ├── github-webhook.js         # Webhook event processor + DB persistence + risk scoring
│   ├── analytics.js              # Job/step sync from GitHub API, test reports, user upsert
│   ├── metricsService.js         # DORA metrics calculation + GitHub sync + trend queries
│   ├── realtime-stream.js        # Socket.io broadcaster + 30s polling fallback
│   ├── database.js               # PostgreSQL pool with sqlite3-compatible shim (run/all/get/exec)
│   ├── db-init.js                # Full schema bootstrap — idempotent, safe to re-run
│   ├── monitor.js                # Uptime monitor — cron checks, ping, incident tracking, email alerts
│   ├── ids.js                    # Intrusion detection middleware — rate tracking, blocking, anomaly log
│   ├── securityService.js        # Security API layer — vuln CRUD, summary, scan history
│   ├── datadog.js                # Datadog metric forwarding + local metric query
│   ├── pipeline-logger.js        # Structured pipeline event logging
│   └── security/
│       ├── securityScanner.js    # Full scan pipeline: clone → Docker/TrivyLite → parse → score → cleanup
│       ├── scanners.js           # All scan modules (SCA, SAST, secret, container, license, IaC) + SBOM
│       ├── scanner-processor.js  # Result normalizer + DB persistence + Snyk integration
│       └── trivyLite.js          # Built-in fallback scanner engine (pure JS, no binary needed)
├── client/
│   └── src/
│       ├── pages/                # Dashboard, Pipelines, Metrics, Security, Reports, Monitoring
│       ├── components/           # Layout, StatCard, ChartCard, PipelineStageBar, DataTable, SettingsPanel
│       ├── contexts/             # AppContext — global repo selection, auth state, scan state
│       └── services/             # api.js (Axios client), cache.js (sessionStorage TTL cache)
├── schema.sql                    # Legacy SQLite schema reference
├── init-database.js              # Database initializer — runs db-init.js against DATABASE_URL
├── start-both.js                 # Concurrent server + Vite dev launcher
├── docker-compose.yml
└── .env.example
```

### Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS, Chart.js, Socket.io client |
| Backend | Node.js 18+, Express 5 |
| Realtime | Socket.io |
| Database | PostgreSQL via Neon (connect-pg-simple for sessions) |
| Auth | GitHub OAuth 2.0, express-session |
| Security | Trivy (Docker), TrivyLite (built-in), npm audit, Snyk, Dependabot |
| AI | Google Gemini (`@google/generative-ai`) |
| PDF | pdfkit |
| Observability | Datadog (optional) |
| Rate Limiting | express-rate-limit, express-slow-down |
| Email Alerts | Nodemailer (Gmail SMTP) |
| DDoS / IDS | Custom in-memory IDS + Helmet + tiered rate limiting |

---

## Scripts

```bash
node start-both.js        # Start server + Vite client concurrently (recommended for dev)
node server/index.js      # Start server only
node init-database.js     # Initialize or re-run database schema
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
