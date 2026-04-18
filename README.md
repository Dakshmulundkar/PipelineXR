<div align="center">

<img src="client/public/vite.svg" width="64" height="64" alt="PipelineXR Logo" />

# PipelineXR

**DevSecOps observability for engineering teams**

[![License](https://img.shields.io/badge/license-Proprietary-red.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org)
[![Version](https://img.shields.io/badge/version-0.6.4-blue.svg)]()

[Overview](#overview) · [Features](#features) · [Getting Started](#getting-started) · [Configuration](#configuration) · [Architecture](#architecture) · [Changelog](#changelog)

</div>

---

## Overview

PipelineXR is a DevSecOps observability platform that gives engineering teams a single pane of glass over their GitHub Actions pipelines. It combines real-time pipeline monitoring, DORA metrics with period-over-period comparison, multi-layer security scanning, uptime monitoring, AI-assisted remediation, and professional PDF reporting — all in one cohesive dashboard.

> Built for teams that care about pipeline health, security posture, and deployment confidence.

---

## Features

### Pipeline Observability
- Real-time pipeline feed powered by GitHub webhooks — no polling
- Per-run stage visualization: **Build → Security → Test → Deploy**
- Run history with duration, branch, trigger, actor, and conclusion tracking
- Socket.io live updates pushed to all connected clients instantly
- Blended risk score per run — deployment risk + security vulnerability index

### DORA Metrics
- Deployment frequency, change failure rate, success rate, and average build duration
- Lead time for changes and average queue wait time
- 24h / 7d / 30d / 90d trend charts with hourly and daily granularity
- **Period-over-period comparison** — current 30 days vs previous 30 days with ↑/↓ change indicators
- Real trend indicators comparing current vs previous period for all KPIs
- Server-side in-memory cache (2 min TTL) — range switches return instantly without DB round-trips
- Background sync — GitHub sync is fire-and-forget, never blocks the UI

### Security Scanning
- **Trivy** — full vulnerability, secret, and misconfiguration scanning via Docker; falls back to built-in TrivyLite when Docker is unavailable
- **Dependency audit** — npm audit with high/critical severity gating
- **Secret detection** — regex-based scan across the entire codebase
- **SAST** — static analysis for dangerous patterns (eval, hardcoded credentials)
- **Container scan** — Dockerfile best-practice validation
- **License scan** — open source license compliance checking
- **IaC scan** — Terraform / CloudFormation misconfiguration detection
- **SBOM generation** — CycloneDX 1.6 format, full transitive dependency tree
- **Dependabot integration** — syncs open alerts directly from GitHub
- **Snyk integration** — additional vulnerability intelligence via Snyk API
- **Scan deduplication** — each scan replaces previous results; counts never accumulate across scans

### AI-Assisted Remediation
- Hugging Face Space (Qwen2.5-Coder-7B) as primary LLM with Google Gemini 2.0 Flash Lite fallback and static templates as last resort
- DORA insights — AI-generated analysis of deployment performance with recommendations
- Security review — vulnerability analysis with risk summary, critical actions, and per-CVE fix guidance
- Pipeline failure emails — auto-generated incident notifications with urgency scoring
- Uptime alert emails — contextual outage notifications with escalation guidance
- Incident response — structured runbooks generated on demand
- All AI results cached 30 minutes to avoid redundant inference
- HF Space timeout set to 10 minutes (600s) — appropriate for CPU inference

### PDF Reports
- Professional multi-page engineering health report via pdfkit — no headless browser required
- **Cover page** with repository, generation date, and both period ranges
- **Executive summary** — 5 KPI cards + overall health score with visual progress bar
- **Period-over-period comparison table** — current vs previous 30 days with change arrows
- **DORA metrics** — detailed table with benchmark context (Elite/High/Medium/Low)
- **Security posture** — severity breakdown with horizontal bar charts
- **Pipeline reliability** — per-workflow pass rate and avg build time
- **Test results** — KPI cards + contextual health note
- **Recent builds log** — last 20 runs with status badges
- Consistent header band on continuation pages + footer with page numbers
- All colors use proper light-background / dark-text pairs — fully readable in print

### Uptime Monitoring
- 60-second interval health checks via background cron
- Live reachability probe on add — rejects unreachable domains immediately
- Uptime percentage, avg / min / max response time per time range
- Visual 90-slot uptime bar and response time chart
- Incident log with start time, resolve time, and duration
- **MTTR** — Mean Time To Recovery calculated from resolved incident history
- Email alerts on site down and recovery via Gmail SMTP

### Audit Reports
- Workflow job archives with step-level pass/fail scoring
- One-click PDF export
- Test Results section — total tests, pass/fail counts, pass rate, per-workflow breakdown
- AI Health Insights — DORA analysis and security posture summary
- Build stability timeline with consecutive failure streak detection

### Intrusion Detection (IDS)
- In-memory sliding window rate tracking per IP (1-minute window)
- Automatic IP blocking at 300 req/min with 10-minute cooldown
- Path traversal detection, scanner probe blocking, missing User-Agent flagging
- Admin dashboard with blocked IPs, top traffic, and full anomaly log

### Visitor Analytics
- Embeddable JavaScript beacon for tracking visitors on any external site
- Page views, unique sessions, unique IPs, top pages, top referrers
- Admin-only — script generation and stats locked behind admin access

### Multi-Repo Support
- Switch between repositories instantly from the global selector
- All views scope to the selected repo automatically

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

Fill in your values — see [Configuration](#configuration) for details.

### 3. Initialize the database

```bash
node init-database.js
```

Runs the full schema bootstrap against your `DATABASE_URL`. Safe to re-run — all statements use `IF NOT EXISTS`.

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

All configuration is via environment variables. Copy `.env.example` to `.env` to get started.

### GitHub OAuth App

1. Go to **GitHub → Settings → Developer Settings → OAuth Apps → New OAuth App**
2. Set Authorization callback URL to `<FRONTEND_URL>/auth/github/callback`
3. Copy the **Client ID** and **Client Secret** into your `.env`

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GITHUB_CLIENT_ID` | ✅ | GitHub OAuth App Client ID |
| `GITHUB_CLIENT_SECRET` | ✅ | GitHub OAuth App Client Secret |
| `GITHUB_TOKEN` | ✅ | Personal Access Token — scopes: `repo`, `workflow`, `read:org` |
| `SESSION_SECRET` | ✅ | Strong random string for session signing |
| `PORT` | ✅ | Backend port (default: `3001`) |
| `FRONTEND_URL` | ✅ | Frontend origin (e.g. `https://pipelinexr.netlify.app`) |
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `HUGGINGFACE_LLM_URL` | ⚡ | HF Space URL for Qwen2.5-Coder-7B (primary AI) |
| `HUGGINGFACE_API_SECRET` | ⚡ | Optional bearer token for HF Space |
| `HF_TIMEOUT_MS` | ⚡ | HF request timeout in ms — must be ≥ 600000 for CPU inference |
| `XAI_API_KEY` | ⚡ | xAI Grok API key (secondary AI fallback) |
| `XAI_MODEL` | ⚡ | xAI model name (default: `grok-3-mini`) |
| `GEMINI_API_KEY` | ⚡ | Google Gemini API key — uses `gemini-2.0-flash-lite` (1500 req/day free) |
| `SNYK_TOKEN` | ⚡ | Snyk Personal API Token |
| `SNYK_ORG_ID` | ⚡ | Snyk Organization ID |
| `GITHUB_WEBHOOK_SECRET` | ⚡ | HMAC secret for webhook signature validation |
| `DATADOG_API_KEY` | ⚡ | Datadog API key |
| `DATADOG_APP_KEY` | ⚡ | Datadog Application key |
| `DATADOG_SITE` | ⚡ | Datadog site region (e.g. `ap1.datadoghq.com`) |
| `SMTP_USER` | ⚡ | Gmail address for alert emails |
| `SMTP_PASS` | ⚡ | Gmail App Password (not your account password) |

> ⚡ Optional but recommended for full feature coverage.

> **Admin access** is resolved automatically from `GITHUB_TOKEN` — whoever owns that token gets elevated access.

> **AI model note** — use `gemini-2.0-flash-lite`, not `gemini-2.5-flash-lite`. The 2.5 variant has a 20 req/day free tier limit vs 1500/day for 2.0.

### Webhook Setup

In your GitHub repository → **Settings → Webhooks → Add webhook**:

| Field | Value |
|---|---|
| Payload URL | `https://<your-domain>/api/github/webhook` |
| Content type | `application/json` |
| Secret | Value of `GITHUB_WEBHOOK_SECRET` |
| Events | `workflow_run`, `workflow_job`, `push` |

For local development, use [ngrok](https://ngrok.com):

```bash
ngrok http 3001
```

### Trivy (Optional)

PipelineXR uses its built-in TrivyLite engine by default. For full Trivy scanning, ensure Docker Desktop is running — the scanner detects it automatically and uses `aquasec/trivy` via `docker run`.

To install the Trivy binary locally:

```bash
npm run install:trivy
```

---

## Docker

```bash
docker-compose up
```

Ensure your `.env` is configured before running.

---

## Architecture

```
PipelineXR/
├── server/
│   └── index.js                  # Express 5, REST API, Socket.io, GitHub OAuth, all routes
│                                 # Includes in-memory DORA cache (2 min TTL, 200 entry cap)
├── services/
│   ├── github.js                 # GitHub API client (Octokit)
│   ├── github-webhook.js         # Webhook event processor + DB persistence + risk scoring
│   ├── analytics.js              # Job/step sync, test reports, user upsert
│   ├── metricsService.js         # DORA metrics — parallel queries, no sequential DB chains
│   ├── securityService.js        # Security API layer — vuln CRUD, summary, scan deduplication
│   ├── realtime-stream.js        # Socket.io broadcaster + 30s polling fallback
│   ├── database.js               # PostgreSQL pool with sqlite3-compatible shim
│   ├── db-init.js                # Full schema bootstrap — idempotent
│   ├── monitor.js                # Uptime monitor — cron checks, incident tracking, MTTR, email
│   ├── ids.js                    # Intrusion detection — rate tracking, blocking, anomaly log
│   ├── datadog.js                # Datadog metric forwarding
│   ├── pdfReport.js              # PDF generation — professional multi-section report
│   └── ai/
│       └── llm.js                # LLM pipeline: HF Space → Gemini 2.0 Flash Lite → static
│   └── security/
│       ├── securityScanner.js    # Full scan: clone → Docker/TrivyLite → parse → score
│       ├── scanners.js           # All scan modules (SCA, SAST, secret, container, license, IaC)
│       ├── scanner-processor.js  # Result normalizer + DB persistence + Snyk integration
│       └── trivyLite.js          # Built-in fallback scanner (pure JS, no binary needed)
├── client/
│   └── src/
│       ├── pages/                # Dashboard, Pipelines, Metrics, Security, Reports, Monitoring
│       ├── components/           # Layout, StatCard, ChartCard, PipelineStageBar, AiInsightPanel
│       ├── contexts/             # AppContext — repo selection, auth, scan state, socket
│       └── services/
│           ├── api.js            # Axios client — all API calls
│           └── cache.js          # sessionStorage TTL cache (5 min, stale-while-revalidate)
├── init-database.js              # Database initializer
├── start-both.js                 # Concurrent server + Vite dev launcher
├── docker-compose.yml
└── .env.example
```

### Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 7, Tailwind CSS 4, Chart.js, Framer Motion, Socket.io client |
| Backend | Node.js 18+, Express 5 |
| Realtime | Socket.io 4 |
| Database | PostgreSQL via Neon (connect-pg-simple for sessions) |
| Auth | GitHub OAuth 2.0, express-session |
| Security | Trivy (Docker), TrivyLite (built-in), npm audit, Snyk, Dependabot |
| AI | HF Space (Qwen2.5-Coder-7B) → Gemini 2.0 Flash Lite → static templates |
| PDF | pdfkit |
| Observability | Datadog (optional) |
| Rate Limiting | express-rate-limit, express-slow-down |
| Email | Nodemailer (Gmail SMTP) |
| DDoS / IDS | Custom in-memory IDS + Helmet + tiered rate limiting |

---

## Scripts

```bash
node start-both.js        # Start server + Vite client concurrently (dev)
node server/index.js      # Start server only
node init-database.js     # Initialize or re-run database schema
npm run install:trivy     # Install Trivy binary locally
docker-compose up         # Run full stack in Docker
node scripts/scan-repos.js  # Batch scan all connected repositories
```

---

## Changelog

### v0.6.4
- **PDF report** — complete rewrite with professional multi-page layout: cover page, executive summary with health score bar, period-over-period comparison table, DORA benchmarks with context notes, security posture banner, pipeline reliability with avg build time per workflow, test results with contextual insight, recent builds with status badges
- **PDF colors** — all badge backgrounds use proper light/dark color pairs; no more invalid hex opacity suffixes (`color + '22'`); table headers use neutral `#F1F5F9` instead of tinted blue-on-blue
- **PDF performance** — removed redundant `runs` DB query; `rawRuns` from `getDoraMetrics` reused directly; removed `expensiveLimiter` from download route
- **DORA query performance** — `getDoraMetrics` now runs 2 parallel queries instead of 3 sequential ones; wait time merged into KPI query
- **Server-side DORA cache** — in-memory cache with 2 min TTL and 200 entry cap; range switches return instantly; invalidated on sync completion
- **Background sync** — `syncDoraMetrics` is now fire-and-forget in Dashboard and Metrics; never blocks the fetch path
- **Scan deduplication** — `clearScanResults` deletes previous scan rows before inserting new ones; vulnerability counts no longer accumulate across scans
- **Gemini model** — switched from `gemini-2.5-flash-lite` (20 req/day free) to `gemini-2.0-flash-lite` (1500 req/day free)
- **HF timeouts** — all four HF endpoints (`dora-insights`, `pipeline-email`, `monitor-email`, `incident-response`) updated from 4s/0 retries to `HF_TIMEOUT`/1 retry; scanner prefix derived dynamically from results

### v0.6.1
- **Email notifications** — pipeline failures and security scan results auto-email the repo owner
- **Auto-scan on push** — GitHub `push` webhook triggers background TrivyLite scan
- **Per-commit dedup** — emails sent once per run ID and once per commit SHA
- **AI-written emails** — Gemini writes a 2-sentence summary for each alert email
- **Landing page** — contact form, footer links, How It Works layout improvements

### v0.5.9
- **Notifications** — bell icon with real-time dropdown for pipeline and security events
- **Pipelines page** — Load more no longer resets on polling interval
- **AI DORA Insights** — markdown renders properly instead of raw symbols
- **Email** — switched to Gmail SMTP via Nodemailer
- **DB connection** — increased Neon timeout to 15s; DORA sync timeout returns 200

### v0.5.8
- **PDF report** — clean white-theme rewrite with executive summary, DORA benchmarks, test results
- **Security numbers** — fixed `COUNT(*)` string concatenation bug
- **Dashboard activity feed** — commit messages now shown correctly
- **LLM** — switched to `gemini-2.5-flash-lite`

### v0.5.6
- **Reports page** — Test Results section and AI Health Insights card
- **Metrics page** — Change Failure Rate chart, period-over-period trends, Datadog connection state
- **Dashboard** — NeedsAttention navigation, ActivityFeed socket state, SitesCard live timer
- **Monitoring** — MTTR stat from resolved incidents
- **AppContext** — socket listener auto-refreshes security summary on scan completion

### v0.5.0
- Initial public release

---

## Contributing

This is a proprietary product. External contributions are not accepted at this time.

---

## License

Copyright © 2026 Daksh Mulundkar. All rights reserved.  
See [LICENSE](LICENSE) for full terms.
