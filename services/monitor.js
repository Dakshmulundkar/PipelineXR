/**
 * Uptime Monitor Service — PostgreSQL (Neon) version
 */
const cron = require('node-cron');
const crypto = require('crypto');
const db = require('./database');

// ── Email via Resend (free tier: 3000 emails/month) ───────────────────────────
let resendClient = null;
function getResend() {
    if (resendClient) return resendClient;
    if (!process.env.RESEND_API_KEY) return null;
    const { Resend } = require('resend');
    resendClient = new Resend(process.env.RESEND_API_KEY);
    return resendClient;
}

async function sendEmail(to, subject, html) {
    const resend = getResend();
    if (!resend || !to) return;
    try {
        await resend.emails.send({
            from: process.env.RESEND_FROM || 'PipelineXR <onboarding@resend.dev>',
            to,
            subject,
            html,
        });
        console.log(`[MONITOR] Email sent to ${to}: ${subject}`);
    } catch (e) {
        console.error('[MONITOR] Email failed:', e.message);
    }
}

function dbAll(sql, params = []) {
    return new Promise((res, rej) => db.all(sql, params, (e, rows) => e ? rej(e) : res(rows)));
}
function dbRun(sql, params = []) {
    return new Promise((res, rej) => db.run(sql, params, function(e) { e ? rej(e) : res(this); }));
}
function dbGet(sql, params = []) {
    return new Promise((res, rej) => db.get(sql, params, (e, row) => e ? rej(e) : res(row)));
}

async function pingUrl(url) {
    const start = Date.now();
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        const res = await fetch(url, {
            method: 'HEAD', signal: controller.signal, redirect: 'follow',
            headers: { 'User-Agent': 'PipelineXR-Monitor/1.0' },
        });
        clearTimeout(timeout);
        return { is_up: res.status < 500, status_code: res.status, response_time_ms: Date.now() - start, error: null };
    } catch (e) {
        return { is_up: false, status_code: null, response_time_ms: Date.now() - start, error: e.name === 'AbortError' ? 'Timeout (10s)' : e.message };
    }
}

async function checkSite(site) {
    const result = await pingUrl(site.url);

    await dbRun(
        `INSERT INTO uptime_checks (site_id, is_up, status_code, response_time_ms, error, checked_at) VALUES (?, ?, ?, ?, ?, NOW())`,
        [site.id, result.is_up ? 1 : 0, result.status_code, result.response_time_ms, result.error]
    );

    const wasUp = site.is_up !== 0;
    const nowUp = result.is_up;

    if (wasUp && !nowUp) {
        await dbRun(`UPDATE monitored_sites SET is_up=0, last_checked=NOW(), consecutive_failures=consecutive_failures+1 WHERE id=?`, [site.id]);
        await dbRun(`INSERT INTO uptime_incidents (site_id, started_at, type) VALUES (?, NOW(), 'outage')`, [site.id]);
        if (site.alert_email) {
            await sendEmail(site.alert_email, `🔴 Site Down: ${site.url}`,
                `<h2>Your site is DOWN</h2><p><b>${site.url}</b> is not responding.</p><p>Error: ${site.error || `HTTP ${site.status_code}`}</p><p>Detected at: ${new Date().toUTCString()}</p><br><p>— PipelineXR Monitor</p>`);
        }
        console.log(`[MONITOR] ⬇ DOWN: ${site.url}`);
    } else if (!wasUp && nowUp) {
        await dbRun(`UPDATE monitored_sites SET is_up=1, last_checked=NOW(), consecutive_failures=0 WHERE id=?`, [site.id]);
        await dbRun(`UPDATE uptime_incidents SET resolved_at=NOW() WHERE site_id=? AND resolved_at IS NULL`, [site.id]);
        if (site.alert_email) {
            await sendEmail(site.alert_email, `✅ Site Recovered: ${site.url}`,
                `<h2>Your site is back UP</h2><p><b>${site.url}</b> is responding again.</p><p>Response time: ${result.response_time_ms}ms</p><p>Recovered at: ${new Date().toUTCString()}</p><br><p>— PipelineXR Monitor</p>`);
        }
        console.log(`[MONITOR] ⬆ UP: ${site.url} (${result.response_time_ms}ms)`);
    } else {
        await dbRun(
            `UPDATE monitored_sites SET last_checked=NOW(), is_up=?, consecutive_failures=CASE WHEN ? THEN 0 ELSE consecutive_failures+1 END WHERE id=?`,
            [nowUp ? 1 : 0, nowUp ? 1 : 0, site.id]
        );
    }
}

async function runChecks() {
    try {
        const sites = await dbAll(`SELECT * FROM monitored_sites WHERE active=1`);
        if (!sites.length) return;
        console.log(`[MONITOR] Checking ${sites.length} site(s)...`);
        await Promise.allSettled(sites.map(checkSite));
    } catch (e) {
        console.error('[MONITOR] Poll error:', e.message);
    }
}

function startMonitor() {
    console.log('[MONITOR] Background uptime monitor started (60s interval)');
    runChecks();
    cron.schedule('* * * * *', runChecks);
}

// ── Email verification for site monitoring ────────────────────────────────────

/**
 * Generate a 6-digit code, store it in DB, and email it to the user.
 * The code is tied to (userId, email, url) and expires in 10 minutes.
 */
async function sendVerificationCode(userId, email, url) {
    if (!getResend()) throw new Error('Email sending is not configured. Set RESEND_API_KEY in your environment.');

    // Clean up any previous unused codes for this user+email+url
    await dbRun(
        `DELETE FROM monitor_verifications WHERE user_id=? AND email=? AND url=?`,
        [userId, email, url]
    );

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await dbRun(
        `INSERT INTO monitor_verifications (user_id, email, url, code, expires_at) VALUES (?, ?, ?, ?, ?)`,
        [userId, email, url, code, expiresAt]
    );

    await sendEmail(email, `Your PipelineXR verification code: ${code}`, `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
            <h2 style="color:#111">Verify your monitoring email</h2>
            <p>You requested to monitor <strong>${url}</strong>.</p>
            <p>Enter this code in PipelineXR to confirm:</p>
            <div style="font-size:36px;font-weight:800;letter-spacing:8px;color:#3B82F6;padding:20px 0">${code}</div>
            <p style="color:#888;font-size:13px">This code expires in 10 minutes. If you didn't request this, ignore this email.</p>
            <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
            <p style="color:#aaa;font-size:11px">PipelineXR — DevOps Observability</p>
        </div>
    `);

    console.log(`[MONITOR] Verification code sent to ${email} for ${url}`);
}

/**
 * Verify the code the user entered. Returns true if valid, throws if not.
 * Marks the code as used on success so it can't be reused.
 */
async function verifyCode(userId, email, url, code) {
    const row = await dbGet(
        `SELECT * FROM monitor_verifications
         WHERE user_id=? AND email=? AND url=? AND used=FALSE
         ORDER BY created_at DESC LIMIT 1`,
        [userId, email, url]
    );

    if (!row) throw new Error('No verification code found. Please request a new one.');
    if (new Date(row.expires_at) < new Date()) throw new Error('Verification code has expired. Please request a new one.');
    if (row.code !== code.trim()) throw new Error('Incorrect verification code.');

    // Mark as used
    await dbRun(`UPDATE monitor_verifications SET used=TRUE WHERE id=?`, [row.id]);
    return true;
}

async function addSite(userId, url, alertEmail, isAdmin) {
    if (!isAdmin) {
        const existing = await dbGet(`SELECT id FROM monitored_sites WHERE user_id=? AND active=1`, [userId]);
        if (existing) throw new Error('Free plan allows monitoring 1 site only. Remove the existing site to add a new one.');
    }

    // Email is required for non-admin users
    if (!isAdmin && (!alertEmail || !alertEmail.trim())) throw new Error('Alert email is required to add a site.');

    if (!url.startsWith('http')) url = 'https://' + url;

    // Validate URL — block SSRF vectors
    let parsed;
    try { parsed = new URL(url); } catch { throw new Error('Invalid URL format'); }
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Only HTTP/HTTPS URLs are allowed');
    const host = parsed.hostname.toLowerCase();
    const ssrfBlocked = ['localhost', '127.0.0.1', '0.0.0.0', '::1', '169.254.169.254', 'metadata.google.internal'];
    if (ssrfBlocked.includes(host) || host.startsWith('192.168.') || host.startsWith('10.') ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(host)) {
        throw new Error('Private/internal URLs are not allowed');
    }

    // Live reachability check
    const probe = await pingUrl(url);
    if (!probe.is_up && probe.error && (
        probe.error.includes('ENOTFOUND') ||
        probe.error.includes('ECONNREFUSED') ||
        probe.error.includes('getaddrinfo') ||
        probe.error.includes('ERR_NAME_NOT_RESOLVED')
    )) {
        throw new Error(`Site does not exist or is unreachable: ${probe.error}`);
    }

    // Insert and return the new row
    return new Promise((resolve, reject) => {
        db.get(
            `INSERT INTO monitored_sites (user_id, url, alert_email, is_up, active, added_at, consecutive_failures, last_checked)
             VALUES (?, ?, ?, ?, 1, NOW(), ?, NOW()) RETURNING id, url, is_up`,
            [userId, url, alertEmail.trim(), probe.is_up ? 1 : 0, probe.is_up ? 0 : 1],
            async (err, row) => {
                if (err) return reject(err);
                const siteId = row?.id;
                if (siteId) {
                    try {
                        await dbRun(
                            `INSERT INTO uptime_checks (site_id, is_up, status_code, response_time_ms, error, checked_at) VALUES (?, ?, ?, ?, ?, NOW())`,
                            [siteId, probe.is_up ? 1 : 0, probe.status_code, probe.response_time_ms, probe.error]
                        );
                        if (!probe.is_up) {
                            await dbRun(
                                `INSERT INTO uptime_incidents (site_id, started_at, type) VALUES (?, NOW(), 'outage')`,
                                [siteId]
                            );
                        }
                    } catch (_) { /* non-fatal */ }
                }
                resolve(row || { url, is_up: probe.is_up ? 1 : 0 });
            }
        );
    });
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
        `SELECT * FROM uptime_checks WHERE site_id=? AND checked_at >= NOW() - (? * INTERVAL '1 hour') ORDER BY checked_at ASC`,
        [siteId, hours]
    );
}

async function getStats(siteId, hours = 24) {
    const row = await dbGet(
        `SELECT COUNT(*) as total, SUM(CASE WHEN is_up = 1 THEN 1 ELSE 0 END) as up_count,
            AVG(response_time_ms) as avg_response,
            MIN(CASE WHEN is_up = 1 THEN response_time_ms END) as min_response,
            MAX(response_time_ms) as max_response
         FROM uptime_checks WHERE site_id=? AND checked_at >= NOW() - (? * INTERVAL '1 hour')`,
        [siteId, hours]
    );
    const total = parseInt(row?.total) || 0;
    const upCount = parseInt(row?.up_count) || 0;
    const uptime = total > 0 ? Math.round((upCount / total) * 1000) / 10 : null;
    return {
        total,
        up_count: upCount,
        avg_response: row?.avg_response != null ? parseFloat(row.avg_response) : null,
        min_response: row?.min_response != null ? parseInt(row.min_response) : null,
        max_response: row?.max_response != null ? parseInt(row.max_response) : null,
        uptime_pct: uptime,
    };
}

async function getIncidents(siteId, limit = 20) {
    return dbAll(
        `SELECT * FROM uptime_incidents WHERE site_id=? ORDER BY started_at DESC LIMIT ?`,
        [siteId, limit]
    );
}

module.exports = { startMonitor, addSite, removeSite, getSites, getChecks, getStats, getIncidents, sendVerificationCode, verifyCode };
