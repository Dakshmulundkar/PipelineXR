const githubService = require('./github');
const db = require('./database');

class SecurityService {
    constructor() {
        this.db = db;
    }

    async getSummary(repoFullName = null, userId = null) {
        return new Promise(async (resolve, reject) => {
            let stats = { critical: 0, high: 0, medium: 0, low: 0, total: 0 };

            let sql = `SELECT severity, COUNT(*) as count FROM vulnerabilities WHERE status = 'open'`;
            let params = [];
            if (repoFullName) { sql += ` AND repository = ?`; params.push(repoFullName); }
            if (userId)       { sql += ` AND user_id = ?`;    params.push(userId); }
            sql += ` GROUP BY severity`;

            this.db.all(sql, params, async (err, rows) => {
                if (err) console.error("Vulnerability fetch error:", err.message);
                else {
                    rows.forEach(row => {
                        const sev = row.severity.toLowerCase();
                        if (stats[sev] !== undefined) {
                            stats[sev] += parseInt(row.count, 10) || 0;
                            stats.total += parseInt(row.count, 10) || 0;
                        }
                    });
                }

                // Only fall back to live GitHub Dependabot API if repo has no DB entries yet
                if (stats.total === 0 && repoFullName && repoFullName.includes('/')) {
                    const [owner, repo] = repoFullName.split('/');
                    try {
                        const ghStats = await githubService.getVulnerabilityStats(owner, repo);
                        if (ghStats && ghStats.total > 0) {
                            stats.critical += ghStats.critical;
                            stats.high     += ghStats.high;
                            stats.medium   += ghStats.medium;
                            stats.low      += ghStats.low;
                            stats.total    += ghStats.total;
                        }
                    } catch (e) { /* silently ignore */ }
                }

                // Scanner breakdown by source
                const scannerSql = `SELECT scanner, COUNT(*) as count FROM vulnerabilities WHERE status = 'open'${repoFullName ? ' AND repository = ?' : ''}${userId ? ' AND user_id = ?' : ''} GROUP BY scanner`;
                const scannerParams = [...(repoFullName ? [repoFullName] : []), ...(userId ? [userId] : [])];

                this.db.all(scannerSql, scannerParams, (err2, scannerRows) => {
                    const scannerMap = {};
                    (scannerRows || []).forEach(r => { scannerMap[r.scanner] = r.count; });

                    resolve({
                        status: stats.critical > 0 ? 'critical' : stats.high > 0 ? 'danger' : 'secure',
                        lastScanned: new Date().toISOString(),
                        total: stats.total,
                        critical: stats.critical,
                        high: stats.high,
                        medium: stats.medium,
                        low: stats.low,
                        scanners: [
                            { name: 'GitHub Dependabot', status: (scannerMap['dependabot'] || 0) > 0 ? 'failed' : 'passed', findings: scannerMap['dependabot'] || 0, lastRun: new Date().toISOString() },
                            { name: 'Trivy / TrivyLite', status: (scannerMap['trivy:vuln'] || 0) > 0 ? 'failed' : 'passed', findings: (scannerMap['trivy:vuln'] || 0) + (scannerMap['trivy:config'] || 0) + (scannerMap['trivy:secret'] || 0), lastRun: new Date().toISOString() },
                            { name: 'npm audit',          status: (scannerMap['npm-audit'] || 0) > 0 ? 'failed' : 'passed', findings: scannerMap['npm-audit'] || 0, lastRun: new Date().toISOString() },
                            { name: 'License Scan',       status: (scannerMap['license'] || 0) > 0 ? 'failed' : 'passed',  findings: scannerMap['license'] || 0,    lastRun: new Date().toISOString() },
                        ]
                    });
                });
            });
        });
    }

    async addVulnerability(userId, repo, scanner, cve_id, package_name, severity, description = null, remediation = null, installed_version = null, fixed_version = null, link = null) {
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(`
                INSERT INTO vulnerabilities (user_id, repository, scanner, cve_id, package_name, severity, description, remediation, installed_version, fixed_version, link)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            stmt.run(userId, repo, scanner, cve_id, package_name, severity, description, remediation, installed_version, fixed_version, link, (err) => {
                if (err) reject(err);
                else resolve();
            });
            stmt.finalize();
        });
    }

    // Call this BEFORE inserting new scan results for a repo+scanner combo.
    // Clears stale rows so counts reflect the latest scan only.
    async clearScanResults(userId, repo, scannerPrefix) {
        return new Promise((resolve, reject) => {
            this.db.run(
                `DELETE FROM vulnerabilities WHERE user_id = ? AND repository = ? AND scanner LIKE ?`,
                [userId, repo, `${scannerPrefix}%`],
                (err) => { if (err) reject(err); else resolve(); }
            );
        });
    }

    // Helper logic to get all vulnerabilities for AI contextualization
    async getVulnerabilities(repoFullName = null, userId = null) {
        return new Promise((resolve, reject) => {
            let sql = `SELECT * FROM vulnerabilities WHERE status = 'open'`;
            let params = [];
            if (repoFullName) {
                sql += ` AND repository = ?`;
                params.push(repoFullName);
            }
            if (userId) {
                sql += ` AND user_id = ?`;
                params.push(userId);
            }
            sql += ` ORDER BY timestamp DESC LIMIT 50`;

            this.db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    async getLicenseFindings(repoFullName = null, userId = null) {
        return new Promise((resolve, reject) => {
            let sql = `SELECT * FROM vulnerabilities WHERE status = 'open' AND scanner = 'license'`;
            const params = [];
            if (repoFullName) { sql += ` AND repository = ?`; params.push(repoFullName); }
            if (userId)       { sql += ` AND user_id = ?`;    params.push(userId); }
            sql += ` ORDER BY timestamp DESC`;
            this.db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
    }

    async getIaCFindings(repoFullName = null, userId = null) {
        return new Promise((resolve, reject) => {
            let sql = `SELECT * FROM vulnerabilities WHERE status = 'open' AND scanner IN ('trivy:config', 'iac')`;
            const params = [];
            if (repoFullName) { sql += ` AND repository = ?`; params.push(repoFullName); }
            if (userId)       { sql += ` AND user_id = ?`;    params.push(userId); }
            sql += ` ORDER BY timestamp DESC LIMIT 100`;
            this.db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
    }

    async getScanHistory(repoFullName = null, userId = null) {
        return new Promise((resolve, reject) => {
            let sql = `SELECT * FROM scan_results WHERE 1=1`;
            const params = [];
            if (repoFullName) { sql += ` AND repository = ?`; params.push(repoFullName); }
            if (userId)       { sql += ` AND user_id = ?`;    params.push(userId); }
            sql += ` ORDER BY started_at DESC LIMIT 20`;
            this.db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
    }
}

module.exports = new SecurityService();
