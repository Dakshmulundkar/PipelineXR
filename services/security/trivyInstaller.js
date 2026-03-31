'use strict';

/**
 * trivyInstaller.js
 *
 * Downloads the Trivy binary at server startup if not already present.
 * Uses Node.js https (no curl/wget dependency) so it works in any container.
 *
 * Download target: /tmp/trivy-bin/trivy  (writable in all containers)
 * Falls back gracefully — never throws, never blocks startup.
 */

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const https = require('https');
const { execFile } = require('child_process');
const util = require('util');

const execFileAsync = util.promisify(execFile);

// Where we install the binary at runtime
const TRIVY_RUNTIME_DIR = path.join(os.tmpdir(), 'trivy-bin');
const TRIVY_RUNTIME_BIN = path.join(TRIVY_RUNTIME_DIR, 'trivy');

// Version to download — pinned to last known clean release (v0.69.3)
// Note: Trivy had a supply chain incident on 2026-03-19 affecting Docker Hub.
// GitHub release binaries are safe. See: github.com/aquasecurity/trivy/security/advisories/GHSA-69fq-xp46-6x23
const TRIVY_VERSION = '0.69.3';

/**
 * Get the download URL for a specific Trivy version.
 * @param {string} version - Version number (e.g., '0.69.3')
 * @returns {string} Download URL
 */
function getTrivyDownloadUrl(version) {
    return `https://github.com/aquasecurity/trivy/releases/download/v${version}/trivy_${version}_Linux-64bit.tar.gz`;
}

/**
 * Returns the runtime binary path if already downloaded, null otherwise.
 */
function getRuntimeBinPath() {
    return fs.existsSync(TRIVY_RUNTIME_BIN) ? TRIVY_RUNTIME_BIN : null;
}

/**
 * Download a URL to a file path, following redirects.
 */
function downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
        let file = fs.createWriteStream(destPath);
        let settled = false;

        const done = (err) => {
            if (settled) return;
            settled = true;
            if (err) reject(err); else resolve();
        };

        const request = (reqUrl) => {
            https.get(reqUrl, { headers: { 'User-Agent': 'PipelineXR/1.0' } }, (res) => {
                // Follow redirects (GitHub releases use 302/301/307)
                if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) {
                    res.resume(); // drain response
                    return request(res.headers.location);
                }
                if (res.statusCode !== 200) {
                    res.resume();
                    return done(new Error(`HTTP ${res.statusCode} for ${reqUrl}`));
                }
                res.pipe(file);
                file.on('finish', () => file.close(() => done(null)));
                file.on('error', done);
            }).on('error', done);
        };

        request(url);
    });
}

/**
 * Extract trivy binary from tar.gz archive using Node.js tar (built-in via child_process).
 */
async function extractTarGz(tarPath, destDir) {
    await execFileAsync('tar', ['-xzf', tarPath, '-C', destDir, 'trivy'], { timeout: 30_000 });
}

/**
 * Download and install Trivy binary to /tmp/trivy-bin/trivy.
 * Returns the binary path on success, null on failure.
 * Never throws.
 */
async function installTrivy() {
    try {
        // Already installed
        if (getRuntimeBinPath()) {
            console.log(`[TrivyInstaller] Already installed at ${TRIVY_RUNTIME_BIN}`);
            return TRIVY_RUNTIME_BIN;
        }

        console.log(`[TrivyInstaller] Downloading Trivy v${TRIVY_VERSION}...`);

        // Create target directory
        fs.mkdirSync(TRIVY_RUNTIME_DIR, { recursive: true });

        const tarPath = path.join(TRIVY_RUNTIME_DIR, 'trivy.tar.gz');
        const downloadUrl = getTrivyDownloadUrl(TRIVY_VERSION);

        // Download tar.gz
        console.log(`[TrivyInstaller] Fetching from: ${downloadUrl}`);
        await downloadFile(downloadUrl, tarPath);
        console.log(`[TrivyInstaller] Downloaded to ${tarPath}`);

        // Extract trivy binary
        await extractTarGz(tarPath, TRIVY_RUNTIME_DIR);

        // Cleanup tar
        try { fs.unlinkSync(tarPath); } catch (_) {}

        // Make executable
        fs.chmodSync(TRIVY_RUNTIME_BIN, 0o755);

        // Verify it works
        const { stdout } = await execFileAsync(TRIVY_RUNTIME_BIN, ['--version'], { timeout: 10_000 });
        console.log(`[TrivyInstaller] ✅ Trivy installed: ${stdout.trim().split('\n')[0]}`);

        return TRIVY_RUNTIME_BIN;
    } catch (err) {
        console.warn(`[TrivyInstaller] ⚠️  Failed to install Trivy: ${err.message}`);
        console.warn('[TrivyInstaller]    Scans will use TrivyLite fallback');
        return null;
    }
}

module.exports = { installTrivy, getRuntimeBinPath, TRIVY_RUNTIME_BIN };
