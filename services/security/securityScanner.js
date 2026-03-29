/**
 * securityScanner.js
 *
 * Scan pipeline: clone repo → Trivy CLI → parse JSON → score → cleanup
 *
 * Engine priority (automatic, no config needed):
 *   1. Trivy CLI binary  — ./bin/trivy  (installed via `npm run install:trivy`)
 *   2. Docker            — aquasec/trivy image (fallback when CLI not present)
 *   3. TrivyLite         — pure-JS built-in engine (final fallback, no binaries needed)
 *
 * Requirements:
 *   - git installed on the host
 *   - Trivy CLI in ./bin/trivy  OR  Docker running  OR  neither (TrivyLite kicks in)
 */

'use strict';

const { execFile, spawn } = require('child_process');
const fs   = require('fs');
const os   = require('os');
const path = require('path');
const util = require('util');

const execFileAsync = util.promisify(execFile);
const trivyLite     = require('./trivyLite');

// ─── Resolve Trivy CLI binary path ───────────────────────────────────────────
// Looks for ./bin/trivy (installed by `npm run install:trivy`) relative to project root.
// Falls back to a system-wide `trivy` if present on PATH.
const PROJECT_ROOT = path.resolve(__dirname, '../../');
const TRIVY_BIN_LOCAL = path.join(PROJECT_ROOT, 'bin', process.platform === 'win32' ? 'trivy.exe' : 'trivy');

function getTrivyBin() {
    if (fs.existsSync(TRIVY_BIN_LOCAL)) return TRIVY_BIN_LOCAL;
    return null; // will fall through to Docker or TrivyLite
}

// ─── Risk scoring weights (from doc §9) ──────────────────────────────────────
const SEVERITY_WEIGHTS = { critical: 25, high: 10, medium: 3, low: 1, unknown: 0 };

// ─── Risk level thresholds ────────────────────────────────────────────────────
function getRiskLevel(score) {
    if (score < 30)  return 'Healthy';
    if (score < 70)  return 'Suspect';
    return 'Risky';
}

// ─── Security risk score from vuln counts (doc §9) ───────────────────────────
function calculateSecurityRiskScore(metrics) {
    const raw = Object.entries(SEVERITY_WEIGHTS).reduce((sum, [sev, weight]) => {
        return sum + (metrics[sev] || 0) * weight;
    }, 0);
    return Math.min(raw, 100);
}

// ─── Blended score: 60% deployment + 40% security (doc §9) ──────────────────
function getBlendedRiskScore(deploymentRisk, securityRisk) {
    return Math.min(0.6 * deploymentRisk + 0.4 * securityRisk, 100);
}

// ─── Deployment risk score (doc §9 Stage 1) ──────────────────────────────────
function calculateDeploymentRiskScore({ status, durationSeconds = 0 }) {
    let score = 0;
    if (status === 'failed') score += 70;
    if (durationSeconds > 300) score += 20;
    if (durationSeconds > 600) score += 10;
    return Math.min(score, 100);
}

// ─── Parse Trivy JSON output — captures every field the Docker extension shows ─
function parseTrivyResults(rawJson) {
    const counts = { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 };
    const detail = [];

    let data;
    try {
        // Trivy without --quiet may print progress lines before the JSON.
        // Find the first '{' to strip any leading non-JSON output.
        const jsonStart = rawJson.indexOf('{');
        const clean = jsonStart > 0 ? rawJson.slice(jsonStart) : rawJson;
        data = JSON.parse(clean);
    } catch (e) {
        throw new Error(`Failed to parse Trivy JSON: ${e.message}`);
    }

    for (const block of (data.Results || [])) {
        const target   = block.Target || '';
        const pkgType  = block.Type   || '';
        const pkgClass = block.Class  || '';

        // ── Vulnerabilities ──────────────────────────────────────────────────
        for (const v of (block.Vulnerabilities || [])) {
            const sev = (v.Severity || 'UNKNOWN').toLowerCase();
            counts[sev] = (counts[sev] || 0) + 1;

            // Build CVSS summary: pick NVD first, then any available source
            let cvss_score = null;
            let cvss_vector = null;
            if (v.CVSS) {
                const preferred = v.CVSS['nvd'] || v.CVSS['redhat'] || Object.values(v.CVSS)[0];
                if (preferred) {
                    cvss_score  = preferred.V3Score  ?? preferred.V2Score  ?? null;
                    cvss_vector = preferred.V3Vector ?? preferred.V2Vector ?? null;
                }
            }

            detail.push({
                type:              'vulnerability',
                id:                v.VulnerabilityID  || 'N/A',
                title:             v.Title            || v.VulnerabilityID || 'N/A',
                description:       v.Description      || null,
                severity:          (v.Severity        || 'UNKNOWN').toUpperCase(),
                severity_source:   v.SeveritySource   || null,
                package_name:      v.PkgName          || null,
                pkg_path:          v.PkgPath          || null,
                pkg_id:            v.PkgID            || null,
                installed_version: v.InstalledVersion || null,
                fixed_version:     v.FixedVersion     || null,
                status:            v.Status           || null,
                primary_url:       v.PrimaryURL       || (v.VulnerabilityID ? `https://avd.aquasec.com/nvd/${v.VulnerabilityID}` : null),
                references:        v.References       || [],
                cwe_ids:           v.CweIDs           || [],
                cvss_score,
                cvss_vector,
                cvss_sources:      v.CVSS             || null,
                published_date:    v.PublishedDate    || null,
                last_modified:     v.LastModifiedDate || null,
                data_source:       v.DataSource       || null,
                // target context
                target,
                pkg_type:          pkgType,
                pkg_class:         pkgClass,
            });
        }

        // ── Misconfigurations ────────────────────────────────────────────────
        for (const m of (block.Misconfigurations || [])) {
            const sev = (m.Severity || 'UNKNOWN').toLowerCase();
            counts[sev] = (counts[sev] || 0) + 1;
            detail.push({
                type:              'misconfiguration',
                id:                m.ID          || 'N/A',
                title:             m.Title       || m.ID || 'N/A',
                description:       m.Description || null,
                message:           m.Message     || null,
                resolution:        m.Resolution  || null,
                severity:          (m.Severity   || 'UNKNOWN').toUpperCase(),
                package_name:      m.Type        || target || 'misconfiguration',
                installed_version: null,
                fixed_version:     null,
                primary_url:       m.PrimaryURL  || 'https://trivy.dev/docs/scanner/misconfiguration/',
                references:        m.References  || [],
                status:            m.Status      || null,
                target,
                pkg_type:          pkgType,
                pkg_class:         pkgClass,
            });
        }

        // ── Secrets ──────────────────────────────────────────────────────────
        for (const s of (block.Secrets || [])) {
            const sev = (s.Severity || 'HIGH').toLowerCase();
            counts[sev] = (counts[sev] || 0) + 1;
            detail.push({
                type:              'secret',
                id:                s.RuleID      || 'N/A',
                title:             s.Title       || s.RuleID || 'N/A',
                description:       s.Match       ? `Match: ${s.Match}` : `Secret detected in ${target || 'file'}`,
                severity:          (s.Severity   || 'HIGH').toUpperCase(),
                package_name:      s.Category    || 'secret',
                category:          s.Category    || null,
                match:             s.Match       || null,
                start_line:        s.StartLine   || null,
                end_line:          s.EndLine     || null,
                installed_version: null,
                fixed_version:     null,
                primary_url:       'https://trivy.dev/docs/scanner/secret/',
                references:        [],
                target,
                pkg_type:          pkgType,
                pkg_class:         pkgClass,
            });
        }
    }

    return { counts, detail };
}

// ─── Enrich vulnerabilities missing descriptions via NVD API ─────────────────
// NVD public API — no key required, rate-limited to 5 req/30s
async function enrichDescriptions(vulns) {
    const missing = vulns.filter(v => v.type === 'vulnerability' && !v.description && v.id && v.id.startsWith('CVE-'));
    if (missing.length === 0) return vulns;

    // Batch: max 5 concurrent, 700ms apart to respect NVD rate limit
    const enriched = new Map();
    for (let i = 0; i < missing.length; i++) {
        const v = missing[i];
        try {
            const url = `https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=${v.id}`;
            const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
            if (res.ok) {
                const data = await res.json();
                const desc = data?.vulnerabilities?.[0]?.cve?.descriptions?.find(d => d.lang === 'en')?.value;
                if (desc) enriched.set(v.id, desc);
            }
        } catch (e) {
            // NVD unavailable — skip silently
        }
        if (i < missing.length - 1) await new Promise(r => setTimeout(r, 700));
    }

    if (enriched.size === 0) return vulns;

    return vulns.map(v => {
        if (v.type === 'vulnerability' && !v.description && enriched.has(v.id)) {
            return { ...v, description: enriched.get(v.id) };
        }
        return v;
    });
}


// ─── Run Trivy via local CLI binary ──────────────────────────────────────────
async function runTrivyViaCLI(repoDir, options = {}) {
    const trivyBin = getTrivyBin();
    if (!trivyBin) throw new Error('Trivy CLI binary not found in ./bin/trivy');

    const severity = options.severity || 'CRITICAL,HIGH,MEDIUM,LOW';
    // Write JSON output to a temp file — avoids mixing progress output with JSON on stdout
    const outputFile = path.join(os.tmpdir(), `trivy-${Date.now()}.json`);

    try {
        await execFileAsync(trivyBin, [
            'fs', repoDir,
            '--scanners', 'vuln,secret,misconfig',
            '--severity', severity,
            '--format', 'json',
            '--output', outputFile,
            '--exit-code', '0',
        ], { timeout: 300_000 });

        const raw = fs.readFileSync(outputFile, 'utf8');
        return raw;
    } finally {
        try { fs.unlinkSync(outputFile); } catch (_) {}
    }
}

// ─── Generate SBOM via Trivy CLI ─────────────────────────────────────────────
async function runTrivySBOMViaCLI(repoDir) {
    const trivyBin = getTrivyBin();
    if (!trivyBin) return '{}';

    const outputFile = path.join(os.tmpdir(), `trivy-sbom-${Date.now()}.json`);
    try {
        await execFileAsync(trivyBin, [
            'fs', repoDir,
            '--format', 'cyclonedx',
            '--output', outputFile,
            '--exit-code', '0',
        ], { timeout: 300_000 });

        const raw = fs.readFileSync(outputFile, 'utf8');
        return raw && raw.trim() ? raw : '{}';
    } catch (_) {
        return '{}';
    } finally {
        try { fs.unlinkSync(outputFile); } catch (_) {}
    }
}

// ─── Run Trivy via Docker (secondary fallback when CLI not installed) ─────────
async function runTrivyViaDocker(repoDir, options = {}) {
    const severity = options.severity || 'CRITICAL,HIGH,MEDIUM,LOW';
    // Normalise path for Docker on Windows (backslash → forward slash)
    const normalised = process.platform === 'win32'
        ? repoDir.replace(/\\/g, '/')
        : repoDir;

    const args = [
        'run', '--rm',
        '-v', `${normalised}:/project`,
        'aquasec/trivy',
        'fs', '/project',
        '--scanners', 'vuln,secret,misconfig',
        '--severity', severity,
        '-f', 'json',
        '--exit-code', '0',
    ];

    return new Promise((resolve, reject) => {
        const proc = spawn('docker', args);
        let stdout = '';
        let stderr = '';

        const timer = setTimeout(() => {
            proc.kill('SIGKILL');
            reject(new Error('Trivy Docker scan timed out after 300 seconds.'));
        }, 300_000);

        proc.stdout.on('data', d => { stdout += d; });
        proc.stderr.on('data', d => { stderr += d; });
        proc.on('error', err => {
            clearTimeout(timer);
            if (err.code === 'ENOENT') {
                reject(new Error('Docker not found.'));
            } else {
                reject(new Error(`Docker spawn error: ${err.message}`));
            }
        });
        proc.on('close', code => {
            clearTimeout(timer);
            if (code !== 0) {
                reject(new Error(`Trivy Docker exited ${code}. stderr: ${stderr.slice(0, 500)}`));
                return;
            }
            const jsonStart = stdout.indexOf('{');
            if (jsonStart < 0) {
                reject(new Error('Trivy Docker produced no JSON output.'));
                return;
            }
            resolve(stdout.slice(jsonStart));
        });
    });
}

// ─── Generate CycloneDX SBOM via Docker (fallback when CLI not available) ────
async function runTrivySBOMViaDocker(repoDir) {
    const normalised = process.platform === 'win32'
        ? repoDir.replace(/\\/g, '/')
        : repoDir;

    const args = [
        'run', '--rm',
        '-v', `${normalised}:/project`,
        'aquasec/trivy',
        'fs', '/project',
        '-f', 'cyclonedx',
        '--quiet'
    ];

    return new Promise((resolve) => {
        const proc = spawn('docker', args);
        let stdout = '';

        const timer = setTimeout(() => {
            proc.kill('SIGKILL');
            resolve('{}');
        }, 300_000);

        proc.stdout.on('data', d => { stdout += d; });
        proc.on('error', () => { clearTimeout(timer); resolve('{}'); });
        proc.on('close', code => {
            clearTimeout(timer);
            resolve(code === 0 && stdout.trim() ? stdout : '{}');
        });
    });
}

// ─── Clone repo into temp dir (doc §5 scan_repository clone step) ────────────
async function cloneRepo(repoFullName, token, ref) {
    const tmpDir  = fs.mkdtempSync(path.join(os.tmpdir(), 'scan_'));
    const repoDir = path.join(tmpDir, 'repo');

    const cloneUrl = token
        ? `https://${token}@github.com/${repoFullName}.git`
        : `https://github.com/${repoFullName}.git`;

    try {
        await execFileAsync('git', [
            'clone', '--depth', '1', '--single-branch', cloneUrl, repoDir
        ], { timeout: 120_000 });
    } catch (e) {
        cleanup(tmpDir);
        throw new Error(`git clone failed: ${e.stderr || e.message}`);
    }

    // Checkout specific ref if provided (non-fatal if it fails — shallow clone limitation)
    if (ref && ref.length >= 7) {
        try {
            await execFileAsync('git', ['-C', repoDir, 'checkout', ref], { timeout: 30_000 });
        } catch (e) {
            console.warn(`[securityScanner] Could not checkout ref ${ref} — scanning default branch`);
        }
    }

    return { tmpDir, repoDir };
}

function cleanup(tmpDir) {
    try {
        if (tmpDir && fs.existsSync(tmpDir)) {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    } catch (e) {
        console.warn(`[securityScanner] Could not remove temp dir ${tmpDir}: ${e.message}`);
    }
}

// ─── TrivyLite fallback (when Docker unavailable) ────────────────────────────
async function trivyLiteFallback(dirPath) {
    const results = await trivyLite.scanDirectory(dirPath);
    return JSON.stringify({
        Results: [
            {
                Target: 'package.json',
                Type: 'npm',
                Class: 'lang-pkgs',
                Vulnerabilities: results.vulnerabilities.map(v => ({
                    VulnerabilityID:  v.id,
                    PkgName:          v.package,
                    Severity:         v.severity.toUpperCase(),
                    Title:            v.title,
                    Description:      v.description,
                    InstalledVersion: v.installedVersion,
                    FixedVersion:     v.fixedVersion,
                    PrimaryURL:       `https://avd.aquasec.com/nvd/${v.id}`,
                    References:       [`https://avd.aquasec.com/nvd/${v.id}`],
                    Status:           v.fixedVersion ? 'fixed' : 'affected',
                }))
            },
            {
                Target: 'secrets',
                Type: 'secrets',
                Class: 'secret',
                Secrets: results.secrets.map(s => ({
                    RuleID:   s.id,
                    Title:    s.title,
                    Severity: s.severity.toUpperCase(),
                    Category: s.category || 'Generic',
                    Match:    s.file ? `found in ${s.file}` : null,
                }))
            },
            {
                Target: 'config',
                Type: 'dockerfile',
                Class: 'config',
                Misconfigurations: results.misconfigurations.map(m => ({
                    ID:          m.id,
                    Title:       m.title,
                    Severity:    m.severity.toUpperCase(),
                    Description: m.description,
                    Type:        m.type || 'config',
                    Resolution:  'Review and fix the misconfiguration.',
                    References:  [],
                }))
            }
        ]
    });
}

// ─── Public entry point ───────────────────────────────────────────────────────
/**
 * Full scan pipeline: clone → Trivy CLI / Docker / TrivyLite → parse → score → cleanup
 *
 * Engine selection (automatic):
 *   1. Trivy CLI  — ./bin/trivy exists
 *   2. Docker     — fallback when CLI not installed
 *   3. TrivyLite  — pure-JS final fallback, no binaries needed
 *
 * @param {string}  repoFullName  "owner/repo"
 * @param {string}  [token]       GitHub PAT (needed for private repos)
 * @param {string}  [ref]         commit SHA or branch to checkout before scanning
 * @param {object}  [options]     { severity, useLocalDir }
 * @returns {object|null}  { risk_score, risk_level, security_metrics, vulnerabilities, sbom, scan_status, engine }
 *                         Returns null on any failure — callers must handle null gracefully.
 */
async function scanRepository(repoFullName, token = null, ref = null, options = {}) {
    let tmpDir = null;

    try {
        let scanDir;

        if (options.useLocalDir) {
            scanDir = options.useLocalDir;
        } else {
            const cloned = await cloneRepo(repoFullName, token, ref);
            tmpDir  = cloned.tmpDir;
            scanDir = cloned.repoDir;
        }

        // ── Engine selection: CLI → Docker → TrivyLite ───────────────────────
        let rawJson;
        let engine = 'trivylite';

        const hasCLI = Boolean(getTrivyBin());

        if (hasCLI) {
            try {
                rawJson = await runTrivyViaCLI(scanDir, options);
                engine  = 'trivy-cli';
                console.log(`[securityScanner] Using Trivy CLI (${TRIVY_BIN_LOCAL})`);
            } catch (cliErr) {
                console.warn(`[securityScanner] Trivy CLI failed (${cliErr.message}), trying Docker...`);
            }
        }

        if (!rawJson) {
            try {
                rawJson = await runTrivyViaDocker(scanDir, options);
                engine  = 'trivy-docker';
                console.log('[securityScanner] Using Trivy via Docker');
            } catch (dockerErr) {
                console.warn(`[securityScanner] Docker unavailable (${dockerErr.message}), using TrivyLite fallback`);
                rawJson = await trivyLiteFallback(scanDir);
                engine  = 'trivylite';
            }
        }

        // ── Parse results ────────────────────────────────────────────────────
        const { counts, detail } = parseTrivyResults(rawJson);
        const riskScore = calculateSecurityRiskScore(counts);

        // Enrich any CVEs that Trivy returned without a description
        const enrichedDetail = await enrichDescriptions(detail);

        // ── Generate SBOM (CLI or Docker, non-fatal) ─────────────────────────
        let sbom = {};
        if (engine === 'trivy-cli') {
            try {
                const sbomRaw = await runTrivySBOMViaCLI(scanDir);
                sbom = JSON.parse(sbomRaw);
            } catch (_) { /* non-fatal */ }
        } else if (engine === 'trivy-docker') {
            try {
                const sbomRaw = await runTrivySBOMViaDocker(scanDir);
                sbom = JSON.parse(sbomRaw);
            } catch (_) { /* non-fatal */ }
        }

        const scanResult = {
            risk_score:       riskScore,
            risk_level:       getRiskLevel(riskScore),
            security_metrics: counts,
            vulnerabilities:  enrichedDetail,
            sbom,
            scan_status:      'success',
            engine,
        };

        // Fire-and-forget to Datadog
        try {
            const datadog = require('./datadog');
            datadog.trackSecurityScan(repoFullName, counts).catch(() => {});
        } catch (_) { /* non-fatal */ }

        return scanResult;

    } catch (err) {
        console.error(`[securityScanner] Scan failed for ${repoFullName}: ${err.message}`);
        return null;
    } finally {
        cleanup(tmpDir);
    }
}

module.exports = {
    scanRepository,
    parseTrivyResults,
    calculateSecurityRiskScore,
    calculateDeploymentRiskScore,
    getBlendedRiskScore,
    getRiskLevel,
};
