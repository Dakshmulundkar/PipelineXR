const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const rateLimit = require('express-rate-limit');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { initializeDatabase } = require('../services/db-init');
require('dotenv').config();

// Configuration
const PORT = process.env.PORT || 3001;
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const SESSION_SECRET = process.env.SESSION_SECRET || 'your-secret-key';
const FRONTEND_URL = process.env.FRONTEND_URL || `http://localhost:${PORT}`;

// Supabase logic removed - using local SQLite instead

// Initialize Apps
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Middleware
app.use(cors({
    origin: FRONTEND_URL,
    credentials: true
}));

// Raw body parser for webhook signature verification (must come before json parser)
app.use('/api/github/webhook', express.raw({ type: 'application/json' }));

app.use(express.json());
app.use(express.text()); // For raw log ingestion

app.use(session({
    store: new SQLiteStore({
        db: 'sessions.sqlite',
        dir: process.cwd()
    }),
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, // Set to true in production with HTTPS
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        httpOnly: true,
        sameSite: 'lax'
    }
}));

// Global Rate Limiting
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api/', apiLimiter);

// Stricter Rate Limiting for expensive endpoints
const expensiveLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20, // Limit each IP to 20 expensive requests per hour
    message: { error: 'Too many requests, please try again later.' }
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


// Initialize Services
const analytics = new AnalyticsService();
const webhookService = new GitHubWebhookService();
const realtimeService = new RealtimeStreamService(io);

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: "gemini-pro" });


// --------------------------------------------------------------------------
// Authentication Middleware & Routes
// --------------------------------------------------------------------------

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

// API-specific auth middleware — returns 401 JSON instead of redirect
const requireApiAuth = (req, res, next) => {
    if (req.session.authenticated) {
        next();
    } else {
        res.status(401).json({ error: 'Authentication required' });
    }
};

// Initiate GitHub Login
app.get('/auth/github', (req, res) => {
    const redirectUri = `${FRONTEND_URL}/auth/github/callback`;
    const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&scope=repo,user:email&redirect_uri=${encodeURIComponent(redirectUri)}`;
    console.log('GitHub OAuth URL:', githubAuthUrl);
    console.log('Redirect URI:', redirectUri);
    res.redirect(githubAuthUrl);
});

// GitHub Callback
app.get('/auth/github/callback', async (req, res) => {
    const { code, error, error_description } = req.query;

    console.log('GitHub callback received:', { code: code ? 'present' : 'missing', error, error_description });

    if (error) {
        console.error('GitHub OAuth error:', error, error_description);
        return res.redirect(`/login.html?error=${error}&description=${encodeURIComponent(error_description || '')}`);
    }

    if (!code) {
        console.error('No authorization code received');
        return res.redirect(`/login.html?error=no_code`);
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
            console.error('GitHub Token Error:', tokenData);
            return res.redirect(`/login.html?error=${tokenData.error}&description=${encodeURIComponent(tokenData.error_description || '')}`);
        }

        if (!tokenData.access_token) {
            console.error('No access token received:', tokenData);
            return res.redirect(`/login.html?error=no_token`);
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

        // 3. Upsert User into local SQLite
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
        }

        // 4. Set Session
        req.session.user = userInfo;
        req.session.authenticated = true;
        console.log('Session established for user:', userInfo.login);


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
        console.error('GitHub OAuth error:', error);
        res.redirect(`${FRONTEND_URL}/auth/callback?error=oauth_failed&description=${encodeURIComponent(error.message)}`);
    }
});

app.get('/auth/logout', (req, res) => {
    req.session.destroy();
    res.redirect(`${FRONTEND_URL}/login`);
});

app.get('/auth/user', (req, res) => {
    if (req.session.user) {
        res.json({
            user: req.session.user,
            authenticated: true
        });
    } else {
        res.json({ authenticated: false });
    }
});

// --------------------------------------------------------------------------
// Data Routes
// --------------------------------------------------------------------------

// Apply API auth to all /api/ routes EXCEPT webhooks, health checks, and config
app.use('/api', (req, res, next) => {
    // Session-less access enabled for Hackathon Demo Mode
    return next();
    // const publicPaths = ['/github/webhook', '/webhook', '/webhook/test', '/config/check'];
    // if (publicPaths.some(p => req.path === p || req.path.startsWith(p))) {
    //     return next();
    // }
    // requireApiAuth(req, res, next);
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

        await ensureGithub(req);
        await githubService.triggerWorkflow(owner, repo, workflow_id, ref || 'main');

        // Optional: Still run the local pipeline simulator if needed, or remove it
        // const pipelineService = new PipelineService(io);
        // pipelineService.runPipeline();

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

// Re-initialize GitHub service from session token for every API call if needed
const ensureGithub = async (req) => {
    const token = req.session.githubToken || process.env.GITHUB_TOKEN;
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
// --------------------------------------------------------------------------
// Analytics & Reporting Routes (Scoped)
// --------------------------------------------------------------------------

app.get('/api/reports/tests', async (req, res) => {
    try {
        const userId = req.session.user?.dbId || 1;
        const reports = await analytics.getTestReports(userId);
        const enriched = reports.map(r => ({
            ...r,
            pass_rate: r.total_tests > 0 ? Math.round((r.passed / r.total_tests) * 100) : 0
        }));
        res.json(enriched);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch reports' });
    }
});

app.get('/api/reports/summary', async (req, res) => {
    try {
        const userId = req.session.user?.dbId || 1;
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

app.get('/api/metrics/trend/:name', async (req, res) => {
    try {
        const userId = req.session.user?.dbId || 1;
        const { name } = req.params;
        const { timeRange, repository } = req.query;
        let days = 7;
        if (timeRange === '24h') days = 1;
        if (timeRange === '30d') days = 30;

        const rows = await metricsService.getTrend(name, days, repository, userId);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --------------------------------------------------------------------------
// Security Routes (New Processor & Scoped)
// --------------------------------------------------------------------------

app.get('/api/security/summary', async (req, res) => {
    try {
        const userId = req.session.user?.dbId || 1;
        const { repository } = req.query;
        const summary = await securityService.getSummary(repository, userId);
        res.json(summary);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/security/vulnerabilities/:owner/:repo', async (req, res) => {
    try {
        const userId = req.session.user?.dbId || 1;
        const repoFull = `${req.params.owner}/${req.params.repo}`.trim();
        const vulnerabilities = await securityService.getVulnerabilities(repoFull, userId);
        res.json(vulnerabilities);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/security/scan/trivy', async (req, res) => {
    try {
        const userId = req.session.user?.dbId || 1;
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

                // Return results directly — no DB persistence
            const results = scanResult.vulnerabilities;
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
app.post('/api/security/scan/repo', async (req, res) => {
    try {
        const userId = req.session.user?.dbId || 1;
        const { owner, repo, ref, options = {} } = req.body;
        if (!owner || !repo) return res.status(400).json({ error: 'Missing owner or repo' });

        const repoFull = `${owner}/${repo}`;
        const token = req.session.githubToken || process.env.GITHUB_TOKEN || null;

        const scanResult = await securityScannerFull.scanRepository(repoFull, token, ref || null, options);
        if (!scanResult) {
            return res.status(500).json({ error: 'Scan failed — check server logs.' });
        }

        // Return results directly — no DB persistence
        io.emit('security_update', { type: 'SCAN_COMPLETED', repository: repoFull });

        res.json({
            success: true,
            repository: repoFull,
            risk_score: scanResult.risk_score,
            risk_level: scanResult.risk_level,
            security_metrics: scanResult.security_metrics,
            engine: scanResult.engine,
            results: scanResult.vulnerabilities
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/security/insights', async (req, res) => {
    try {
        const userId = req.session.user?.dbId || 1;
        const { repository } = req.query;
        const vulnerabilities = await securityService.getVulnerabilities(repository, userId);
        
        if (!vulnerabilities || vulnerabilities.length === 0) {
            return res.json({ insight: "No vulnerabilities detected. Posture is clean." });
        }
        if (!process.env.GEMINI_API_KEY) return res.json({ insight: "Connect Gemini for AI analysis." });

        const prompt = `SecOps Analysis for ${repository}: ${JSON.stringify(vulnerabilities.slice(0, 5))}`;
        const result = await model.generateContent(prompt);
        res.json({ insight: (await result.response).text() });
    } catch (error) {
        res.status(500).json({ insight: "Insight generation failed." });
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
        const userId = req.session.user?.dbId || 1;
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
        const userId = req.session.user?.dbId || 1;
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
        const userId = req.session.user?.dbId || 1;
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
        const userId = req.session.user?.dbId || 1;
        const { repository } = req.query;
        const history = await securityService.getScanHistory(repository || null, userId);
        res.json(history);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/security/scan/full — run all scanners
app.post('/api/security/scan/full', async (req, res) => {
    try {
        const userId = req.session.user?.dbId || 1;
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
        const userId = req.session.user?.dbId || 1;
        const { repository, limit } = req.query;
        const runs = await webhookService.getRecentWorkflowRuns(limit || 20, repository, userId);
        res.json(runs);
    } catch (error) {
        res.status(500).json([]);
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
        const sqlite3 = require('sqlite3').verbose();
        const dbPath = process.env.DATABASE_PATH || './devops.sqlite';
        const db = new sqlite3.Database(dbPath);
        db.all('SELECT * FROM deployments ORDER BY start_time DESC LIMIT 20', [], (err, rows) => {
            db.close();
            if (err) return res.json({ deployments: [], total: 0 });
            res.json({ deployments: rows || [], total: rows?.length || 0 });
        });
    } catch {
        res.json({ deployments: [], total: 0 });
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
        const dbPath = process.env.DATABASE_PATH || './devops.sqlite';
        console.log('\n🔍 Validating environment variables...');

        // Initialize database
        await initializeDatabase(dbPath);

        // Start server
        server.listen(PORT, () => {
            console.log(`\n🚀 DevOps Platform (Supabase + GitHub) running on http://localhost:${PORT}`);
            console.log(`📊 Pipeline Monitoring: Active`);
            console.log(`📡 Real-time Streaming: Active`);
            console.log(`🔗 Webhook Endpoint: POST http://localhost:${PORT}/api/github/webhook`);
            console.log(`✅ Webhook endpoint ready at /api/github/webhook`);
            console.log(`✅ Using DATABASE_PATH: ${dbPath}`);
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

// Start the server
startServer();

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down gracefully...');
    try {
        if (typeof analytics !== 'undefined' && analytics.close) analytics.close();
        if (typeof webhookService !== 'undefined' && webhookService.close) webhookService.close();
    } catch (err) {
        console.error('Error during database closure:', err);
    }
    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
});
