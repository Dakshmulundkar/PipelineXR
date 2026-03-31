'use strict';

/**
 * TrivyManager — owns the Trivy binary lifecycle.
 *
 * Responsibilities:
 *   - Detect whether the Trivy CLI binary is installed at ./bin/trivy
 *   - Execute `trivy fs` scans and return raw JSON output
 *   - Execute `trivy fs --format cyclonedx` SBOM generation
 *   - Clean up all temporary output files (always, even on error)
 *
 * Engine priority in SecurityScanner:
 *   1. TrivyManager (this module) — ./bin/trivy binary
 *   2. Docker                     — aquasec/trivy image (local dev fallback)
 *   3. TrivyLite                  — pure-JS final fallback (never removed)
 *
 * Railway note: Railway containers have NO Docker daemon.
 * The binary installed via `npm run install:trivy` is the only real Trivy path in production.
 */

const { execFile } = require('child_process');
const fs   = require('fs');
const os   = require('os');
const path = require('path');
const util = require('util');

const execFileAsync = util.promisify(execFile);

// ── Binary path resolution ────────────────────────────────────────────────────
const PROJECT_ROOT    = path.resolve(__dirname, '../../');
const TRIVY_BIN_LOCAL = path.join(
    PROJECT_ROOT,
    'bin',
    process.platform === 'win32' ? 'trivy.exe' : 'trivy'
);

// Also check common system paths where nixpacks might install trivy
const TRIVY_SYSTEM_PATHS = [
    '/usr/local/bin/trivy',
    '/usr/bin/trivy',
    '/nix/var/nix/profiles/default/bin/trivy',
];

/**
 * Returns the path to the Trivy binary, or null if not found.
 * Checks ./bin/trivy first, then common system paths.
 */
function getBinaryPath() {
    if (fs.existsSync(TRIVY_BIN_LOCAL)) return TRIVY_BIN_LOCAL;
    for (const p of TRIVY_SYSTEM_PATHS) {
        if (fs.existsSync(p)) return p;
    }
    return null;
}

/**
 * Returns true if the Trivy binary exists anywhere on the system.
 */
function isBinaryAvailable() {
    return getBinaryPath() !== null;
}

/**
 * Run `trivy fs` on dirPath and return the raw JSON string.
 *
 * Writes output to a temp file to avoid mixing Trivy progress lines with JSON on stdout.
 * Temp file is always deleted in the finally block.
 *
 * @param {string} dirPath   Absolute path to the directory to scan
 * @param {object} [options]
 * @param {string} [options.severity='CRITICAL,HIGH,MEDIUM,LOW']
 * @param {number} [options.timeout=300000]  ms
 * @returns {Promise<string>}  Raw Trivy JSON output
 * @throws {Error} if binary is absent or process exits non-zero
 */
async function scan(dirPath, options = {}) {
    const trivyBin = getBinaryPath();
    if (!trivyBin) throw new Error('Trivy binary not found at ./bin/trivy — run `npm run install:trivy`');

    const severity   = options.severity || 'CRITICAL,HIGH,MEDIUM,LOW';
    const timeout    = options.timeout  || 300_000;
    const outputFile = path.join(os.tmpdir(), `trivy-scan-${Date.now()}-${process.pid}.json`);

    try {
        await execFileAsync(trivyBin, [
            'fs', dirPath,
            '--scanners', 'vuln,secret,misconfig',
            '--severity',  severity,
            '--format',    'json',
            '--output',    outputFile,
            '--exit-code', '0',
        ], { timeout });

        return fs.readFileSync(outputFile, 'utf8');
    } finally {
        try { fs.unlinkSync(outputFile); } catch (_) {}
    }
}

/**
 * Run `trivy fs --format cyclonedx` on dirPath and return the raw CycloneDX JSON string.
 * Returns '{}' on any failure — SBOM generation is non-fatal.
 *
 * @param {string} dirPath
 * @param {object} [options]
 * @param {number} [options.timeout=300000]
 * @returns {Promise<string>}  CycloneDX JSON string, or '{}' on failure
 */
async function scanSBOM(dirPath, options = {}) {
    const trivyBin = getBinaryPath();
    if (!trivyBin) return '{}';

    const timeout    = options.timeout || 300_000;
    const outputFile = path.join(os.tmpdir(), `trivy-sbom-${Date.now()}-${process.pid}.json`);

    try {
        await execFileAsync(trivyBin, [
            'fs', dirPath,
            '--format',    'cyclonedx',
            '--output',    outputFile,
            '--exit-code', '0',
        ], { timeout });

        const raw = fs.readFileSync(outputFile, 'utf8');
        return (raw && raw.trim()) ? raw : '{}';
    } catch (_) {
        return '{}';
    } finally {
        try { fs.unlinkSync(outputFile); } catch (_) {}
    }
}

module.exports = { isBinaryAvailable, getBinaryPath, scan, scanSBOM };
