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

// Common system paths where nixpkgs / curl-install might place trivy
// Railway Nixpacks puts binaries in Nix store paths that are symlinked
const TRIVY_SYSTEM_PATHS = [
    '/usr/local/bin/trivy',
    '/usr/bin/trivy',
    // Nixpacks / Nix store symlinks (Railway)
    '/nix/var/nix/profiles/default/bin/trivy',
    '/root/.nix-profile/bin/trivy',
    '/home/cnb/.nix-profile/bin/trivy',           // Railway CNB user
    '/etc/profiles/per-user/root/bin/trivy',       // NixOS per-user
    '/run/current-system/sw/bin/trivy',            // NixOS system
    // Homebrew (macOS local dev)
    '/opt/homebrew/bin/trivy',
    '/usr/local/Cellar/trivy/*/bin/trivy',
];

// Cache the resolved path so we only probe once per process
let _cachedBinPath = undefined;

/**
 * Returns the path to the Trivy binary, or null if not found anywhere.
 * Checks ./bin/trivy, common system paths, then `which`/`command -v`.
 */
function getBinaryPath() {
    if (_cachedBinPath !== undefined) return _cachedBinPath;

    // 1. Local ./bin/trivy (curl-installed)
    if (fs.existsSync(TRIVY_BIN_LOCAL)) {
        console.log(`[TrivyManager] Found local binary: ${TRIVY_BIN_LOCAL}`);
        _cachedBinPath = TRIVY_BIN_LOCAL;
        return _cachedBinPath;
    }

    // 2. Known system paths (nixpkgs / brew / system)
    for (const p of TRIVY_SYSTEM_PATHS) {
        if (fs.existsSync(p)) {
            console.log(`[TrivyManager] Found system binary: ${p}`);
            _cachedBinPath = p;
            return _cachedBinPath;
        }
    }

    // 3. `which trivy` / `command -v trivy` — handles any PATH location
    //    Try multiple commands for cross-platform support
    const { execSync } = require('child_process');
    const cmds = process.platform === 'win32'
        ? ['where trivy']
        : ['which trivy', 'command -v trivy'];

    for (const cmd of cmds) {
        try {
            const found = execSync(`${cmd} 2>/dev/null`, { encoding: 'utf8' }).trim().split('\n')[0];
            if (found && fs.existsSync(found)) {
                console.log(`[TrivyManager] Found via PATH (${cmd}): ${found}`);
                _cachedBinPath = found;
                return _cachedBinPath;
            }
        } catch (_) { /* not on PATH */ }
    }

    // 4. Nix store glob — Nixpacks sometimes only has the store path, not a profile symlink
    try {
        const found = execSync('find /nix/store -maxdepth 2 -name trivy -type f 2>/dev/null | head -1', { encoding: 'utf8', timeout: 5000 }).trim();
        if (found && fs.existsSync(found)) {
            console.log(`[TrivyManager] Found in Nix store: ${found}`);
            _cachedBinPath = found;
            return _cachedBinPath;
        }
    } catch (_) { /* no nix store or find not available */ }

    // 5. Runtime-installed path (/tmp/trivy-bin/trivy — installed by trivyInstaller.js at startup)
    try {
        const { getRuntimeBinPath } = require('./trivyInstaller');
        const runtimePath = getRuntimeBinPath();
        if (runtimePath) {
            console.log(`[TrivyManager] Found runtime-installed binary: ${runtimePath}`);
            _cachedBinPath = runtimePath;
            return _cachedBinPath;
        }
    } catch (_) { /* trivyInstaller not available */ }

    // 6. Log PATH for debugging (helps diagnose Railway issues)
    console.log(`[TrivyManager] Trivy not found. PATH=${process.env.PATH || '(not set)'}`);
    // Do NOT permanently cache null — installer may still be running at startup.
    // Return null without caching so next call re-probes (installer may have finished).
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

module.exports = { isBinaryAvailable, getBinaryPath, scan, scanSBOM, _resetCache: () => { _cachedBinPath = undefined; } };

// Log trivy availability at module load time so it shows in Railway startup logs.
// Note: if not found here, trivyInstaller.js will download it async — getBinaryPath()
// will re-probe on the next scan call since null is not permanently cached.
const _binPath = getBinaryPath();
if (_binPath) {
    try {
        const { execSync } = require('child_process');
        const version = execSync(`"${_binPath}" version 2>/dev/null`, { encoding: 'utf8', timeout: 10000 }).trim();
        console.log(`[TrivyManager] ✅ Trivy binary ready: ${_binPath}`);
        console.log(`[TrivyManager]    ${version.split('\n')[0]}`);
    } catch (e) {
        console.warn(`[TrivyManager] ⚠️  Trivy found at ${_binPath} but failed to execute: ${e.message}`);
        _cachedBinPath = null;
    }
} else {
    console.log('[TrivyManager] Trivy binary not found at startup — trivyInstaller will attempt download.');
    console.log('[TrivyManager] Scans will use TrivyLite until Trivy is ready.');
}
