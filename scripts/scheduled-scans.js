'use strict';

/**
 * scripts/scheduled-scans.js
 *
 * Scheduled security scanner — alternative to scan-repos.js.
 * Queries repositories with activity in the last N days, scans each one
 * with the full Trivy pipeline (CLI → Docker → TrivyLite), and persists
 * results to scan_results and vulnerabilities tables.
 *
 * Run manually:   node scripts/scheduled-scans.js
 * Railway cron:   "0 *\/6 * * *"  (see railway.json)
 */

require('dotenv').config();

const db              = require('../services/database');
const { scanRepository } = require('../services/security/securityScanner');
const securityService = require('../services/securityService');

const BATCH_SIZE    = parseInt(process.env.SCAN_BATCH_SIZE || '3', 10);
const LOOKBACK_DAYS = parseInt(process.env.SCAN_LOOKBACK_DAYS || '30', 10);

// ── Fetch repos with activity in the last N days ──────────────────────────────
async function getRecentlyActiveRepos(days = 30) {
    return new Promise((resolve, reject) => {
        db.all(
            `SELECT DISTINCT repository, user_id FROM workflow_runs
             WHERE repository IS NOT NULL
               AND created_at >= NOW() - ($1 * INTERVAL '1 day')
             ORDER BY repository`,
            [days],
            (err, rows) => (err ? reject(err) : resolve(rows || []))
        );
    });
}

// ── Insert a row into scan_results ────────────────────────────────────────────
async function insertScanResult(repository, userId, result) {
    const metrics  = result?.security_metrics || {};
    const status   = result ? 'completed' : 'failed';
    const metadata = result ? JSON.stringify({
        engine:     result.engine,
        risk_score: result.risk_score,
        risk_level: result.risk_level,
    }) : null;

    return new Promise((resolve) => {
        db.run(
            `INSERT INTO scan_results
             (user_id, repository, scan_type, status, findings_count,
              critical_count, high_count, medium_count, low_count,
              scan_metadata, started_at, completed_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
            [
                userId || null,
                repository,
                result?.engine || 'unknown',
                status,
                (result?.vulnerabilities || []).length,
                metrics.critical || 0,
                metrics.high     || 0,
                metrics.medium   || 0,
                metrics.low      || 0,
                metadata,
            ],
            function (err) {
                if (err) console.warn(`[scheduled-scans] scan_results insert failed for ${repository}:`, err.message);
                resolve(this?.lastID || null);
            }
        );
    });
}

// ── Persist individual vulnerability findings ─────────────────────────────────
async function persistFindings(repository, userId, vulns) {
    for (const v of vulns) {
        try {
            await securityService.addVulnerability(
                userId || null,
                repository,
                v.scanner || (v.type === 'secret' ? 'trivy:secret' : v.type === 'misconfiguration' ? 'trivy:config' : 'trivy:vuln'),
                v.id || v.cve_id || null,
                v.package_name || null,
                (v.severity || 'low').toLowerCase(),
                v.description || v.title || null,
                v.primary_url || null,
                v.installed_version || null,
                v.fixed_version || null,
                v.primary_url || null
            );
        } catch (_) { /* skip duplicates */ }
    }
}

// ── Scan one repo and persist results ─────────────────────────────────────────
async function scanAndPersist(repo, token) {
    const { repository, user_id } = repo;
    console.log(`[scheduled-scans] Scanning ${repository}...`);

    let result = null;
    try {
        result = await scanRepository(repository, token);
        if (!result) {
            console.warn(`[scheduled-scans] Scan returned null for ${repository}`);
        }
    } catch (err) {
        console.error(`[scheduled-scans] Scan error for ${repository}:`, err.message);
    }

    // Always write a scan_results row (success or failure)
    await insertScanResult(repository, user_id, result);

    if (result) {
        await persistFindings(repository, user_id, result.vulnerabilities || []);
        console.log(
            `[scheduled-scans] ✓ ${repository} — engine: ${result.engine}, ` +
            `risk: ${result.risk_level} (${result.risk_score}), ` +
            `findings: ${(result.vulnerabilities || []).length}`
        );
        return true;
    }

    return false;
}

// ── Chunk array into batches ──────────────────────────────────────────────────
function chunk(arr, size) {
    const batches = [];
    for (let i = 0; i < arr.length; i += size) {
        batches.push(arr.slice(i, i + size));
    }
    return batches;
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
    console.log(`[scheduled-scans] Starting — ${new Date().toISOString()}`);
    console.log(`[scheduled-scans] Lookback: ${LOOKBACK_DAYS} days, batch size: ${BATCH_SIZE}`);

    const token = process.env.GITHUB_TOKEN || null;
    if (!token) console.warn('[scheduled-scans] GITHUB_TOKEN not set — private repos will be skipped');

    let repos;
    try {
        repos = await getRecentlyActiveRepos(LOOKBACK_DAYS);
    } catch (err) {
        console.error('[scheduled-scans] Failed to fetch repos:', err.message);
        process.exit(1);
    }

    if (!repos.length) {
        console.log('[scheduled-scans] No recently active repositories found');
        process.exit(0);
    }

    console.log(`[scheduled-scans] Found ${repos.length} repo(s) to scan`);

    let scanned = 0;
    let failed  = 0;

    for (const batch of chunk(repos, BATCH_SIZE)) {
        const results = await Promise.all(
            batch.map(repo => scanAndPersist(repo, token).catch(err => {
                console.error(`[scheduled-scans] Unexpected error for ${repo.repository}:`, err.message);
                return false;
            }))
        );
        scanned += results.filter(Boolean).length;
        failed  += results.filter(r => !r).length;
    }

    console.log(`[scheduled-scans] Done — ${scanned} scanned, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
})();

module.exports = { getRecentlyActiveRepos, scanAndPersist, chunk };
