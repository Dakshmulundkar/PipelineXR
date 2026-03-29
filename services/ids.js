/**
 * Intrusion Detection Service (IDS)
 * Monitors request patterns, detects anomalies, logs suspicious activity.
 * Works alongside Cloudflare's network-level DDoS protection.
 */

'use strict';

const db = require('./database');

// ── In-memory sliding window counters ────────────────────────────────────────
// Key: ip — Value: { count, windowStart, blocked, violations }
const ipWindows = new Map();
const WINDOW_MS   = 60 * 1000;   // 1-minute window
const WARN_THRESH = 120;          // warn after 120 req/min
const BLOCK_THRESH = 300;         // block after 300 req/min (likely bot/DDoS)
const BLOCK_DURATION = 10 * 60 * 1000; // block for 10 minutes

// Cleanup stale entries every 5 min
setInterval(() => {
    const now = Date.now();
    for (const [ip, w] of ipWindows.entries()) {
        const isExpiredBlock = w.blocked && (now - w.blockedAt > BLOCK_DURATION);
        const isStaleWindow = !w.blocked && (now - w.windowStart > WINDOW_MS * 10);
        if (isExpiredBlock || isStaleWindow) ipWindows.delete(ip);
    }
}, 5 * 60 * 1000);

// ── Anomaly log (in-memory ring buffer, last 500 events) ─────────────────────
const MAX_EVENTS = 500;
const anomalyLog = [];

function logAnomaly(type, ip, detail = '') {
    const event = { type, ip, detail, timestamp: new Date().toISOString() };
    anomalyLog.push(event);
    if (anomalyLog.length > MAX_EVENTS) anomalyLog.shift();
    console.warn(`[IDS] ${type} — IP: ${ip} — ${detail}`);

    // Persist to DB (non-blocking, best-effort)
    db.run(
        `INSERT INTO ids_events (type, ip, detail, timestamp) VALUES (?, ?, ?, NOW())`,
        [type, ip, detail],
        () => {}
    );
}

// ── Core middleware ───────────────────────────────────────────────────────────
function idsMiddleware(req, res, next) {
    // Skip static asset requests — no security value in tracking them
    const path = req.path || '';
    if (path.startsWith('/assets/') || path.endsWith('.js') || path.endsWith('.css') ||
        path.endsWith('.svg') || path.endsWith('.png') || path.endsWith('.ico') ||
        path === '/health' || path === '/robots.txt') {
        return next();
    }

    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const now = Date.now();

    let w = ipWindows.get(ip);
    if (!w) {
        w = { count: 0, windowStart: now, blocked: false, blockedAt: 0, violations: 0 };
        ipWindows.set(ip, w);
    }

    // Reset window if expired
    if (now - w.windowStart > WINDOW_MS) {
        w.count = 0;
        w.windowStart = now;
    }

    w.count++;

    // Check if currently blocked
    if (w.blocked) {
        if (now - w.blockedAt < BLOCK_DURATION) {
            res.setHeader('Retry-After', '600');
            return res.status(429).json({ error: 'Too many requests — your IP has been temporarily blocked.' });
        }
        // Unblock after duration
        w.blocked = false;
        w.violations = 0;
    }

    // Detect anomalies
    if (w.count >= BLOCK_THRESH) {
        w.blocked = true;
        w.blockedAt = now;
        w.violations++;
        logAnomaly('BLOCK', ip, `${w.count} req/min — DDoS threshold exceeded`);
        res.setHeader('Retry-After', '600');
        return res.status(429).json({ error: 'Too many requests — your IP has been temporarily blocked.' });
    }

    if (w.count === WARN_THRESH) {
        w.violations++;
        logAnomaly('WARN', ip, `${w.count} req/min — high request rate`);
    }

    // Detect suspicious patterns
    const ua = req.headers['user-agent'] || '';

    // Missing User-Agent (common in bots/scanners)
    if (!ua && req.method !== 'OPTIONS') {
        logAnomaly('SUSPICIOUS', ip, `Missing User-Agent on ${req.method} ${path}`);
    }

    // Path traversal attempt
    if (path.includes('../') || path.includes('..\\') || path.includes('%2e%2e')) {
        logAnomaly('PATH_TRAVERSAL', ip, `Attempted path traversal: ${path}`);
        return res.status(400).json({ error: 'Bad request' });
    }

    // Common scanner/exploit paths
    const scannerPaths = ['/wp-admin', '/wp-login', '/.env', '/phpinfo', '/admin.php', '/shell.php', '/config.php', '/.git/config', '/actuator', '/api/v1/pods'];
    if (scannerPaths.some(p => path.toLowerCase().startsWith(p))) {
        logAnomaly('SCANNER', ip, `Scanner probe: ${path}`);
        return res.status(404).json({ error: 'Not found' });
    }

    next();
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Get recent anomaly events (in-memory) */
function getRecentEvents(limit = 100) {
    return anomalyLog.slice(-limit).reverse();
}

/** Get current blocked IPs */
function getBlockedIPs() {
    const now = Date.now();
    const blocked = [];
    for (const [ip, w] of ipWindows.entries()) {
        if (w.blocked && now - w.blockedAt < BLOCK_DURATION) {
            blocked.push({
                ip,
                blockedAt: new Date(w.blockedAt).toISOString(),
                expiresAt: new Date(w.blockedAt + BLOCK_DURATION).toISOString(),
                violations: w.violations,
            });
        }
    }
    return blocked;
}

/** Get per-IP request rate stats (top 20 by count) */
function getTrafficStats() {
    const stats = [];
    for (const [ip, w] of ipWindows.entries()) {
        stats.push({ ip, count: w.count, violations: w.violations, blocked: w.blocked });
    }
    return stats.sort((a, b) => b.count - a.count).slice(0, 20);
}

/** Manually unblock an IP (admin action) */
function unblockIP(ip) {
    const w = ipWindows.get(ip);
    if (w) { w.blocked = false; w.violations = 0; }
}

module.exports = { idsMiddleware, getRecentEvents, getBlockedIPs, getTrafficStats, unblockIP };
