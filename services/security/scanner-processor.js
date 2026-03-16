const db = require('../database');
const securityService = require('../securityService');
const githubService = require('../github');

class SecurityScannerService {
    constructor() {
        this.db = db;
    }

    /**
     * Process Trivy JSON report and store in database
     * @param {string} repoFull repository full name
     * @param {Object} trivyJson Parsed JSON from Trivy scan
     * @param {number} userId authenticated user ID
     */
    async processTrivyReport(repoFull, trivyJson, userId = null) {
        if (!trivyJson || !trivyJson.Results) return [];

        const results = [];
        for (const res of trivyJson.Results) {
            // 1. Process Vulnerabilities
            if (res.Vulnerabilities) {
                for (const vuln of res.Vulnerabilities) {
                    const severity = this.mapSeverity(vuln.Severity);
                    await securityService.addVulnerability(
                        userId,
                        repoFull,
                        'trivy:vuln',
                        vuln.VulnerabilityID,
                        vuln.PkgName,
                        severity,
                        vuln.Title || vuln.Description,
                        vuln.PrimaryURL || `https://avd.aquasec.com/nvd/${vuln.VulnerabilityID}`,
                        vuln.InstalledVersion,
                        vuln.FixedVersion,
                        vuln.PrimaryURL
                    );
                    results.push({ id: vuln.VulnerabilityID, severity, type: 'vulnerability' });
                }
            }

            // 2. Process Misconfigurations
            if (res.Misconfigurations) {
                for (const config of res.Misconfigurations) {
                    const severity = this.mapSeverity(config.Severity);
                    await securityService.addVulnerability(
                        userId,
                        repoFull,
                        'trivy:config',
                        config.ID,
                        config.Type,
                        severity,
                        config.Title || config.Description,
                        config.PrimaryURL || 'https://trivy.dev/docs/scanner/misconfiguration/',
                        null,
                        null,
                        config.PrimaryURL
                    );
                    results.push({ id: config.ID, severity, type: 'misconfiguration' });
                }
            }

            // 3. Process Secrets
            if (res.Secrets) {
                for (const secret of res.Secrets) {
                    const severity = this.mapSeverity(secret.Severity);
                    await securityService.addVulnerability(
                        userId,
                        repoFull,
                        'trivy:secret',
                        secret.RuleID,
                        secret.Category,
                        severity,
                        secret.Title,
                        'https://trivy.dev/docs/scanner/secret/',
                        null,
                        null,
                        'https://trivy.dev/docs/scanner/secret/'
                    );
                    results.push({ id: secret.RuleID, severity, type: 'secret' });
                }
            }
        }
        return results;
    }

    /**
     * Fetch Snyk vulnerabilities via API (if key present)
     * @param {string} owner 
     * @param {string} repo 
     * @param {number} userId
     */
    async fetchSnykIssues(owner, repo, userId = null) {
        const snykToken = process.env.SNYK_TOKEN;
        const orgId = process.env.SNYK_ORG_ID;
        if (!snykToken || !orgId) return [];

        try {
            // STEP 1: Find the project ID by searching all projects for the org
            const projectsRes = await fetch(`https://api.snyk.io/v1/org/${orgId}/projects`, {
                headers: { 'Authorization': `token ${snykToken}` }
            });
            if (!projectsRes.ok) throw new Error('Snyk projects fetch failed');
            const data = await projectsRes.json();

            // Find project that matches the repo name in its URL or name
            const project = data.projects.find(p => p.name.includes(repo) || (p.remoteRepoUrl && p.remoteRepoUrl.includes(repo)));
            if (!project) {
                console.log(`No Snyk project found for repo: ${repo}`);
                return [];
            }

            // STEP 2: Fetch aggregated issues for this project
            const issuesRes = await fetch(`https://api.snyk.io/v1/org/${orgId}/project/${project.id}/aggregated-issues`, {
                method: 'POST',
                headers: { 
                    'Authorization': `token ${snykToken}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!issuesRes.ok) throw new Error('Snyk issues fetch failed');
            const issuesData = await issuesRes.json();

            // Map and store in our database
            const processed = [];
            for (const issue of issuesData.issues || []) {
                const severity = this.mapSeverity(issue.issueData.severity);
                await securityService.addVulnerability(
                    userId,
                    `${owner}/${repo}`,
                    'snyk',
                    issue.id,
                    issue.pkgName,
                    severity,
                    issue.issueData.title,
                    `https://app.snyk.io/vuln/${issue.id}`
                );
                processed.push({ id: issue.id, severity });
            }

            return processed;
        } catch (e) {
            console.error('Snyk API integration error:', e.message);
            return [];
        }
    }


    mapSeverity(sev) {
        const s = (sev || '').toLowerCase();
        if (s === 'critical') return 'critical';
        if (s === 'high') return 'high';
        if (s === 'medium') return 'medium';
        return 'low';
    }

    /**
     * Process npm audit JSON and persist findings
     */
    async processNpmAudit(repoFull, auditJson, userId = null) {
        if (!auditJson || !auditJson.vulnerabilities) return [];
        const results = [];
        for (const [pkgName, vuln] of Object.entries(auditJson.vulnerabilities)) {
            const severity = this.mapSeverity(vuln.severity);
            const via = Array.isArray(vuln.via) ? vuln.via.find(v => typeof v === 'object') : null;
            const cveId = via?.url || via?.source?.toString() || `npm-audit-${pkgName}`;
            const description = via?.title || vuln.name || pkgName;
            const installedVersion = vuln.range || null;
            const fixedVersion = vuln.fixAvailable === true ? 'available' : (typeof vuln.fixAvailable === 'object' ? vuln.fixAvailable?.version : null);
            const link = via?.url || `https://www.npmjs.com/advisories`;

            await securityService.addVulnerability(
                userId, repoFull, 'npm-audit',
                cveId, pkgName, severity,
                description, link,
                installedVersion, fixedVersion, link
            );
            results.push({ id: cveId, severity, type: 'npm-audit' });
        }
        return results;
    }

    /**
     * Persist license findings as vulnerabilities with scanner='license'
     */
    async processLicenseFindings(repoFull, findings, userId = null) {
        const results = [];
        for (const f of findings) {
            if (!f.flagged) continue; // only persist flagged (HIGH/MEDIUM) licenses
            await securityService.addVulnerability(
                userId, repoFull, 'license',
                f.license, f.packageName, f.severity.toLowerCase(),
                `License: ${f.license} — ${f.severity === 'HIGH' ? 'Copyleft license may require source disclosure.' : 'Unknown or non-standard license.'}`,
                'https://spdx.org/licenses/',
                f.version, null,
                'https://spdx.org/licenses/'
            );
            results.push({ id: f.license, severity: f.severity.toLowerCase(), type: 'license' });
        }
        return results;
    }

    /**
     * Build enriched CycloneDX SBOM from stored vulnerabilities
     */
    async generateCycloneDXSBOM(repoFull, userId = null) {
        const crypto = require('crypto');
        const vulns = await securityService.getVulnerabilities(repoFull, userId);

        // Group by package_name
        const byPkg = {};
        for (const v of vulns) {
            if (!v.package_name) continue;
            const key = `${v.package_name}@${v.installed_version || 'unknown'}`;
            if (!byPkg[key]) {
                byPkg[key] = { name: v.package_name, version: v.installed_version || 'unknown', vulns: [] };
            }
            byPkg[key].vulns.push({ id: v.cve_id, severity: v.severity, description: v.description });
        }

        return {
            bomFormat: 'CycloneDX',
            specVersion: '1.4',
            serialNumber: `urn:uuid:${crypto.randomUUID()}`,
            version: 1,
            metadata: {
                timestamp: new Date().toISOString(),
                tools: [{ vendor: 'TrivyLite', name: 'TrivyLite', version: '1.0.0' }],
                component: { type: 'application', name: repoFull }
            },
            components: Object.values(byPkg).map(p => ({
                type: 'library',
                name: p.name,
                version: p.version,
                purl: `pkg:npm/${p.name}@${p.version}`,
                vulnerabilities: p.vulns
            }))
        };
    }
}

module.exports = new SecurityScannerService();
