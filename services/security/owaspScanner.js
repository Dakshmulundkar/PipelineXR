'use strict';

/**
 * owaspScanner.js
 *
 * OWASP ZAP scanner with passive header fallback.
 *
 * Engine priority:
 *   1. Official ZAP Docker image (ghcr.io/zaproxy/zaproxy:stable)
 *      Runs zap-baseline.py — spiders the target, passive scans all pages,
 *      outputs a JSON report. Finds XSS, missing headers, info disclosure, etc.
 *      Requires Docker daemon. NOT available on Railway (no Docker daemon).
 *
 *   2. Passive HTTP header scanner (built-in fallback)
 *      Pure Node.js fetch. Checks 11 OWASP-aligned security header rules.
 *      Same ZAP rule IDs. Works everywhere with no dependencies.
 *
 * Docker command used:
 *   docker run --rm \
 *     -v <workdir>:/zap/wrk/:rw \
 *     ghcr.io/zaproxy/zaproxy:stable \
 *     zap-baseline.py -t <url> -J report.json -m 1 -I -q
 *
 * ZAP JSON report structure (from official docs):
 *   { "site": [{ "alerts": [{ "pluginid", "alert", "name", "riskcode",
 *     "riskdesc", "desc", "solution", "reference", "cweid", "wascid",
 *     "count", "instances": [{ "uri", "method", "param", "evidence" }] }] }] }
 */

const { spawn, execFile } = require('child_process');
const fs   = require('fs');
const os   = require('os');
const path = require('path');
const util = require('util');

const execFileAsync = util.promisify(execFile);

// Official ZAP Docker image (GHCR — not Docker Hub, avoids supply chain issues)
const ZAP_IMAGE = 'ghcr.io/zaproxy/zaproxy:stable';

// ── Docker availability check ─────────────────────────────────────────────────

async function isDockerAvailable() {
    try {
        await execFileAsync('docker', ['info'], { timeout: 5000 });
        return true;
    } catch {
        return false;
    }
}

// ── ZAP Docker baseline scan ──────────────────────────────────────────────────

/**
 * Run ZAP baseline scan via Docker.
 *
 * Mounts a temp dir to /zap/wrk so ZAP can write report.json there.
 * ZAP exits 0 (no alerts), 1 (FAILs found), or 2 (WARNs found) — all valid.
 * Exit 3 means ZAP itself crashed.
 *
 * @param {string} targetUrl
 * @param {object} opts
 * @param {number} [opts.timeout=300000]   ms total timeout
 * @param {number} [opts.spiderMins=1]     minutes for ZAP spider
 * @returns {Promise<object>}  Parsed ZAP JSON report
 */
async function runZapScan(targetUrl, opts = {}) {
    const timeout    = opts.timeout    || 300_000;
    const spiderMins = opts.spiderMins || 1;

    const workDir    = fs.mkdtempSync(path.join(os.tmpdir(), 'zap-'));
    const reportFile = path.join(workDir, 'report.json');

    // Docker volume mount — normalise path for Windows
    const mountSrc = process.platform === 'win32'
        ? workDir.replace(/\\/g, '/')
        : workDir;

    // chmod 777 so ZAP (runs as uid 1000 inside container) can write to the dir
    try { fs.chmodSync(workDir, 0o777); } catch (_) {}

    const args = [
        'run', '--rm',
        '-v', `${mountSrc}:/zap/wrk/:rw`,
        ZAP_IMAGE,
        'zap-baseline.py',
        '-t', targetUrl,
        '-J', 'report.json',        // write JSON to /zap/wrk/report.json
        '-m', String(spiderMins),   // spider duration in minutes
        '-I',                       // don't fail on warnings (exit 0 on WARN)
        '-q',                       // quiet — suppress progress output
    ];

    console.log(`[OWASP] docker run ${ZAP_IMAGE} zap-baseline.py -t ${targetUrl} -J report.json -m ${spiderMins} -I -q`);

    return new Promise((resolve, reject) => {
        const proc = spawn('docker', args);
        let stderr = '';

        const timer = setTimeout(() => {
            proc.kill('SIGKILL');
            cleanup(workDir);
            reject(new Error(`ZAP scan timed out after ${timeout / 1000}s`));
        }, timeout);

        proc.stderr.on('data', d => { stderr += d; });

        proc.on('error', err => {
            clearTimeout(timer);
            cleanup(workDir);
            if (err.code === 'ENOENT') reject(new Error('Docker not found.'));
            else reject(new Error(`Docker spawn error: ${err.message}`));
        });

        proc.on('close', code => {
            clearTimeout(timer);

            // Exit codes: 0=clean, 1=FAIL alerts, 2=WARN alerts, 3=error
            if (code === 3) {
                cleanup(workDir);
                reject(new Error(`ZAP exited with error (code 3). stderr: ${stderr.slice(0, 400)}`));
                return;
            }

            if (!fs.existsSync(reportFile)) {
                cleanup(workDir);
                reject(new Error(`ZAP did not produce report.json (exit ${code}). stderr: ${stderr.slice(0, 400)}`));
                return;
            }

            try {
                const raw = fs.readFileSync(reportFile, 'utf8');
                cleanup(workDir);
                resolve(JSON.parse(raw));
            } catch (e) {
                cleanup(workDir);
                reject(new Error(`Failed to parse ZAP report.json: ${e.message}`));
            }
        });
    });
}

function cleanup(dir) {
    try { if (dir && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
}

// ── Parse ZAP JSON report → standard findings format ─────────────────────────

/**
 * ZAP riskcode → severity string
 * 3=High, 2=Medium, 1=Low, 0=Informational
 */
const RISK_MAP = { '3': 'HIGH', '2': 'MEDIUM', '1': 'LOW', '0': 'INFO' };

function parseZapReport(zapReport, targetUrl) {
    const findings = [];

    for (const site of (zapReport.site || [])) {
        for (const alert of (site.alerts || [])) {
            const severity  = RISK_MAP[String(alert.riskcode)] || 'INFO';
            const instances = alert.instances || [];

            // Build evidence from first 3 instances
            const evidence = instances
                .slice(0, 3)
                .map(i => [i.uri, i.param ? `param: ${i.param}` : null, i.evidence ? `evidence: ${i.evidence.slice(0, 80)}` : null]
                    .filter(Boolean).join(' | '))
                .filter(Boolean)
                .join('\n') || null;

            findings.push({
                id:          `ZAP-${alert.pluginid || alert.alertRef || 'UNKNOWN'}`,
                name:        alert.name || alert.alert || 'Unknown Alert',
                severity,
                description: stripHtml(alert.desc || ''),
                solution:    stripHtml(alert.solution || ''),
                evidence,
                reference:   alert.reference ? stripHtml(alert.reference).split('\n')[0].trim() : null,
                cwe_id:      alert.cweid && alert.cweid !== '0' ? `CWE-${alert.cweid}` : null,
                wasc_id:     alert.wascid && alert.wascid !== '0' ? `WASC-${alert.wascid}` : null,
                // ZAP returns count as a string
                count:       parseInt(alert.count, 10) || instances.length,
                url:         targetUrl,
            });
        }
    }

    // Sort: HIGH → MEDIUM → LOW → INFO
    const ORDER = { HIGH: 0, MEDIUM: 1, LOW: 2, INFO: 3 };
    findings.sort((a, b) => (ORDER[a.severity] ?? 4) - (ORDER[b.severity] ?? 4));

    return findings;
}

function stripHtml(str) {
    return (str || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
        .replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ')
        .trim();
}

// ── Passive header scanner (fallback) ────────────────────────────────────────

async function runPassiveScan(targetUrl) {
    let response;
    let headers = {};
    let fetchError = null;

    try {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 15000);
        response = await fetch(targetUrl, {
            method: 'GET',
            signal: controller.signal,
            redirect: 'follow',
            headers: { 'User-Agent': 'PipelineXR-Security-Scanner/1.0 (OWASP passive check)' },
        });
        response.headers.forEach((val, key) => { headers[key.toLowerCase()] = val; });
    } catch (e) {
        fetchError = e.name === 'AbortError' ? 'Request timed out after 15s' : e.message;
    }

    if (fetchError) return { findings: [], error: fetchError };

    const findings = [];
    const add = (id, name, severity, description, solution, evidence = null) =>
        findings.push({ id, name, severity, description, solution, evidence, url: targetUrl });

    if (targetUrl.startsWith('http://'))
        add('OWASP-A02-001', 'Site served over HTTP', 'HIGH',
            'All traffic is unencrypted and vulnerable to interception.',
            "Redirect all HTTP to HTTPS. Obtain a TLS certificate (free via Let's Encrypt).",
            `URL: ${targetUrl}`);

    const hsts = headers['strict-transport-security'];
    if (!hsts)
        add('ZAP-10035', 'Missing Strict-Transport-Security (HSTS)', 'HIGH',
            'Browsers will not enforce HTTPS, leaving users vulnerable to SSL stripping.',
            'Add: Strict-Transport-Security: max-age=31536000; includeSubDomains; preload');
    else if (!hsts.includes('includeSubDomains'))
        add('ZAP-10035-B', 'HSTS missing includeSubDomains', 'LOW',
            'HSTS is set but does not cover subdomains.',
            'Add includeSubDomains to your HSTS header.', `Current: ${hsts}`);

    const csp = headers['content-security-policy'];
    if (!csp)
        add('ZAP-10038', 'Missing Content-Security-Policy', 'MEDIUM',
            'No CSP header — browser has no restrictions on what scripts/resources can load, enabling XSS.',
            "Add: Content-Security-Policy: default-src 'self'");
    else {
        if (csp.includes("'unsafe-inline'"))
            add('ZAP-10038-B', "CSP allows 'unsafe-inline'", 'MEDIUM',
                "Inline scripts/styles are allowed, significantly weakening XSS protection.",
                "Remove 'unsafe-inline' and use nonces or hashes.", `CSP: ${csp.slice(0, 120)}`);
        if (csp.includes("'unsafe-eval'"))
            add('ZAP-10038-C', "CSP allows 'unsafe-eval'", 'MEDIUM',
                "eval() and similar functions are allowed, enabling code injection.",
                "Remove 'unsafe-eval' from your CSP.", `CSP: ${csp.slice(0, 120)}`);
    }

    const xfo = headers['x-frame-options'];
    if (!xfo && !(csp && csp.includes('frame-ancestors')))
        add('ZAP-10020', 'Missing X-Frame-Options / CSP frame-ancestors', 'MEDIUM',
            'Page can be embedded in an iframe on any domain — clickjacking risk.',
            "Add: X-Frame-Options: DENY  or CSP frame-ancestors 'none'");

    if (!headers['x-content-type-options'])
        add('ZAP-10021', 'Missing X-Content-Type-Options', 'LOW',
            'Browsers may MIME-sniff responses, potentially executing files as a different content type.',
            'Add: X-Content-Type-Options: nosniff');

    if (!headers['referrer-policy'])
        add('ZAP-10110', 'Missing Referrer-Policy', 'LOW',
            'Full URL including query params may be sent to third parties.',
            'Add: Referrer-Policy: strict-origin-when-cross-origin');

    if (!headers['permissions-policy'])
        add('ZAP-10063', 'Missing Permissions-Policy', 'LOW',
            'No restrictions on browser features like camera, microphone, geolocation.',
            'Add: Permissions-Policy: camera=(), microphone=(), geolocation=()');

    const server = headers['server'];
    if (server && /[0-9]/.test(server))
        add('ZAP-10036', 'Server header discloses version', 'LOW',
            'Version info helps attackers find known vulnerabilities.',
            'Suppress or genericise the Server header.', `Server: ${server}`);

    const xpb = headers['x-powered-by'];
    if (xpb)
        add('ZAP-10037', 'X-Powered-By discloses technology', 'INFO',
            'Reveals backend technology stack, aiding fingerprinting.',
            'Remove X-Powered-By (e.g. app.disable("x-powered-by") in Express).', `X-Powered-By: ${xpb}`);

    if (headers['access-control-allow-origin'] === '*')
        add('ZAP-10098', 'CORS wildcard (Access-Control-Allow-Origin: *)', 'MEDIUM',
            'Any origin can make cross-origin requests.',
            'Restrict CORS to specific trusted origins.', 'Access-Control-Allow-Origin: *');

    const setCookie = headers['set-cookie'];
    if (setCookie) {
        const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
        for (const cookie of cookies) {
            const name = cookie.split('=')[0].trim();
            if (!cookie.toLowerCase().includes('secure'))
                add('ZAP-10011', `Cookie "${name}" missing Secure flag`, 'MEDIUM',
                    'Cookie can be transmitted over HTTP.',
                    `Add Secure flag: Set-Cookie: ${name}=...; Secure; HttpOnly; SameSite=Strict`,
                    cookie.slice(0, 80));
            if (!cookie.toLowerCase().includes('httponly'))
                add('ZAP-10010', `Cookie "${name}" missing HttpOnly flag`, 'MEDIUM',
                    'Cookie is accessible via JavaScript — can be stolen via XSS.',
                    'Add HttpOnly flag.', cookie.slice(0, 80));
            if (!cookie.toLowerCase().includes('samesite'))
                add('ZAP-10054', `Cookie "${name}" missing SameSite`, 'LOW',
                    'No SameSite attribute — CSRF risk.',
                    'Add SameSite=Strict or SameSite=Lax.', cookie.slice(0, 80));
        }
    }

    // Sort: HIGH → MEDIUM → LOW → INFO
    const ORDER = { HIGH: 0, MEDIUM: 1, LOW: 2, INFO: 3 };
    findings.sort((a, b) => (ORDER[a.severity] ?? 4) - (ORDER[b.severity] ?? 4));

    return { findings, status_code: response?.status };
}

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Scan a URL for security issues.
 * Tries official ZAP Docker first, falls back to passive header scan.
 *
 * @param {string} targetUrl
 * @param {object} [opts]
 * @param {number} [opts.timeout]     ZAP scan timeout ms (default 300000 = 5 min)
 * @param {number} [opts.spiderMins]  ZAP spider duration in minutes (default 1)
 * @returns {Promise<{ url, findings, summary, engine, scanned_at, error? }>}
 */
async function scanUrl(targetUrl, opts = {}) {
    const scanned_at = new Date().toISOString();
    if (!targetUrl.startsWith('http')) targetUrl = 'https://' + targetUrl;

    let findings    = [];
    let engine      = 'passive';
    let zapError    = null;
    let status_code = null;

    // ── Try ZAP Docker ────────────────────────────────────────────────────────
    const dockerAvailable = await isDockerAvailable();

    if (dockerAvailable) {
        try {
            const zapReport = await runZapScan(targetUrl, opts);
            findings = parseZapReport(zapReport, targetUrl);
            engine   = 'zap';
            console.log(`[OWASP] ZAP scan complete — ${findings.length} alerts on ${targetUrl}`);
        } catch (err) {
            zapError = err.message;
            console.warn(`[OWASP] ZAP failed (${zapError}), falling back to passive scan`);
        }
    } else {
        console.log('[OWASP] Docker not available — using passive header scanner');
    }

    // ── Passive fallback ──────────────────────────────────────────────────────
    if (engine !== 'zap') {
        const passive = await runPassiveScan(targetUrl);
        if (passive.error) {
            return {
                url: targetUrl, findings: [],
                summary: { high: 0, medium: 0, low: 0, info: 0, total: 0 },
                engine: 'passive', scanned_at, error: passive.error,
            };
        }
        findings    = passive.findings;
        status_code = passive.status_code;
    }

    // ── Summary ───────────────────────────────────────────────────────────────
    const summary = findings.reduce((acc, f) => {
        const key = f.severity.toLowerCase();
        acc[key] = (acc[key] || 0) + 1;
        acc.total++;
        return acc;
    }, { high: 0, medium: 0, low: 0, info: 0, total: 0 });

    return {
        url: targetUrl,
        findings,
        summary,
        engine,
        scanned_at,
        ...(status_code  != null && { status_code }),
        ...(zapError && engine === 'passive' && { zap_error: zapError }),
    };
}

module.exports = { scanUrl, isDockerAvailable };
