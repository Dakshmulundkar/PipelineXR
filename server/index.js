require('dotenv').config();
console.log('GITHUB_TOKEN present in server?', Boolean(process.env.GITHUB_TOKEN));
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const { Pool } = require('pg');
const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const helmet = require('helmet');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { initializeDatabase } = require('../services/db-init');

// Configuration
const PORT = process.env.PORT || 3001;
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) {
    console.error('FATAL: SESSION_SECRET is not set. Refusing to start with an insecure default.');
    process.exit(1);
}
const FRONTEND_URL = process.env.FRONTEND_URL || `http://localhost:${PORT}`;

// ── Resolve admin login from GITHUB_TOKEN at startup (no hardcoding) ──────────
// The owner of GITHUB_TOKEN in .env is the admin. We fetch their login once.
let resolvedAdminLogin = null;
async function resolveAdminLogin() {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
        console.warn('[ADMIN] GITHUB_TOKEN not set — no admin user will be granted elevated access');
        return;
    }
    try {
        const res = await fetch('https://api.github.com/user', {
            headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'PipelineXR' }
        });
        const data = await res.json();
        if (data.login) {
            resolvedAdminLogin = data.login;
            console.log(`[ADMIN] Admin login resolved from GITHUB_TOKEN: ${resolvedAdminLogin}`);
        } else {
            console.warn('[ADMIN] Could not resolve login from GITHUB_TOKEN:', data.message);
        }
    } catch (e) {
        console.warn('[ADMIN] Failed to resolve admin login:', e.message);
    }
}

// Supabase logic removed - using local SQLite instead

// Initialize Apps
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// ── DDoS / Security Middleware ────────────────────────────────────────────────

// 1. Security headers (XSS, clickjacking, MIME sniffing, etc.)
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
}));

// 2. Trust proxy — required so rate limiter sees real IP behind Nginx/Cloudflare
app.set('trust proxy', 1);

// 3. IDS — intrusion detection, anomaly detection, scanner blocking
const ids = require('../services/ids');
app.use(ids.idsMiddleware);

// 3. Block oversized request bodies early (before JSON parse)
app.use((req, res, next) => {
    const contentLength = parseInt(req.headers['content-length'] || '0', 10);
    if (contentLength > 1 * 1024 * 1024) { // 1 MB hard cap
        return res.status(413).json({ error: 'Payload too large' });
    }
    next();
});

// 4. CORS — only allow your frontend origin
app.use(cors({
    origin: FRONTEND_URL,
    credentials: true
}));

// Raw body parser for webhook signature verification (must come before json parser)
app.use('/api/github/webhook', express.raw({ type: 'application/json' }));

app.use(express.json());
app.use(express.text()); // For raw log ingestion

app.use(session({
    store: new pgSession({
        pool: new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost')
                ? false : { rejectUnauthorized: false },
            max: 3, // dedicated pool for sessions — keep separate from main pool
        }),
        tableName: 'session',
        createTableIfMissing: true,
        pruneSessionInterval: 60 * 60, // prune expired sessions every hour
    }),
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true, // reset maxAge on every request — keeps active users logged in
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000,
        httpOnly: true,
        sameSite: 'lax'
    }
}));

// ── Rate Limiting (tiered) ────────────────────────────────────────────────────

// Slow down before hard-blocking — adds 500ms delay per request after 50 req/15min
const speedLimiter = slowDown({
    windowMs: 15 * 60 * 1000,
    delayAfter: 50,
    delayMs: (used) => (used - 50) * 500, // 500ms, 1000ms, 1500ms...
    maxDelayMs: 10000, // cap at 10s delay
});
app.use('/api/', speedLimiter);

// General API: 200 req/15min per IP
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, slow down.' },
    skip: (req) => req.path === '/api/github/webhook',
});
app.use('/api/', apiLimiter);

// Auth endpoints: 10 attempts/15min — brute force protection
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Too many auth attempts, try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/auth/', authLimiter);

// Expensive endpoints: scans, PDF, sync — 30/hour
const expensiveLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 30,
    message: { error: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Load Services
const githubService = require('../services/github');
const runnerService = require('../services/runner');
const AnalyticsService = require('../services/analytics');
const PipelineService = require('../services/pipeline');
const GitHubWebhookService = require('../services/github-webhook');
const RealtimeStreamService = require('../services/realtime-stream');
const metricsService = require('../services/metricsService');
const securityService = require('../services/securityService');
const securityScanner = require('../services/security/scanner-processor');
const securityScannerFull = require('../services/security/securityScanner');
const monitor = require('../services/monitor');


// Services are initialized inside startServer() after DB is ready
let analytics, webhookService, realtimeService;

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-lite' });


// --------------------------------------------------------------------------
// Authentication Middleware & Routes
// --------------------------------------------------------------------------

// Health check — required by Render to confirm server is alive
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), uptime: process.uptime() });
});

// Repository param sanitizer — rejects anything that doesn't look like owner/repo
const REPO_RE = /^[a-zA-Z0-9_.\-]+\/[a-zA-Z0-9_.\-]+$/;
function sanitizeRepo(repo) {
    if (!repo) return null;
    const clean = repo.toString().trim().slice(0, 200);
    return REPO_RE.test(clean) ? clean : null;
}

// Configuration check endpoint
app.get('/api/config/check', (req, res) => {
    const config = {
        githubClientId: GITHUB_CLIENT_ID ? 'configured' : 'missing',
        githubClientSecret: GITHUB_CLIENT_SECRET ? 'configured' : 'missing',
        sessionSecret: SESSION_SECRET ? 'configured' : 'missing',
        frontendUrl: FRONTEND_URL,
        redirectUri: `${FRONTEND_URL}/auth/github/callback`,
        geminiApiKey: process.env.GEMINI_API_KEY ? 'configured' : 'missing'
    };

    res.json({
        status: 'ok',
        config,
        timestamp: new Date().toISOString()
    });
});

const requireAuth = (req, res, next) => {
    if (req.session.authenticated) {
        next();
    } else {
        res.redirect('/login.html');
    }
};

// API-specific auth middleware — accepts session (local dev) OR x-github-token header (Netlify production)
const requireApiAuth = async (req, res, next) => {
    // 1. Session-based auth (local dev / Railway direct)
    if (req.session.authenticated) return next();

    // 2. Token-based auth from Netlify (x-github-token header)
    const ghToken = req.headers['x-github-token'];
    if (ghToken) {
        try {
            // Verify token is valid by fetching GitHub user
            const cached = _tokenUserCache.get(ghToken);
            if (cached && Date.now() - cached.ts < 10 * 60 * 1000) {
                req.session.user = cached.user;
                req.session.authenticated = true;
                return next();
            }
            const r = await fetch('https://api.github.com/user', {
                headers: { Authorization: `Bearer ${ghToken}`, 'User-Agent': 'PipelineXR' }
            });
            if (!r.ok) throw new Error('Invalid token');
            const ghUser = await r.json();
            // Find or create user in DB
            const dbUser = await analytics.upsertUser({
                email:      ghUser.email || null,
                github_id:  ghUser.id?.toString(),
                avatar_url: ghUser.avatar_url,
                name:       ghUser.name || ghUser.login,
                last_login: new Date().toISOString(),
            });
            const user = { ...ghUser, dbId: dbUser?.id, isAdmin: resolvedAdminLogin === ghUser.login };
            _tokenUserCache.set(ghToken, { user, ts: Date.now() });
            req.session.user = user;
            req.session.authenticated = true;
            return next();
        } catch (e) {
            console.warn('[AUTH] Token validation failed:', e.message);
        }
    }

    res.status(401).json({ error: 'Authentication required' });
};
// Cache token→user lookups for 10 min to avoid hammering GitHub API
const _tokenUserCache = new Map();

// Initiate GitHub Login
app.get('/auth/github', (req, res) => {
    // Callback goes to Railway to exchange the code, then Railway redirects to Netlify
    const callbackUri = `https://${req.headers.host}/auth/github/callback`;
    const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&scope=repo,user:email&redirect_uri=${encodeURIComponent(callbackUri)}`;
    res.redirect(githubAuthUrl);
});

// GitHub Callback
app.get('/auth/github/callback', async (req, res) => {
    const { code, error, error_description } = req.query;

    console.log('GitHub callback received:', { code: code ? 'present' : 'missing', error });

    if (error) {
        console.error('GitHub OAuth error:', error);
        return res.redirect(`${FRONTEND_URL}/login?error=oauth_error`);
    }

    if (!code) {
        console.error('No authorization code received');
        return res.redirect(`${FRONTEND_URL}/login?error=no_code`);
    }

    try {
        console.log('Exchanging code for token...');

        // 1. Exchange code for access token
        const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                client_id: GITHUB_CLIENT_ID,
                client_secret: GITHUB_CLIENT_SECRET,
                code: code,
            }),
        });

        const tokenData = await tokenResponse.json();
        console.log('Token response status:', tokenResponse.status);

        if (tokenData.error) {
            console.error('GitHub Token Error:', tokenData.error);
            return res.redirect(`${FRONTEND_URL}/login?error=token_error`);
        }

        if (!tokenData.access_token) {
            console.error('No access token received:', tokenData);
            return res.redirect(`${FRONTEND_URL}/login?error=no_token`);
        }

        const accessToken = tokenData.access_token;
        req.session.githubToken = accessToken;
        console.log('Access token received and stored in session');

        // 2. Initialize Service & Fetch User Info
        await githubService.init(accessToken);
        const userInfo = await githubService.getUserInfo();


        if (!userInfo || userInfo.error) {
            console.error('Failed to fetch GitHub user info:', userInfo?.error);
            return res.redirect(`/login.html?error=user_info_error&description=${encodeURIComponent(userInfo?.error || 'Unknown error')}`);
        }

        console.log('User info fetched:', userInfo.login);

        // 3. Upsert User into local DB
        try {
            const dbUser = await analytics.upsertUser({
                email: userInfo.email,
                github_id: userInfo.id ? userInfo.id.toString() : null,
                avatar_url: userInfo.avatar_url,
                name: userInfo.name || userInfo.login,
                last_login: new Date().toISOString()
            });
            userInfo.dbId = dbUser?.id;
            console.log('User synced to local database with ID:', dbUser?.id);
        } catch (upsertError) {
            console.error('Local User Upsert Error:', upsertError);
            // If we can't create/find the user record, the session will have no dbId
            // and every authenticated API call will return 401. Fail the login cleanly.
            return res.redirect(`${FRONTEND_URL}/auth/callback?error=db_error`);
        }

        // 4. Set Session
        req.session.user = userInfo;
        req.session.user.isAdmin = (resolvedAdminLogin && userInfo.login === resolvedAdminLogin);
        req.session.authenticated = true;
        console.log(`Session established for user: ${userInfo.login} (admin: ${req.session.user.isAdmin})`);


        // 5. Auto-fetch Repos (Cache them or just log for now)
        try {
            const repos = await githubService.getUserRepositories();
            console.log(`Fetched ${repos.length} repositories for ${userInfo.login}`);
            // Can store in session if needed: req.session.repos = repos;
        } catch (repoError) {
            console.error('Failed to auto-fetch repos:', repoError);
        }

        // 6. Redirect to Dashboard — token stays in session, NOT in URL
        console.log('Redirecting to dashboard...');
        res.redirect(`${FRONTEND_URL}/auth/callback?status=success`);
    } catch (error) {
        console.error('GitHub OAuth error:', error.message);
        res.redirect(`${FRONTEND_URL}/auth/callback?error=oauth_failed`);
    }
});

app.get('/auth/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) console.error('[LOGOUT] Session destroy error:', err.message);
    });
    res.redirect(`${FRONTEND_URL}/login`);
});

app.get('/auth/user', (req, res) => {
    if (req.session.user) {
        res.json({
            user: req.session.user,
            authenticated: true,
            isAdmin: req.session.user.isAdmin === true,
        });
    } else {
        res.json({ authenticated: false, isAdmin: false });
    }
});

// --------------------------------------------------------------------------
// Data Routes
// --------------------------------------------------------------------------

// Apply API auth to all /api/ routes EXCEPT webhooks, health checks, config, and visitor beacons
app.use('/api', (req, res, next) => {
    const publicPaths = ['/github/webhook', '/webhook', '/config/check', '/visitor/beacon'];
    if (publicPaths.some(p => req.path === p || req.path.startsWith(p))) {
        return next();
    }
    requireApiAuth(req, res, next);
});

// GitHub Webhooks
app.post('/api/github/webhook', async (req, res) => {
    try {
        const eventType = req.headers['x-github-event'];
        const deliveryId = req.headers['x-github-delivery'];
        const signature = req.headers['x-hub-signature-256'];

        // Parse raw body for signature validation
        let payload;
        try {
            payload = JSON.parse(req.body.toString());
        } catch (e) {
            console.error('[WEBHOOK] Invalid JSON payload');
            return res.status(400).send('Invalid JSON');
        }

        // Validate signature
        const crypto = require('crypto');
        const hmac = crypto.createHmac('sha256', process.env.GITHUB_WEBHOOK_SECRET);
        const digest = 'sha256=' + hmac.update(req.body).digest('hex');

        if (signature !== digest) {
            console.error('[WEBHOOK] Invalid signature');
            return res.status(401).send('Invalid signature');
        }

        console.log('[WEBHOOK] Signature verified');
        console.log('[WEBHOOK] Event:', eventType);
        console.log('[WEBHOOK] Repository:', payload.repository?.full_name);
        console.log('[WEBHOOK] Delivery ID:', deliveryId);

        // Process webhook
        const result = await webhookService.handleWebhook(
            eventType,
            deliveryId,
            payload,
            signature,
            req.body.toString()
        );

        // Broadcast to connected clients
        io.emit('github_webhook', {
            eventType,
            deliveryId,
            payload,
            timestamp: new Date().toISOString()
        });

        console.log('[WEBHOOK] Event processed successfully');
        res.status(200).send('Webhook received');
    } catch (error) {
        console.error('Webhook processing error:', error);
        res.status(500).send('Internal server error');
    }
});

// Legacy webhook endpoint removed (was deprecated Supabase remnant)

// Trigger Pipeline (SCA, Secret, SAST, Container)
app.post('/api/ci/run', async (req, res) => {
    console.log('Manual pipeline trigger received');
    try {
        const { owner, repo, workflow_id, ref } = req.body;
        
        if (!owner || !repo || !workflow_id) {
            return res.status(400).json({ error: 'Missing required parameters: owner, repo, workflow_id' });
        }

        // Validate owner/repo format to prevent injection
        const safeRepo = sanitizeRepo(`${owner}/${repo}`);
        if (!safeRepo) return res.status(400).json({ error: 'Invalid owner or repo format' });

        await ensureGithub(req);
        const [safeOwner, safeRepoName] = safeRepo.split('/');
        await githubService.triggerWorkflow(safeOwner, safeRepoName, workflow_id, ref || 'main');

        res.json({ status: 'dispatched' });
    } catch (error) {
        console.error('Pipeline Trigger Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Pipeline Monitoring APIs
app.get('/api/pipeline/runs', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const repository = req.query.repository || null;
        const runs = await webhookService.getRecentWorkflowRuns(limit, repository);
        res.json(runs);
    } catch (error) {
        console.error('Pipeline runs fetch error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/pipeline/runs/:runId', async (req, res) => {
    try {
        const { runId } = req.params;
        const details = await webhookService.getWorkflowRunDetails(runId);
        if (!details) {
            return res.status(404).json({ error: 'Run not found' });
        }
        res.json(details);
    } catch (error) {
        console.error('Pipeline run details fetch error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/pipeline/analytics', async (req, res) => {
    try {
        const timeRange = req.query.timeRange || '7d';
        const analytics = await webhookService.getPipelineAnalytics(timeRange);
        res.json(analytics);
    } catch (error) {
        console.error('Pipeline analytics fetch error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/pipeline/status', async (req, res) => {
    try {
        const filters = {
            repository: req.query.repository,
            workflow_name: req.query.workflow_name,
            timeRange: req.query.timeRange || '24h'
        };
        const status = await realtimeService.getPipelineStatus(filters);
        res.json(status);
    } catch (error) {
        console.error('Pipeline status fetch error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Real-time streaming endpoints
app.get('/api/realtime/stats', (req, res) => {
    const stats = realtimeService.getStats();
    res.json(stats);
});

// Logs
app.post('/api/logs', (req, res) => {
    const logLine = req.body;
    io.emit('log_stream', logLine);
    res.status(200).send('OK');
});


// --------------------------------------------------------------------------
// API Routes (GitHub & Analytics)
// --------------------------------------------------------------------------

// Helper — extract userId from session (works for both session and token auth)
const getUserId = (req) => req.session.user?.dbId || null;

// POST /api/auth/sync-user — called by Netlify function after OAuth to register user in DB
app.post('/api/auth/sync-user', async (req, res) => {
    try {
        const { github_id, login, name, email, avatar_url, token } = req.body;
        if (!github_id || !token) return res.status(400).json({ error: 'Missing required fields' });
        const dbUser = await analytics.upsertUser({
            email: email || null,
            github_id,
            avatar_url,
            name: name || login,
            last_login: new Date().toISOString(),
        });
        res.json({ ok: true, userId: dbUser?.id });
    } catch (e) {
        console.error('[sync-user]', e.message);
        res.status(500).json({ error: e.message });
    }
});

// ── Sync throttle — skip GitHub API syncs done < 5 min ago per user+repo ──────
const syncCache = new Map();
const SYNC_TTL = 5 * 60 * 1000; // 5 minutes
function shouldSync(userId, repo, type = 'dora') {
    const key = `${type}:${userId}:${repo}`;
    const last = syncCache.get(key);
    if (last && Date.now() - last < SYNC_TTL) return false;
    syncCache.set(key, Date.now());
    return true;
}
// Clean up old entries every 10 min to prevent memory leak
setInterval(() => {
    const now = Date.now();
    for (const [k, v] of syncCache.entries()) {
        if (now - v > SYNC_TTL * 2) syncCache.delete(k);
    }
}, 10 * 60 * 1000);

// Re-initialize GitHub service from session token for every API call if needed
const ensureGithub = async (req) => {
    const token = req.headers['x-github-token'] || req.session.githubToken || process.env.GITHUB_TOKEN;
    if (token) await githubService.init(token);
    return token;
};

app.get('/api/github/user/repos', async (req, res) => {
    if (!(await ensureGithub(req))) return res.status(401).json({ error: 'No GitHub token' });
    try {
        const repos = await githubService.getUserRepositories();
        res.json(repos);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/github/stats', async (req, res) => {
    await ensureGithub(req);
    const { owner, repo } = req.query;
    if (!owner || !repo) return res.status(400).json({ error: 'Missing params' });
    const stats = await githubService.getRepoStats(owner, repo);
    res.json(stats);
});

app.get('/api/github/commits', async (req, res) => {
    await ensureGithub(req);
    const { owner, repo } = req.query;
    if (!owner || !repo) return res.status(400).json({ error: 'Missing params' });
    const commits = await githubService.getRecentCommits(owner, repo);
    res.json(commits);
});

app.get('/api/github/actions', async (req, res) => {
    await ensureGithub(req);
    const { owner, repo } = req.query;
    if (!owner || !repo) return res.status(400).json({ error: 'Missing params' });
    const stats = await githubService.getWorkflowStats(owner, repo);
    res.json(stats);
});

app.get('/api/github/workflows', async (req, res) => {
    await ensureGithub(req);
    const { owner, repo } = req.query;
    if (!owner || !repo) return res.status(400).json({ error: 'Missing params' });
    const workflows = await githubService.getWorkflows(owner, repo);
    res.json(workflows);
});

app.get('/api/reports/tests', async (req, res) => {
    try {
        const userId = getUserId(req); if (!userId) return res.status(401).json({ error: 'Authentication required' });
        const { repository } = req.query;
        const reports = await analytics.getTestReports(userId, repository || null);
        const enriched = reports.map(r => ({
            ...r,
            total_tests: parseInt(r.total_tests) || 0,
            passed: parseInt(r.passed) || 0,
            failed: parseInt(r.failed) || 0,
            pass_rate: parseInt(r.total_tests) > 0 ? Math.round((parseInt(r.passed) / parseInt(r.total_tests)) * 100) : 0
        }));
        res.json(enriched);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch reports' });
    }
});

app.get('/api/reports/summary', async (req, res) => {
    try {
        const userId = getUserId(req); if (!userId) return res.status(401).json({ error: 'Authentication required' });
        const quality = await analytics.getQualityMetrics(userId);
        const reports = await analytics.getTestReports(userId);
        res.json({
            totalTests: quality?.total_tests || 0,
            passed: quality?.passed || 0,
            failed: quality?.failed || 0,
            flaky: quality?.flaky || 0,
            passRate: quality?.pass_rate || 0,
            suites: reports.length
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed' });
    }
});

// Sync jobs+steps from GitHub API into local DB (no webhooks needed)
app.post('/api/reports/sync', expensiveLimiter, async (req, res) => {
    try {
        const userId = getUserId(req); if (!userId) return res.status(401).json({ error: 'Authentication required' });
        const repository = sanitizeRepo(req.body?.repository) || '';
        if (!repository) {
            return res.status(400).json({ error: 'Missing or invalid repository (expected owner/repo)' });
        }
        if (!shouldSync(userId, repository, 'reports')) {
            return res.json({ success: true, skipped: true, reason: 'Recently synced' });
        }
        await ensureGithub(req);
        const result = await analytics.syncJobsFromGitHub(repository, userId);
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('Reports sync error:', error);
        res.status(500).json({ error: error.message });
    }
});

// PDF download using pdfkit (no Chrome/Puppeteer needed — works on Render)
app.get('/api/reports/download', expensiveLimiter, async (req, res) => {
    try {
        const userId = getUserId(req); if (!userId) return res.status(401).json({ error: 'Authentication required' });
        const { repository } = req.query;
        const rawReports = await analytics.getTestReports(userId, repository || null);

        const reports = rawReports.map(r => ({
            ...r,
            total_tests: parseInt(r.total_tests) || 0,
            passed: parseInt(r.passed) || 0,
            failed: parseInt(r.failed) || 0,
            pass_rate: parseInt(r.total_tests) > 0 ? Math.round((parseInt(r.passed) / parseInt(r.total_tests)) * 100) : 0
        }));

        const tot = reports.reduce((a, r) => a + (r.total_tests || 0), 0);
        const pass = reports.reduce((a, r) => a + (r.passed || 0), 0);
        const fail = reports.reduce((a, r) => a + (r.failed || 0), 0);
        const avgRate = reports.length > 0
            ? Math.round(reports.reduce((a, r) => a + (r.pass_rate || 0), 0) / reports.length) : 0;

        const PDFDocument = require('pdfkit');
        const doc = new PDFDocument({ margin: 40, size: 'A4' });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=pipelinexr-report-${Date.now()}.pdf`);
        doc.pipe(res);

        // Header
        doc.fontSize(22).font('Helvetica-Bold').text('PipelineXR Audit Report', { align: 'left' });
        doc.fontSize(10).font('Helvetica').fillColor('#666')
            .text(`Generated ${new Date().toLocaleString()}${repository ? `  ·  ${repository}` : ''}`, { align: 'left' });
        doc.moveDown(1.5);

        // Stats row
        const stats = [
            { label: 'Total Steps', val: tot },
            { label: 'Passed', val: pass },
            { label: 'Failed', val: fail },
            { label: 'Quality Index', val: `${avgRate}%` },
        ];
        const boxW = 115, boxH = 52, startX = 40;
        stats.forEach((s, i) => {
            const x = startX + i * (boxW + 8);
            const y = doc.y;
            doc.rect(x, y, boxW, boxH).fillAndStroke('#f5f5f5', '#e0e0e0');
            doc.fillColor('#111').fontSize(20).font('Helvetica-Bold').text(String(s.val), x + 8, y + 8, { width: boxW - 16 });
            doc.fillColor('#888').fontSize(9).font('Helvetica').text(s.label.toUpperCase(), x + 8, y + 34, { width: boxW - 16 });
        });
        doc.moveDown(4.5);

        if (reports.length === 0) {
            doc.fillColor('#888').fontSize(12).text('No job data available for this repository yet.');
        } else {
            // Table header
            const cols = [60, 160, 50, 50, 50, 45, 80];
            const headers = ['Run ID', 'Suite / Job', 'Steps', 'Passed', 'Failed', 'Rate', 'Date'];
            let tx = 40, ty = doc.y;
            doc.rect(tx, ty, 515, 20).fill('#f0f0f0');
            headers.forEach((h, i) => {
                doc.fillColor('#555').fontSize(9).font('Helvetica-Bold')
                    .text(h, tx, ty + 5, { width: cols[i], align: 'left' });
                tx += cols[i];
            });
            doc.moveDown(1.2);

            reports.forEach((r, idx) => {
                if (doc.y > 750) { doc.addPage(); }
                tx = 40; ty = doc.y;
                if (idx % 2 === 0) doc.rect(tx, ty - 2, 515, 18).fill('#fafafa');
                const row = [
                    `#${String(r.run_id).slice(-6)}`,
                    r.suite_name || 'N/A',
                    String(r.total_tests),
                    String(r.passed),
                    String(r.failed),
                    `${r.pass_rate}%`,
                    r.latest_run ? new Date(r.latest_run).toLocaleDateString() : '-',
                ];
                row.forEach((cell, i) => {
                    const color = i === 3 ? '#16a34a' : i === 4 && r.failed > 0 ? '#dc2626' : '#111';
                    doc.fillColor(color).fontSize(9).font('Helvetica')
                        .text(cell, tx, ty, { width: cols[i], align: 'left' });
                    tx += cols[i];
                });
                doc.moveDown(0.8);
            });
        }

        doc.end();
    } catch (error) {
        console.error('PDF generation error:', error);
        if (!res.headersSent) res.status(500).json({ error: 'Failed to generate PDF: ' + error.message });
    }
});

app.get('/api/metrics/trend/:name', async (req, res) => {
    try {
        const userId = getUserId(req); if (!userId) return res.status(401).json({ error: 'Authentication required' });
        const { name } = req.params;
        const { timeRange, repository } = req.query;
        let days = 7;
        if (timeRange === '24h') days = 1;
        if (timeRange === '30d') days = 30;
        if (timeRange === '90d') days = 90;

        const rows = await metricsService.getTrend(name, days, repository, userId);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --------------------------------------------------------------------------
// Metrics Routes (DORA)
// --------------------------------------------------------------------------
app.get('/api/metrics/dora/:repo', async (req, res) => {
  try {
    const userId = getUserId(req); if (!userId) return res.status(401).json({ error: 'Authentication required' });
    const repoParam = decodeURIComponent(req.params.repo || '').trim();
    const repo = (repoParam === 'all' || repoParam === 'null' || !repoParam) ? null : repoParam;
    const range = (req.query.range || '7d').toString();

    // Support explicit ?days= override for trend comparison fetches
    let days = parseInt(req.query.days, 10) || 0;
    if (!days) {
        if (range === '24h') days = 1;
        else if (range === '30d') days = 30;
        else if (range === '90d') days = 90;
        else days = 7;
    }

    const data = await metricsService.getDoraMetrics(repo, days, userId);
    return res.json(data);
  } catch (error) {
    console.error('DORA metrics error:', error);
    return res.status(500).json({ error: error.message });
  }
});
// --------------------------------------------------------------------------
// Security Routes (New Processor & Scoped)
// --------------------------------------------------------------------------

app.get('/api/security/summary', async (req, res) => {
    try {
        const userId = getUserId(req); if (!userId) return res.status(401).json({ error: 'Authentication required' });
        const { repository } = req.query;
        const summary = await securityService.getSummary(repository, userId);
        res.json(summary);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/security/vulnerabilities/:owner/:repo', async (req, res) => {
    try {
        const userId = getUserId(req); if (!userId) return res.status(401).json({ error: 'Authentication required' });
        const repoFull = `${req.params.owner}/${req.params.repo}`.trim();
        const vulnerabilities = await securityService.getVulnerabilities(repoFull, userId);
        res.json(vulnerabilities);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/security/scan/trivy', expensiveLimiter, async (req, res) => {
    try {
        const userId = getUserId(req); if (!userId) return res.status(401).json({ error: 'Authentication required' });
        const { type, target, repository, options = {} } = req.body;
        if (!type || !target || !repository) return res.status(400).json({ error: 'Missing parameters' });

        const repoClean = repository.trim();
        const scanners = require('../services/security/scanners');

        // Remote repo URL — delegate to securityScannerFull (clone → Docker/TrivyLite → parse)
        if (type === 'repo' && target.startsWith('http')) {
            const token = req.session.githubToken || process.env.GITHUB_TOKEN || null;
            // Extract "owner/repo" from URL if possible
            const repoMatch = target.match(/github\.com\/([^/]+\/[^/]+?)(?:\.git)?(?:\/|$)/);
            const repoFullName = repoMatch ? repoMatch[1] : repoClean;

            const scanResult = await securityScannerFull.scanRepository(repoFullName, token, null, options);
            if (!scanResult) {
                return res.json({ success: true, results: [], message: 'No scannable content found in repository.' });
            }

            // Persist to DB so AI insights and security summary can read them
            const results = scanResult.vulnerabilities || [];
            for (const v of results) {
                try {
                    await securityService.addVulnerability(
                        userId, repoClean,
                        v.scanner || (v.type === 'secret' ? 'trivy:secret' : v.type === 'misconfiguration' ? 'trivy:config' : 'trivy:vuln'),
                        v.id || v.cve_id || null,
                        v.package_name || v.packageName || null,
                        (v.severity || 'low').toLowerCase(),
                        v.description || v.title || null,
                        v.primary_url || v.remediation || null,
                        v.installed_version || null,
                        v.fixed_version || null,
                        v.primary_url || null
                    );
                } catch (_) { /* skip duplicates */ }
            }
            io.emit('security_update', { type: 'SCAN_COMPLETED', repository: repoClean });
            return res.json({
                success: true,
                results,
                risk_score: scanResult.risk_score,
                risk_level: scanResult.risk_level,
                security_metrics: scanResult.security_metrics,
                engine: scanResult.engine
            });
        }

        // Local FS scan — no DB persistence
        const report = await scanners.runTrivyScan(type, target, options);
        const trivyLiteModule = require('../services/security/trivyLite');
        const liteResults = await trivyLiteModule.scanDirectory(target === '.' ? require('path').resolve(__dirname, '../') : target);
        io.emit('security_update', { type: 'SCAN_COMPLETED', repository: repoClean });
        res.json({ success: true, results: liteResults });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/security/scan/repo — full clone → Docker/TrivyLite → score pipeline
app.post('/api/security/scan/repo', expensiveLimiter, async (req, res) => {
    try {
        const userId = getUserId(req); if (!userId) return res.status(401).json({ error: 'Authentication required' });
        const { owner, repo, ref, options = {} } = req.body;
        if (!owner || !repo) return res.status(400).json({ error: 'Missing owner or repo' });

        const repoFull = `${owner}/${repo}`;
        const token = req.session.githubToken || process.env.GITHUB_TOKEN || null;

        const scanResult = await securityScannerFull.scanRepository(repoFull, token, ref || null, options);
        if (!scanResult) {
            return res.status(500).json({ error: 'Scan failed — check server logs.' });
        }

        // Persist to DB so AI insights and security summary can read them
        const results = scanResult.vulnerabilities || [];
        for (const v of results) {
            try {
                await securityService.addVulnerability(
                    userId, repoFull,
                    v.scanner || (v.type === 'secret' ? 'trivy:secret' : v.type === 'misconfiguration' ? 'trivy:config' : 'trivy:vuln'),
                    v.id || v.cve_id || null,
                    v.package_name || v.packageName || null,
                    (v.severity || 'low').toLowerCase(),
                    v.description || v.title || null,
                    v.primary_url || v.remediation || null,
                    v.installed_version || null,
                    v.fixed_version || null,
                    v.primary_url || null
                );
            } catch (_) { /* skip duplicates */ }
        }
        io.emit('security_update', { type: 'SCAN_COMPLETED', repository: repoFull });

        res.json({
            success: true,
            repository: repoFull,
            risk_score: scanResult.risk_score,
            risk_level: scanResult.risk_level,
            security_metrics: scanResult.security_metrics,
            engine: scanResult.engine,
            results
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/security/insights', async (req, res) => {
    try {
        const userId = getUserId(req); if (!userId) return res.status(401).json({ error: 'Authentication required' });
        const { repository } = req.query;
        if (!repository) return res.status(400).json({ error: 'repository is required' });
        const vulnerabilities = await securityService.getVulnerabilities(repository, userId);

        if (!vulnerabilities || vulnerabilities.length === 0) {
            return res.json({ insight: "No vulnerabilities detected. Posture is clean." });
        }

        // Use unified LLM service (HF → Gemini → static)
        const llm = require('../services/ai/llm');
        const result = await llm.securityReview(repository, vulnerabilities);

        // Persist insight to DB (fire-and-forget)
        const db = require('../services/database');
        const crypto = require('crypto');
        const inputHash = crypto.createHash('md5').update(JSON.stringify(vulnerabilities.map(v => v.id))).digest('hex');
        db.run(
            `INSERT INTO llm_insights (user_id, repository, insight_type, source, input_hash, data, latency_ms)
             VALUES (?, ?, 'security_review', ?, ?, ?, ?)`,
            [userId, repository, result.source, inputHash, JSON.stringify(result.data), result.latency_ms],
            () => {}
        );

        res.json({ insight: result.data?.risk_summary || JSON.stringify(result.data), llm: result.data, source: result.source });
    } catch (error) {
        res.status(500).json({ insight: "Insight generation failed." });
    }
});

// ── LLM Routes ────────────────────────────────────────────────────────────────

// POST /api/ai/security-review — full LLM security analysis
app.post('/api/ai/security-review', expensiveLimiter, async (req, res) => {
    try {
        const userId = getUserId(req); if (!userId) return res.status(401).json({ error: 'Authentication required' });
        const { repository } = req.body;
        if (!repository) return res.status(400).json({ error: 'repository is required' });
        const vulnerabilities = await securityService.getVulnerabilities(repository, userId);
        const llm = require('../services/ai/llm');
        const result = await llm.securityReview(repository, vulnerabilities);
        res.json(result);
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// POST /api/ai/pipeline-email — generate failure email for a run
app.post('/api/ai/pipeline-email', expensiveLimiter, async (req, res) => {
    try {
        const userId = getUserId(req); if (!userId) return res.status(401).json({ error: 'Authentication required' });
        const { run_id, failed_steps = [] } = req.body;
        if (!run_id) return res.status(400).json({ error: 'run_id is required' });

        const db = require('../services/database');
        const run = await new Promise((resolve, reject) =>
            db.get(`SELECT * FROM workflow_runs WHERE run_id = ? AND user_id = ?`, [run_id, userId], (e, r) => e ? reject(e) : resolve(r))
        );
        if (!run) return res.status(404).json({ error: 'Run not found' });

        const llm = require('../services/ai/llm');
        const result = await llm.pipelineFailureEmail(run, failed_steps);

        // Persist email
        db.run(
            `INSERT INTO llm_emails (user_id, email_type, repository, subject, body_html, body_text, urgency, source)
             VALUES (?, 'pipeline_failure', ?, ?, ?, ?, ?, ?)`,
            [userId, run.repository, result.data?.subject, result.data?.body_html, result.data?.body_text, result.data?.urgency, result.source],
            () => {}
        );

        res.json(result);
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// POST /api/ai/monitor-email — generate alert email for a monitored site
app.post('/api/ai/monitor-email', expensiveLimiter, async (req, res) => {
    try {
        const userId = getUserId(req); if (!userId) return res.status(401).json({ error: 'Authentication required' });
        const { site_id } = req.body;
        if (!site_id) return res.status(400).json({ error: 'site_id is required' });

        const db = require('../services/database');
        const site = await new Promise((resolve, reject) =>
            db.get(`SELECT * FROM monitored_sites WHERE id = ? AND user_id = ?`, [site_id, userId], (e, r) => e ? reject(e) : resolve(r))
        );
        if (!site) return res.status(404).json({ error: 'Site not found' });

        const check = await new Promise((resolve) =>
            db.get(`SELECT * FROM uptime_checks WHERE site_id = ? ORDER BY checked_at DESC LIMIT 1`, [site_id], (e, r) => resolve(r || {}))
        );

        const llm = require('../services/ai/llm');
        const result = await llm.monitorAlertEmail(site, check);

        db.run(
            `INSERT INTO llm_emails (user_id, email_type, subject, body_html, body_text, urgency, source)
             VALUES (?, 'monitor_alert', ?, ?, ?, ?, ?)`,
            [userId, result.data?.subject, result.data?.body_html, result.data?.body_text, result.data?.severity, result.source],
            () => {}
        );

        res.json(result);
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// GET /api/ai/dora-insights/:repo — AI analysis of DORA metrics
app.get('/api/ai/dora-insights/:repo', expensiveLimiter, async (req, res) => {
    try {
        const userId = getUserId(req); if (!userId) return res.status(401).json({ error: 'Authentication required' });
        const repo = decodeURIComponent(req.params.repo);
        const range = req.query.range || '7d';
        const metricsData = await metricsService.getDoraMetrics(repo, range === '24h' ? 1 : range === '30d' ? 30 : 7, userId);
        const llm = require('../services/ai/llm');
        const result = await llm.doraInsights(repo, metricsData, range);

        const db = require('../services/database');
        db.run(
            `INSERT INTO llm_insights (user_id, repository, insight_type, source, data, latency_ms)
             VALUES (?, ?, 'dora_insights', ?, ?, ?)`,
            [userId, repo, result.source, JSON.stringify(result.data), result.latency_ms],
            () => {}
        );

        res.json(result);
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// POST /api/ai/incident-response — incident response guidance
app.post('/api/ai/incident-response', expensiveLimiter, async (req, res) => {
    try {
        const userId = getUserId(req); if (!userId) return res.status(401).json({ error: 'Authentication required' });
        const { title, severity, affected_service, symptoms = [], recent_changes = [], error_logs = [] } = req.body;
        if (!title) return res.status(400).json({ error: 'title is required' });
        const llm = require('../services/ai/llm');
        const result = await llm.incidentResponse({ title, severity, affected_service, symptoms, recent_changes, error_logs });
        res.json(result);
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// GET /api/ai/emails — list generated emails for current user
app.get('/api/ai/emails', async (req, res) => {
    try {
        const userId = getUserId(req); if (!userId) return res.status(401).json({ error: 'Authentication required' });
        const db = require('../services/database');
        db.all(
            `SELECT id, email_type, repository, subject, urgency, sent, source, created_at FROM llm_emails WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
            [userId],
            (e, rows) => e ? res.status(500).json({ error: e.message }) : res.json(rows || [])
        );
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// GET /api/ai/health — check HF Space connectivity
app.get('/api/ai/health', async (req, res) => {
    const hfUrl = process.env.HF_SPACE_URL;
    if (!hfUrl) return res.json({ hf: false, gemini: Boolean(process.env.GEMINI_API_KEY), hf_url: null });
    try {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 5000);
        const r = await fetch(`${hfUrl}/health`, { signal: controller.signal });
        const data = await r.json();
        res.json({ hf: true, hf_status: data, gemini: Boolean(process.env.GEMINI_API_KEY), hf_url: hfUrl });
    } catch (e) {
        res.json({ hf: false, hf_error: e.message, gemini: Boolean(process.env.GEMINI_API_KEY), hf_url: hfUrl });
    }
});

app.get('/api/security/sbom/:owner/:repo', async (req, res) => {
    try {
        const repoFull = `${req.params.owner}/${req.params.repo}`.trim();
        const scanners = require('../services/security/scanners');
        const SCAN_DIR = require('path').resolve(__dirname, '../');
        const sbom = await scanners.generateSBOM(SCAN_DIR);
        // Override the root component name with the actual repo
        sbom.metadata.component.name = repoFull;
        res.json(sbom);
    } catch (error) {
        res.status(500).json({ error: 'Failed to generate SBOM' });
    }
});

// GET /api/security/dependabot/:owner/:repo — fetch Dependabot alerts and persist them
app.get('/api/security/dependabot/:owner/:repo', async (req, res) => {
    try {
        const userId = getUserId(req); if (!userId) return res.status(401).json({ error: 'Authentication required' });
        const { owner, repo } = req.params;
        const repoFull = `${owner}/${repo}`;

        await ensureGithub(req);
        const alerts = await githubService.getDependabotAlerts(owner, repo);

        if (alerts.length === 0) {
            return res.json({ alerts: [], message: 'No open Dependabot alerts (or Dependabot not enabled for this repo).' });
        }

        // Persist each alert as a vulnerability in our DB (upsert by cve_id + repo)
        for (const alert of alerts) {
            await securityService.addVulnerability(
                userId,
                repoFull,
                'dependabot',
                alert.cve_id,
                alert.package_name,
                alert.severity,
                alert.summary,
                alert.html_url,
                alert.installed_version,
                alert.fixed_version,
                alert.html_url
            );
        }

        io.emit('security_update', { type: 'DEPENDABOT_SYNCED', repository: repoFull, count: alerts.length });

        res.json({ alerts, count: alerts.length });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.get('/api/security/snyk/:owner/:repo', async (req, res) => {
    try {
        const userId = getUserId(req); if (!userId) return res.status(401).json({ error: 'Authentication required' });
        const { owner, repo } = req.params;
        if (!process.env.SNYK_TOKEN || !process.env.SNYK_ORG_ID) {
            return res.json([]);
        }
        const results = await securityScanner.fetchSnykIssues(owner, repo, userId);
        res.json(results);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/security/licenses/:owner/:repo — license findings
app.get('/api/security/licenses/:owner/:repo', async (req, res) => {
    try {
        const userId = getUserId(req); if (!userId) return res.status(401).json({ error: 'Authentication required' });
        const repoFull = `${req.params.owner}/${req.params.repo}`.trim();
        const findings = await securityService.getLicenseFindings(repoFull, userId);
        res.json(findings);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/security/scan/history — scan history
app.get('/api/security/scan/history', async (req, res) => {
    try {
        const userId = getUserId(req); if (!userId) return res.status(401).json({ error: 'Authentication required' });
        const { repository } = req.query;
        const history = await securityService.getScanHistory(repository || null, userId);
        res.json(history);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/security/scan/full — run all scanners
app.post('/api/security/scan/full', expensiveLimiter, async (req, res) => {
    try {
        const userId = getUserId(req); if (!userId) return res.status(401).json({ error: 'Authentication required' });
        const { repository } = req.body;
        if (!repository) return res.status(400).json({ error: 'Missing repository' });

        const scanners = require('../services/security/scanners');
        const SCAN_DIR = require('path').resolve(__dirname, '../');
        const startedAt = new Date().toISOString();
        const warnings = [];
        const counts = { critical: 0, high: 0, medium: 0, low: 0 };
        const scanTypes = [];

        const countResults = (results) => {
            for (const r of results || []) {
                const s = (r.severity || '').toLowerCase();
                if (counts[s] !== undefined) counts[s]++;
            }
        };

        // Only run local FS scans — these scan the actual project on disk.
        // Remote-only repos (e.g. GitHub profile READMEs) have no local files to scan,
        // so we still scan the local project but tag results under the selected repo name.

        // 1. Trivy FS scan (vuln + secret + SAST + Dockerfile + K8s)
        try {
            const trivyReport = await scanners.runTrivyScan('fs', SCAN_DIR);
            const trivyResults = await securityScanner.processTrivyReport(repository, trivyReport, userId);
            countResults(trivyResults);
            scanTypes.push('trivy');
        } catch (e) { warnings.push(`trivy: ${e.message}`); }

        // 2. License scan
        try {
            const licenseFindings = await scanners.runLicenseScan(SCAN_DIR);
            const licenseResults = await securityScanner.processLicenseFindings(repository, licenseFindings, userId);
            countResults(licenseResults);
            scanTypes.push('license');
        } catch (e) { warnings.push(`license: ${e.message}`); }

        // 3. IaC scan
        try {
            const iacFindings = await scanners.runIaCScan(SCAN_DIR);
            if (iacFindings.length > 0) {
                const iacReport = { Results: [{ Target: 'IaC', Misconfigurations: iacFindings.map(f => ({ ID: f.id, Title: f.title, Severity: f.severity, Description: f.description, Type: f.type })) }] };
                const iacResults = await securityScanner.processTrivyReport(repository, iacReport, userId);
                countResults(iacResults);
                scanTypes.push('iac');
            }
        } catch (e) { warnings.push(`iac: ${e.message}`); }

        // 4. npm audit
        try {
            const auditJson = await scanners.runNpmAudit(SCAN_DIR);
            if (auditJson) {
                const auditResults = await securityScanner.processNpmAudit(repository, auditJson, userId);
                countResults(auditResults);
                scanTypes.push('npm-audit');
            }
        } catch (e) { warnings.push(`npm-audit: ${e.message}`); }

        const findingsCount = counts.critical + counts.high + counts.medium + counts.low;
        const completedAt = new Date().toISOString();

        // Insert scan_results record
        const db = require('../services/database');
        db.run(
            `INSERT INTO scan_results (user_id, repository, scan_type, status, findings_count, critical_count, high_count, medium_count, low_count, scan_metadata, started_at, completed_at)
             VALUES (?, ?, ?, 'completed', ?, ?, ?, ?, ?, ?, ?, ?)`,
            [userId, repository, scanTypes.join(','), findingsCount, counts.critical, counts.high, counts.medium, counts.low, JSON.stringify({ warnings }), startedAt, completedAt]
        );

        io.emit('security_update', { type: 'SCAN_COMPLETED', repository });

        res.json({ success: true, repository, scanTypes, summary: { total: findingsCount, ...counts }, warnings });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --------------------------------------------------------------------------
// DORA & Pipeline (Dynamic & Scoped)
// --------------------------------------------------------------------------

app.get('/api/pipeline/runs', async (req, res) => {
    try {
        const userId = getUserId(req); if (!userId) return res.status(401).json({ error: 'Authentication required' });
        const { repository, limit } = req.query;
        const runs = await webhookService.getRecentWorkflowRuns(limit || 20, repository, userId);
        res.json(runs);
    } catch (error) {
        res.status(500).json([]);
    }
});

// Sync pipeline runs + jobs from GitHub into local DB
app.post('/api/pipeline/sync', async (req, res) => {
    try {
        const userId = getUserId(req); if (!userId) return res.status(401).json({ error: 'Authentication required' });
        const repository = sanitizeRepo(req.body?.repository) || '';
        if (!repository) {
            return res.status(400).json({ error: 'Missing or invalid repository (expected owner/repo)' });
        }
        if (!shouldSync(userId, repository, 'pipeline')) {
            return res.json({ success: true, skipped: true, reason: 'Recently synced' });
        }
        await ensureGithub(req);
        const [runsResult, jobsResult] = await Promise.allSettled([
            metricsService.syncWorkflowRunsFromGitHub(repository, 30, userId),
            analytics.syncJobsFromGitHub(repository, userId)
        ]);
        res.json({
            success: true,
            runs: runsResult.status === 'fulfilled' ? runsResult.value : { error: runsResult.reason?.message },
            jobs: jobsResult.status === 'fulfilled' ? jobsResult.value : { error: jobsResult.reason?.message }
        });
    } catch (error) {
        console.error('Pipeline sync error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Trigger Pipeline (GitHub Action)
app.post('/api/ci/run', async (req, res) => {
    try {
        const { owner, repo, workflow_id } = req.body;
        if (!owner || !repo) return res.status(400).json({ error: 'Missing owner or repo' });
        
        await githubService.triggerWorkflow(owner, repo, workflow_id || 'ci.yml');
        
        // Broadcast to specific clients
        io.emit('pipeline_update', {
            type: 'PIPELINE_TRIGGERED',
            repository: `${owner}/${repo}`,
            message: `Pipeline triggered for ${repo}`,
            timestamp: new Date().toISOString()
        });

        res.json({ success: true, message: 'Pipeline triggered successfully' });
    } catch (error) {
        console.error('Trigger pipeline error:', error.message);
        res.status(500).json({ error: 'Failed to trigger pipeline' });
    }
});


// Deployment stats
app.get('/api/deployments/stats', async (req, res) => {
    try {
        const db = require('../services/database');
        db.all('SELECT * FROM deployments ORDER BY start_time DESC LIMIT 20', [], (err, rows) => {
            if (err) return res.json({ deployments: [], total: 0 });
            res.json({ deployments: rows || [], total: rows?.length || 0 });
        });
    } catch {
        res.json({ deployments: [], total: 0 });
    }
});

// --------------------------------------------------------------------------
// Datadog Proxy Routes
// --------------------------------------------------------------------------
const datadogService = require('../services/datadog');

// GET /api/datadog/status — check if Datadog is configured
app.get('/api/datadog/status', (req, res) => {
    res.json({ enabled: datadogService.enabled, site: process.env.DATADOG_SITE || null });
});

// GET /api/datadog/metrics/query?metric=build.success&range=24h&repository=owner/repo
// Serves from local SQLite — no Datadog APP_KEY scope needed
app.get('/api/datadog/metrics/query', async (req, res) => {
    try {
        const userId = getUserId(req); if (!userId) return res.status(401).json({ error: 'Authentication required' });
        const { metric, range, repository } = req.query;
        if (!metric) return res.status(400).json({ error: 'Missing metric parameter' });

        const now = Math.floor(Date.now() / 1000);
        const rangeMap = { '1h': 3600, '6h': 21600, '24h': 86400, '7d': 604800 };
        const seconds = rangeMap[range] || 86400;
        const from = now - seconds;

        const points = await datadogService.queryLocalMetric(metric, from, now, repository || null, userId);
        res.json({ metric, from, to: now, points });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --------------------------------------------------------------------------
// Metrics Routes (DORA) - Sync workflow runs from GitHub
// --------------------------------------------------------------------------
app.post('/api/metrics/dora/sync', expensiveLimiter, async (req, res) => {
  try {
    const userId = getUserId(req); if (!userId) return res.status(401).json({ error: 'Authentication required' });
    const repository = sanitizeRepo(req.body?.repository || req.query?.repository) || '';
    const days = Number(req.body?.days || req.query?.days || 7) || 7;

    if (!repository) {
      return res.status(400).json({ error: 'Missing or invalid repository (expected owner/repo)' });
    }

    if (!shouldSync(userId, repository, 'dora')) {
      return res.json({ success: true, skipped: true, reason: 'Recently synced' });
    }

    await ensureGithub(req);
    const result = await metricsService.syncWorkflowRunsFromGitHub(repository, days, userId);
    return res.json({ success: true, ...result });
  } catch (error) {
    console.error('DORA sync error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Pipeline stats (alias)
app.get('/api/pipelines/stats', async (req, res) => {
    try {
        const runs = await webhookService.getRecentWorkflowRuns(50);
        const total = runs.length;
        const passed = runs.filter(r => r.conclusion === 'success').length;
        const failed = runs.filter(r => r.conclusion === 'failure').length;
        res.json({ total, passed, failed, successRate: total > 0 ? Math.round((passed / total) * 100) : 0 });
    } catch (error) {
        res.json({ total: 0, passed: 0, failed: 0, successRate: 0 });
    }
});

// ... (Other specific routes can rely on Services as before)

// --------------------------------------------------------------------------
// Analytics / Visitor Tracking
// --------------------------------------------------------------------------

// Middleware: track every page navigation (frontend calls this on route change)
app.post('/api/analytics/pageview', (req, res) => {
    try {
        const { path: pagePath, sessionId } = req.body;
        const userId = req.session.user?.dbId || null;
        const crypto = require('crypto');
        const ip = req.ip || req.connection?.remoteAddress || 'unknown';
        const ipHash = crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16);
        const ua = req.headers['user-agent'] || '';
        const db = require('../services/database');
        db.run(
            `INSERT INTO page_views (user_id, path, ip_hash, session_id, user_agent) VALUES (?, ?, ?, ?, ?)`,
            [userId, pagePath || '/', ipHash, sessionId || null, ua],
            () => {}
        );
        res.json({ ok: true });
    } catch { res.json({ ok: true }); }
});

// --------------------------------------------------------------------------
// Uptime Monitoring Routes
// --------------------------------------------------------------------------

// GET /api/monitor/sites — list user's monitored sites
app.get('/api/monitor/sites', async (req, res) => {
    try {
        const userId = getUserId(req); if (!userId) return res.status(401).json({ error: 'Authentication required' });
        const isAdmin = req.session.user?.isAdmin === true;
        const sites = await monitor.getSites(userId, isAdmin);
        res.json(sites);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/monitor/verify/send — send a 6-digit verification code to the alert email
app.post('/api/monitor/verify/send', async (req, res) => {
    try {
        const userId = getUserId(req); if (!userId) return res.status(401).json({ error: 'Authentication required' });
        const { url, email } = req.body;
        if (!url || !email) return res.status(400).json({ error: 'url and email are required' });
        // Basic email format check
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Invalid email address' });
        await monitor.sendVerificationCode(userId, email.trim(), url.trim());
        res.json({ ok: true, message: `Verification code sent to ${email}` });
    } catch (e) { res.status(400).json({ error: e.message }); }
});

// POST /api/monitor/verify/confirm — confirm the code, then add the site
app.post('/api/monitor/verify/confirm', async (req, res) => {
    try {
        const userId = getUserId(req); if (!userId) return res.status(401).json({ error: 'Authentication required' });
        const isAdmin = req.session.user?.isAdmin === true;
        const { url, email, code } = req.body;
        if (!url || !email || !code) return res.status(400).json({ error: 'url, email, and code are required' });

        // Verify the code first
        await monitor.verifyCode(userId, email.trim(), url.trim(), code.trim());

        // Code is valid — now add the site
        const site = await monitor.addSite(userId, url.trim(), email.trim(), isAdmin);
        res.json(site);
    } catch (e) { res.status(400).json({ error: e.message }); }
});

// POST /api/monitor/sites — add a site to monitor
app.post('/api/monitor/sites', async (req, res) => {
    try {
        const userId = getUserId(req); if (!userId) return res.status(401).json({ error: 'Authentication required' });
        const isAdmin = req.session.user?.isAdmin === true;
        const { url, alert_email } = req.body;
        if (!url) return res.status(400).json({ error: 'url is required' });
        const site = await monitor.addSite(userId, url, alert_email, isAdmin);
        res.json(site);
    } catch (e) { res.status(400).json({ error: e.message }); }
});

// DELETE /api/monitor/sites/:id — remove a site
app.delete('/api/monitor/sites/:id', async (req, res) => {
    try {
        const userId = getUserId(req); if (!userId) return res.status(401).json({ error: 'Authentication required' });
        const isAdmin = req.session.user?.isAdmin === true;
        await monitor.removeSite(userId, parseInt(req.params.id), isAdmin);
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/monitor/sites/:id/checks?hours=24 — raw check history
app.get('/api/monitor/sites/:id/checks', requireApiAuth, async (req, res) => {
    try {
        const hours = Math.min(parseInt(req.query.hours) || 24, 720); // cap at 30 days
        const checks = await monitor.getChecks(parseInt(req.params.id), hours);
        res.json(checks);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/monitor/sites/:id/stats?hours=24 — aggregated stats
app.get('/api/monitor/sites/:id/stats', requireApiAuth, async (req, res) => {
    try {
        const hours = Math.min(parseInt(req.query.hours) || 24, 720);
        const stats = await monitor.getStats(parseInt(req.params.id), hours);
        res.json(stats);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/monitor/sites/:id/incidents — incident history
app.get('/api/monitor/sites/:id/incidents', requireApiAuth, async (req, res) => {
    try {
        const incidents = await monitor.getIncidents(parseInt(req.params.id));
        res.json(incidents);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --------------------------------------------------------------------------
// IDS — Intrusion Detection System Routes (admin only)
// --------------------------------------------------------------------------

// GET /api/ids/events — recent anomaly/threat events
app.get('/api/ids/events', requireApiAuth, (req, res) => {
    if (!req.session.user?.isAdmin) return res.status(403).json({ error: 'Admin only' });
    const limit = parseInt(req.query.limit) || 100;
    res.json(ids.getRecentEvents(limit));
});

// GET /api/ids/blocked — currently blocked IPs
app.get('/api/ids/blocked', requireApiAuth, (req, res) => {
    if (!req.session.user?.isAdmin) return res.status(403).json({ error: 'Admin only' });
    res.json(ids.getBlockedIPs());
});

// GET /api/ids/traffic — top IPs by request count
app.get('/api/ids/traffic', requireApiAuth, (req, res) => {
    if (!req.session.user?.isAdmin) return res.status(403).json({ error: 'Admin only' });
    res.json(ids.getTrafficStats());
});

// DELETE /api/ids/blocked/:ip — manually unblock an IP
app.delete('/api/ids/blocked/:ip', requireApiAuth, (req, res) => {
    if (!req.session.user?.isAdmin) return res.status(403).json({ error: 'Admin only' });
    ids.unblockIP(req.params.ip);
    res.json({ ok: true });
});

// --------------------------------------------------------------------------
// Visitor Analytics (Type B — external site beacon)
// --------------------------------------------------------------------------

// Middleware: admin-only guard — checks isAdmin flag set at login time from GITHUB_TOKEN
const requireAdmin = (req, res, next) => {
    if (!req.session.user?.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
};

// GET /api/visitor/script/:siteId — returns the embeddable JS snippet (admin only)
app.get('/api/visitor/script/:siteId', requireAdmin, async (req, res) => {
    const siteId = parseInt(req.params.siteId);
    const db = require('../services/database');
    db.get(`SELECT id, url FROM monitored_sites WHERE id=? AND active=1`, [siteId], (err, site) => {
        if (err || !site) return res.status(404).json({ error: 'Site not found' });
        const beaconUrl = `${req.protocol}://${req.get('host')}/api/visitor/beacon/${siteId}`;
        const script = `<!-- PipelineXR Visitor Analytics -->
<script>
(function(){
  var sid = sessionStorage.getItem('_pxr_s');
  if(!sid){ sid = Math.random().toString(36).slice(2)+Date.now().toString(36); sessionStorage.setItem('_pxr_s',sid); }
  var d = { path: location.pathname, referrer: document.referrer, session_id: sid };
  fetch('${beaconUrl}', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(d), keepalive: true }).catch(function(){});
  window.addEventListener('popstate', function(){ d.path = location.pathname; fetch('${beaconUrl}', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(d), keepalive: true }).catch(function(){}); });
})();
</script>`;
        res.json({ siteId, url: site.url, script });
    });
});

// POST /api/visitor/beacon/:siteId — receives beacon from external site (public, no auth)
app.post('/api/visitor/beacon/:siteId', (req, res) => {
    try {
        const siteId = parseInt(req.params.siteId);
        const { path: pagePath, referrer, session_id } = req.body || {};
        const crypto = require('crypto');
        const ip = req.ip || req.connection?.remoteAddress || 'unknown';
        const ipHash = crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16);
        const ua = req.headers['user-agent'] || '';
        const db = require('../services/database');
        db.run(
            `INSERT INTO visitor_events (site_id, path, referrer, ip_hash, ua, session_id) VALUES (?,?,?,?,?,?)`,
            [siteId, pagePath || '/', referrer || null, ipHash, ua, session_id || null],
            () => {}
        );
        // Allow cross-origin beacons
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.json({ ok: true });
    } catch { res.json({ ok: true }); }
});

// Handle CORS preflight for beacon
app.options('/api/visitor/beacon/:siteId', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.sendStatus(204);
});

// GET /api/visitor/stats/:siteId?hours=24 — visitor stats for a site (admin only)
app.get('/api/visitor/stats/:siteId', requireAdmin, (req, res) => {
    const siteId = parseInt(req.params.siteId);
    const hours = parseInt(req.query.hours) || 24;
    const db = require('../services/database');

    const queries = [
        [`SELECT COUNT(*) as total FROM visitor_events WHERE site_id=$1 AND timestamp >= NOW() - ($2 * INTERVAL '1 hour')`, [siteId, hours]],
        [`SELECT COUNT(DISTINCT COALESCE(session_id, ip_hash)) as sessions FROM visitor_events WHERE site_id=$1 AND timestamp >= NOW() - ($2 * INTERVAL '1 hour')`, [siteId, hours]],
        [`SELECT COUNT(DISTINCT ip_hash) as unique_ips FROM visitor_events WHERE site_id=$1 AND timestamp >= NOW() - ($2 * INTERVAL '1 hour')`, [siteId, hours]],
        [`SELECT path, COUNT(*) as views FROM visitor_events WHERE site_id=$1 AND timestamp >= NOW() - ($2 * INTERVAL '1 hour') GROUP BY path ORDER BY views DESC LIMIT 8`, [siteId, hours]],
        [`SELECT referrer, COUNT(*) as count FROM visitor_events WHERE site_id=$1 AND referrer IS NOT NULL AND referrer != '' AND timestamp >= NOW() - ($2 * INTERVAL '1 hour') GROUP BY referrer ORDER BY count DESC LIMIT 6`, [siteId, hours]],
        [`SELECT to_char(date_trunc('hour', timestamp), 'YYYY-MM-DD"T"HH24:00') as hour, COUNT(*) as views FROM visitor_events WHERE site_id=$1 AND timestamp >= NOW() - ($2 * INTERVAL '1 hour') GROUP BY hour ORDER BY hour ASC`, [siteId, hours]],
    ];

    Promise.all(queries.map(([ q, p ], i) => new Promise(resolve => {
        const method = i >= 3 ? 'all' : 'get';
        db[method](q, p, (err, rows) => resolve(err ? (i >= 3 ? [] : {}) : rows));
    }))).then(([total, sessions, ips, topPages, topReferrers, hourly]) => {
        res.json({
            totalViews: parseInt(total?.total) || 0,
            uniqueSessions: parseInt(sessions?.sessions) || 0,
            uniqueIPs: parseInt(ips?.unique_ips) || 0,
            topPages: topPages || [],
            topReferrers: topReferrers || [],
            hourly: hourly || [],
        });
    });
});

// GET /api/visitor/sites — list admin's monitored sites (for dropdown in settings, admin only)
app.get('/api/visitor/sites', requireAdmin, async (req, res) => {
    try {
        const userId = getUserId(req); if (!userId) return res.status(401).json({ error: 'Authentication required' });
        const sites = await monitor.getSites(userId, true); // admin-only route
        res.json(sites);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/analytics/summary — visitor stats for Settings panel
app.get('/api/analytics/summary', async (req, res) => {
    const db = require('../services/database');

    const queries = {
        todayViews:    [`SELECT COUNT(*) as count FROM page_views WHERE timestamp >= CURRENT_DATE`, []],
        weekViews:     [`SELECT COUNT(*) as count FROM page_views WHERE timestamp >= NOW() - INTERVAL '7 days'`, []],
        totalViews:    [`SELECT COUNT(*) as count FROM page_views`, []],
        todaySessions: [`SELECT COUNT(DISTINCT COALESCE(session_id, ip_hash)) as count FROM page_views WHERE timestamp >= CURRENT_DATE`, []],
        topPages:      [`SELECT path, COUNT(*) as views FROM page_views WHERE timestamp >= NOW() - INTERVAL '7 days' GROUP BY path ORDER BY views DESC LIMIT 6`, []],
        dailyViews:    [`SELECT DATE(timestamp) as day, COUNT(*) as views FROM page_views WHERE timestamp >= NOW() - INTERVAL '7 days' GROUP BY day ORDER BY day ASC`, []],
        totalUsers:    [`SELECT COUNT(*) as count FROM users`, []],
    };

    try {
        const keys = Object.keys(queries);
        const results = await Promise.all(keys.map(key => {
            const method = key === 'topPages' || key === 'dailyViews' ? 'all' : 'get';
            const [sql, params] = queries[key];
            return new Promise((resolve, reject) => {
                db[method](sql, params, (err, rows) => err ? reject(err) : resolve({ key, rows }));
            });
        }));

        const data = {};
        for (const { key, rows } of results) data[key] = rows;

        const liveConnections = io.engine?.clientsCount || 0;
        res.json({
            todayViews:    parseInt(data.todayViews?.count) || 0,
            weekViews:     parseInt(data.weekViews?.count) || 0,
            totalViews:    parseInt(data.totalViews?.count) || 0,
            todaySessions: parseInt(data.todaySessions?.count) || 0,
            liveNow:       liveConnections,
            totalUsers:    parseInt(data.totalUsers?.count) || 0,
            topPages:      data.topPages || [],
            dailyViews:    data.dailyViews || [],
        });
    } catch (err) {
        console.error('[analytics/summary] error:', err.message);
        res.status(500).json({ error: 'Failed to load analytics' });
    }
});



// --------------------------------------------------------------------------
// Core Pages
// --------------------------------------------------------------------------

app.use(express.static(path.join(__dirname, '../public')));

// Root now protects Dashboard
app.get('/', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Explicit Dashboard route
app.get('/Dashboard.html', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Health test route for webhook
app.get('/api/webhook/test', (req, res) => {
    res.json({ status: 'Webhook route active', timestamp: new Date().toISOString() });
});

// Fallback
app.get(/(.*)/, (req, res) => {
    // If it's an API route 404
    if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not Found' });
    // Otherwise try to check auth or serve static
    if (!req.session.authenticated) {
        if (req.path.endsWith('.html')) return res.redirect('/login.html');
    }
    res.sendFile(path.join(__dirname, '../public' + req.path), (err) => {
        if (err) res.redirect('/');
    });
});

// --------------------------------------------------------------------------
// Socket & Server Start
// --------------------------------------------------------------------------

// Validate required environment variables
console.log('🔍 Validating environment variables...');
const requiredVars = ['GITHUB_WEBHOOK_SECRET']; // GITHUB_TOKEN is now optional as OAuth is used for user sessions
const missingVars = requiredVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
    console.warn('⚠️ Missing optional environment variables:', missingVars);
    console.warn('The application will still start, but some background features might be limited.');
}


// Check if GITHUB_WEBHOOK_SECRET has the expected format
if (process.env.GITHUB_WEBHOOK_SECRET && process.env.GITHUB_WEBHOOK_SECRET.length < 10) {
    console.warn('⚠️  GITHUB_WEBHOOK_SECRET seems too short. Make sure it is a secure secret.');
}

// Socket.io connection handling is now in RealtimeStreamService
// The service automatically handles connections and events

// Initialize database and start server
async function startServer() {
    try {
        console.log('\n🔍 Validating environment variables...');

        // Resolve admin login from GITHUB_TOKEN before anything else
        await resolveAdminLogin();

        // Initialize database schema on Neon PostgreSQL
        await initializeDatabase();

        // Initialize services AFTER DB is ready
        analytics = new AnalyticsService();
        webhookService = new GitHubWebhookService();
        realtimeService = new RealtimeStreamService(io);

        // Start background uptime monitor
        monitor.startMonitor();

        // Prune expired sessions daily (keep Neon storage clean)
        setInterval(() => {
            const db = require('../services/database');
            db.run(`DELETE FROM session WHERE expire < NOW()`, [], () => {});
        }, 24 * 60 * 60 * 1000);

        // Start server
        server.listen(PORT, () => {
            console.log(`\n🚀 PipelineXR running on http://localhost:${PORT}`);
            console.log(`📊 Pipeline Monitoring: Active`);
            console.log(`📡 Real-time Streaming: Active`);
            console.log(`🔗 Webhook Endpoint: POST http://localhost:${PORT}/api/github/webhook`);
            console.log(`✅ Database: Neon PostgreSQL`);
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

// Start the server
startServer();

// Graceful shutdown — handles both Ctrl+C (SIGINT) and Render's shutdown signal (SIGTERM)
const shutdown = () => {
    console.log('\n🛑 Shutting down gracefully...');
    server.close(async () => {
        try {
            const db = require('../services/database');
            await db.end(); // close pg pool
        } catch (e) { /* ignore */ }
        console.log('✅ Server closed');
        process.exit(0);
    });
    // Force exit after 10s if server doesn't close cleanly
    setTimeout(() => process.exit(1), 10000);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
