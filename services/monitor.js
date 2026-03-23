/**
 * Uptime Monitor Service
 * Runs as a background process on the server — independent of any user session.
 * Polls all registered sites every 60 seconds, stores results, sends email on down/recovery.
 */

const cron = require('node-cron');
const nodemailer = require('nodemailer');
const db = require('./database');

// ── Email transporter (Gmail SMTP — free forever) ─────────────────────────────
let transporter = null;
function getTransporter() {
    if (transporter) return transporter;
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
    transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    return transporter;
}

async function sendAlert(to, subject, html) {
    const t = getTransporter();
    if (!t || !to) return;
    try {
        await t.sendMail({ from: `"PipelineXR Monitor" <${process.env.SMTP_USER}>`, to, subject, html });
        console.log(`[MONITOR] Alert sent to ${to}: ${subject}`);
    } catch (e) {
        console.error('[MONITOR] Email failed:', e.message);
    }
}

// ── DB helpers ────────────────────────────────────────────────────────────────
function dbAll(sql, params = []) {
    return new Promise((res, rej) => db.all(sql, params, (e, rows) => e ? rej(e) : res(rows)));
}
function dbRun(sql, params = []) {
    return new Promise((res, rej) => db.run(sql, params, function(e) { e ? rej(e) : res(this); }));
}
function dbGet(sql, params = []) {
    return new Promise((res, rej) => db.get(sql, params, (e, row) => e ? rej(e) : res(row)));
}

// ── Core ping function ────────────────────────────────────────────────────────
async function pingUrl(url) {
    const start = Date.now();
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout
        const res = await fetch(url, {
            method: 'HEAD',
            signal: controller.signal,
            redirect: 'follow',
            headers: { 'User-Agent': 'PipelineXR-Monitor/1.0' },
        });
        clearTimeout(timeout);
        return {
            is_up: res.status < 500,
            status_code: res.status,
            response_time_ms: Date.now() - start,
            error: null,
        };
    } catch (e) {
        return {
            is_up: false,
            status_code: null,
            response_time_ms: Date.now() - start,
            error: e.name === 'AbortError' ? 'Timeout (10s)' : e.message,
        };
    }
}

// ── Check a single site and persist result ────────────────────────────────────
async function checkSite(site) {
    const result = await pingUrl(site.url);

    await dbRun(
        `INSERT INTO uptime_checks (site_id, is_up, status_code, response_time_ms, error, checked_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))`,
        [site.id, result.is_up ? 1 : 0, result.status_code, result.response_time_ms, result.error]
    );

    const wasUp = site.is_up !== 0; // current DB state before this check
    const nowUp = result.is_up;

    // Transition: UP → DOWN
    if (wasUp && !nowUp) {
        await dbRun(`UPDATE monitored_sites SET is_up=0, last_checked=datetime('now'), consecutive_failures=consecutive_failures+1 WHERE id=?`, [site.id]);
        await dbRun(
            `INSERT INTO uptime_incidents (site_id, started_at, type) VALUES (?, datetime('now'), 'outage')`,
            [site.id]
        );
        // Send alert
        if (site.alert_email) {
            await sendAlert(
                site.alert_email,
                `🔴 Site Down: ${site.url}`,
                `<h2>Your site is DOWN</h2><p><b>${site.url}</b> is not responding.</p><p>Error: ${result.error || `HTTP ${result.status_code}`}</p><p>Detected at: ${new Date().toUTCString()}</p><br><p>— PipelineXR Monitor</p>`
            );
        }
        console.log(`[MONITOR] ⬇ DOWN: ${site.url} (${result.error || result.status_code})`);
    }
    // Transition: DOWN → UP (recovery)
    else if (!wasUp && nowUp) {
        await dbRun(`UPDATE monitored_sites SET is_up=1, last_checked=datetime('now'), consecutive_failures=0 WHERE id=?`, [site.id]);
        // Close open incident
        await dbRun(
            `UPDATE uptime_incidents SET resolved_at=datetime('now') WHERE site_id=? AND resolved_at IS NULL`,
            [site.id]
        );
        if (site.alert_email) {
            await sendAlert(
                site.alert_email,
                `✅ Site Recovered: ${site.url}`,
                `<h2>Your site is back UP</h2><p><b>${site.url}</b> is responding again.</p><p>Response time: ${result.response_time_ms}ms</p><p>Recovered at: ${new Date().toUTCString()}</p><br><p>— PipelineXR Monitor</p>`
            );
        }
        console.log(`[MONITOR] ⬆ UP: ${site.url} (${result.response_time_ms}ms)`);
    }
    // No transition — just update last_checked
    else {
        await dbRun(
            `UPDATE monitored_sites SET last_checked=datetime('now'), is_up=?, consecutive_failures=CASE WHEN ? THEN 0 ELSE consecutive_failures+1 END WHERE id=?`,
            [nowUp ? 1 : 0, nowUp ? 1 : 0, site.id]
        );
    }
}

// ── Main poll loop ────────────────────────────────────────────────────────────
async function runChecks() {
    try {
        const sites = await dbAll(`SELECT * FROM monitored_sites WHERE active=1`);
        if (!sites.length) return;
        console.log(`[MONITOR] Checking ${sites.length} site(s)...`);
        // Run all checks in parallel (safe at this scale)
        await Promise.allSettled(sites.map(checkSite));
    } catch (e) {
        console.error('[MONITOR] Poll error:', e.message);
    }
}

// ── Start the background cron (every 60 seconds) ─────────────────────────────
function startMonitor() {
    console.log('[MONITOR] Background uptime monitor started (60s interval)');
    // Run immediately on start, then every minute
    runChecks();
    cron.schedule('* * * * *', runChecks);
}

// ── Public API used by server routes ─────────────────────────────────────────

async function addSite(userId, url, alertEmail, isAdmin) {
    if (!isAdmin) {
        // Regular users: max 1 site
        const existing = await dbGet(`SELECT id FROM monitored_sites WHERE user_id=? AND active=1`, [userId]);
        if (existing) {
            throw new Error('Free plan allows monitoring 1 site only. Remove the existing site to add a new one.');
        }
    }

    // Normalise URL
    if (!url.startsWith('http')) url = 'https://' + url;

    const result = await dbRun(
        `INSERT INTO monitored_sites (user_id, url, alert_email, is_up, active, added_at, last_checked, consecutive_failures)
         VALUES (?, ?, ?, 1, 1, datetime('now'), NULL, 0)`,
        [userId, url, alertEmail || null]
    );
    return { id: result.lastID, url };
}

async function removeSite(userId, siteId, isAdmin) {
    const where = isAdmin ? `id=?` : `id=? AND user_id=?`;
    const params = isAdmin ? [siteId] : [siteId, userId];
    await dbRun(`UPDATE monitored_sites SET active=0 WHERE ${where}`, params);
}

async function getSites(userId, isAdmin) {
    const sql = isAdmin
        ? `SELECT * FROM monitored_sites WHERE active=1 ORDER BY added_at DESC`
        : `SELECT * FROM monitored_sites WHERE user_id=? AND active=1 ORDER BY added_at DESC`;
    return dbAll(sql, isAdmin ? [] : [userId]);
}

async function getChecks(siteId, hours = 24) {
    return dbAll(
        `SELECT * FROM uptime_checks WHERE site_id=? AND checked_at >= datetime('now', '-' || ? || ' hours') ORDER BY checked_at ASC`,
        [siteId, hours]
    );
}

async function getStats(siteId, hours = 24) {
    const row = await dbGet(
        `SELECT
            COUNT(*) as total,
            SUM(is_up) as up_count,
            AVG(response_time_ms) as avg_response,
            MIN(response_time_ms) as min_response,
            MAX(response_time_ms) as max_response
         FROM uptime_checks
         WHERE site_id=? AND checked_at >= datetime('now', '-' || ? || ' hours')`,
        [siteId, hours]
    );
    const uptime = row?.total > 0 ? Math.round((row.up_count / row.total) * 1000) / 10 : null;
    return { ...row, uptime_pct: uptime };
}

async function getIncidents(siteId, limit = 20) {
    return dbAll(
        `SELECT * FROM uptime_incidents WHERE site_id=? ORDER BY started_at DESC LIMIT ?`,
        [siteId, limit]
    );
}

module.exports = { startMonitor, addSite, removeSite, getSites, getChecks, getStats, getIncidents };
