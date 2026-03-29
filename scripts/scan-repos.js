/**
 * scripts/scan-repos.js
 *
 * Scheduled security scanner — runs every 6 hours via Railway cron.
 * Fetches all distinct repositories from workflow_runs, scans each one
 * with the full Trivy pipeline (CLI → Docker → TrivyLite), and persists
 * results to the database.
 *
 * Run manually:   node scripts/scan-repos.js
 * Railway cron:   "0 *\/6 * * *"  (see railway.json)
 */

'use strict';

require('dotenv').config();

const db = require('../services/database');
const { scanRepository } = require('../services/security/securityScanner');
const securityService = require('../services/securityService');

// ── Fetch all unique repos that have been synced into workflow_runs ───────────
async function getAllRepos() {
    return new Promise((resolve, reject) => {
        db.all(
            `SELECT DISTINCT repository, user_id FROM workflow_runs
             WHERE repository IS NOT NULL
             ORDER BY repository`,
            [],
            (err, rows) => (err ? reject(err) : resolve(rows || []))
        );
    });
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
    console.log(`[scan-repos] Starting scheduled scan — ${new Date().toISOString()}`);

    const token = process.env.GITHUB_TOKEN || null;
    if (!token) {
        console.warn('[scan-repos] GITHUB_TOKEN not set — private repos will be skipped');
    }

    let repos;
    try {
        repos = await getAllRepos();
    } catch (err) {
        console.error('[scan-repos] Failed to fetch repos from DB:', err.message);
        process.exit(1);
    }

    if (!repos.length) {
        console.log('[scan-repos] No repositories found — nothing to scan');
        process.exit(0);
    }

    console.log(`[scan-repos] Found ${repos.length} repo(s) to scan`);

    let scanned = 0;
    let failed  = 0;

    for (const { repository, user_id } of repos) {
        console.log(`[scan-repos] Scanning ${repository}...`);
        try {
            const result = await scanRepository(repository, token);
            if (!result) {
                console.warn(`[scan-repos] Scan returned null for ${repository} — skipping`);
                failed++;
                continue;
            }

            // Persist vulnerabilities to DB
            const vulns = result.vulnerabilities || [];
            for (const v of vulns) {
                try {
                    await securityService.addVulnerability(
                        user_id,
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

            console.log(
                `[scan-repos] ✓ ${repository} — engine: ${result.engine}, ` +
                `risk: ${result.risk_level} (${result.risk_score}), ` +
                `vulns: ${vulns.length}`
            );
            scanned++;
        } catch (err) {
            console.error(`[scan-repos] ✗ Failed to scan ${repository}:`, err.message);
            failed++;
        }
    }

    console.log(`[scan-repos] Done — ${scanned} scanned, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
})();
