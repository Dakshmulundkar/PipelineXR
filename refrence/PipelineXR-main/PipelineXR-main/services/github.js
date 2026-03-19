// const { Octokit } = require('octokit'); // Replaced with dynamic import
let OctokitClass;
require('dotenv').config();

// Initialize Octokit — cached per token to avoid re-creating on every request
let octokit = null;
let currentToken = null;
let initPromise = null;

const init = async (token) => {
    // If same token, reuse existing instance
    if (octokit && token === currentToken) return;

    // If init is already in progress, wait for it
    if (initPromise) {
        await initPromise;
        if (octokit && token === currentToken) return;
    }

    initPromise = (async () => {
        if (!OctokitClass) {
            const mod = await import('octokit');
            OctokitClass = mod.Octokit;
        }

        try {
            if (token) {
                octokit = new OctokitClass({ auth: token });
                currentToken = token;
                console.log("GitHub Service Initialized with Token");
            } else {
                console.warn("GitHub Service: No token provided. Rate limits will be strict.");
                octokit = new OctokitClass();
                currentToken = null;
            }
        } finally {
            initPromise = null;
        }
    })();

    await initPromise;
};

// Auto-init if env var exists
if (process.env.GITHUB_TOKEN) {
    init(process.env.GITHUB_TOKEN).catch(err => console.error("Failed to auto-init GitHub:", err));
}

const getRepoStats = async (owner, repo) => {
    if (!octokit) await init();

    try {
        const [repoData, pulls, issues] = await Promise.all([
            octokit.request('GET /repos/{owner}/{repo}', { owner, repo }),
            octokit.request('GET /repos/{owner}/{repo}/pulls', { owner, repo, state: 'open' }),
            octokit.request('GET /repos/{owner}/{repo}/issues', { owner, repo, state: 'open' })
        ]);

        return {
            stars: repoData.data.stargazers_count,
            forks: repoData.data.forks_count,
            open_issues: repoData.data.open_issues_count,
            open_prs: pulls.data.length,
            language: repoData.data.language,
            last_pushed: repoData.data.pushed_at,
            description: repoData.data.description
        };
    } catch (error) {
        console.error("GitHub API Error", error.message);
        return { error: error.message };
    }
};

const getRecentCommits = async (owner, repo) => {
    if (!octokit) await init();
    try {
        const commits = await octokit.request('GET /repos/{owner}/{repo}/commits', { owner, repo, per_page: 10 });
        return commits.data.map(c => ({
            message: c.commit.message,
            author: c.commit.author.name,
            date: c.commit.author.date,
            sha: c.sha.substring(0, 7),
            url: c.html_url
        }));
    } catch (error) {
        console.error("GitHub Commits Error", error.message);
        return [];
    }
};

const getWorkflowStats = async (owner, repo) => {
    if (!octokit) await init();
    try {
        // Fetch last 100 runs to get a better trend
        const runs = await octokit.request('GET /repos/{owner}/{repo}/actions/runs', {
            owner,
            repo,
            per_page: 100,
            status: 'completed'
        });

        // Basic Aggregation
        const total = runs.data.workflow_runs.length;
        if (total === 0) return { successRate: 0, avgDuration: 0, totalRuns: 0, runs: [] };

        const successCount = runs.data.workflow_runs.filter(r => r.conclusion === 'success').length;
        const successRate = Math.round((successCount / total) * 100);

        // Calculate average duration (GitHub API doesn't give duration directly in list, need to diff timestamps)
        let totalDurationMs = 0;
        const recentRuns = runs.data.workflow_runs.map(r => {
            const start = new Date(r.run_started_at).getTime();
            const end = new Date(r.updated_at).getTime(); // Approximation
            const durationSec = (end - start) / 1000;
            totalDurationMs += (end - start);

            return {
                id: r.id,
                name: r.name,
                status: r.status,
                conclusion: r.conclusion,
                duration: durationSec,
                created_at: r.created_at,
                run_started_at: r.run_started_at,
                updated_at: r.updated_at
            };
        });

        const avgDurationSec = Math.round((totalDurationMs / total) / 1000);

        // Get daily success rates for trend
        const dailyStats = {};
        runs.data.workflow_runs.forEach(run => {
            const date = new Date(run.created_at).toDateString();
            if (!dailyStats[date]) {
                dailyStats[date] = { total: 0, success: 0 };
            }
            dailyStats[date].total++;
            if (run.conclusion === 'success') {
                dailyStats[date].success++;
            }
        });

        const trendData = Object.entries(dailyStats)
            .sort(([a], [b]) => new Date(a) - new Date(b))
            .slice(-14) // Last 14 days
            .map(([date, stats]) => ({
                date,
                successRate: Math.round((stats.success / stats.total) * 100),
                total: stats.total,
                success: stats.success
            }));

        return {
            successRate,
            avgDuration: avgDurationSec,
            totalRuns: total,
            runs: recentRuns.slice(0, 10), // Return last 10 for detailed list if needed
            trendData,
            failureRate: 100 - successRate,
            lastRun: runs.data.workflow_runs[0] || null
        };
    } catch (error) {
        console.error("GitHub Actions Error", error.message);
        return { error: error.message };
    }
};

const getUserInfo = async () => {
    if (!octokit) await init();
    try {
        const user = await octokit.request('GET /user');
        return {
            id: user.data.id,
            login: user.data.login,
            name: user.data.name,
            email: user.data.email,
            avatar_url: user.data.avatar_url,
            company: user.data.company,
            location: user.data.location,
            public_repos: user.data.public_repos,
            followers: user.data.followers,
            following: user.data.following
        };
    } catch (error) {
        console.error("GitHub User Info Error", error.message);
        return { error: error.message };
    }
};

const getUserRepositories = async () => {
    if (!octokit) await init();
    try {
        const repos = await octokit.request('GET /user/repos', {
            sort: 'updated',
            per_page: 50,
            type: 'all'
        });

        return repos.data.map(repo => ({
            id: repo.id,
            name: repo.name,
            full_name: repo.full_name,
            owner: {
                login: repo.owner.login,
                avatar_url: repo.owner.avatar_url
            },
            description: repo.description,
            language: repo.language,
            stargazers_count: repo.stargazers_count,
            forks_count: repo.forks_count,
            updated_at: repo.updated_at,
            private: repo.private
        }));
    } catch (error) {
        console.error("GitHub User Repos Error", error.message);
        return { error: error.message };
    }
};

const getVulnerabilityStats = async (owner, repo) => {
    if (!octokit) await init();
    try {
        const response = await octokit.request('GET /repos/{owner}/{repo}/dependabot/alerts', {
            owner,
            repo,
            state: 'open',
            per_page: 50
        });

        const stats = { critical: 0, high: 0, medium: 0, low: 0, total: 0 };

        if (Array.isArray(response.data)) {
            response.data.forEach(alert => {
                const severity = alert.security_advisory.severity;
                if (severity === 'critical') stats.critical++;
                else if (severity === 'high') stats.high++;
                else if (severity === 'medium') stats.medium++;
                else if (severity === 'low') stats.low++;
                stats.total++;
            });
        }

        return stats;
    } catch (error) {
        console.warn(`Dependabot alerts not available for ${owner}/${repo}:`, error.message);
        return { critical: 0, high: 0, medium: 0, low: 0, total: 0 };
    }
};

// Fetch full Dependabot alert details (not just counts)
const getDependabotAlerts = async (owner, repo) => {
    if (!octokit) await init();
    try {
        const response = await octokit.request('GET /repos/{owner}/{repo}/dependabot/alerts', {
            owner,
            repo,
            state: 'open',
            per_page: 100,
            headers: { 'X-GitHub-Api-Version': '2022-11-28' }
        });

        if (!Array.isArray(response.data)) return [];

        return response.data.map(alert => {
            const advisory = alert.security_advisory || {};
            const vuln     = alert.security_vulnerability || {};
            const dep      = alert.dependency || {};
            const pkg      = dep.package || {};

            return {
                number:            alert.number,
                state:             alert.state,
                severity:          advisory.severity || vuln.severity || 'unknown',
                cve_id:            advisory.cve_id || advisory.ghsa_id || null,
                ghsa_id:           advisory.ghsa_id || null,
                package_name:      pkg.name || 'unknown',
                ecosystem:         pkg.ecosystem || null,
                manifest_path:     dep.manifest_path || null,
                scope:             dep.scope || null,
                summary:           advisory.summary || null,
                description:       advisory.description || null,
                cvss_score:        advisory.cvss?.score || null,
                vulnerable_range:  vuln.vulnerable_version_range || null,
                installed_version: vuln.vulnerable_version_range || null,
                fixed_version:     vuln.first_patched_version?.identifier || null,
                fix_available:     !!vuln.first_patched_version?.identifier,
                created_at:        alert.created_at,
                updated_at:        alert.updated_at,
                dismissed_at:      alert.dismissed_at || null,
                dismissed_reason:  alert.dismissed_reason || null,
                html_url:          alert.html_url
            };
        });
    } catch (error) {
        console.warn(`Dependabot full alerts not available for ${owner}/${repo}:`, error.message);
        return [];
    }
};

const triggerWorkflow = async (owner, repo, workflow_id, ref = 'main') => {
    if (!octokit) await init();
    try {
        await octokit.request('POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches', {
            owner,
            repo,
            workflow_id,
            ref
        });
        return { success: true };
    } catch (error) {
        console.error("GitHub Dispatch Error", error.message);
        throw error;
    }
};

const getWorkflowRunsForMetrics = async (owner, repo) => {
    if (!octokit) await init();
    try {
        const response = await octokit.request('GET /repos/{owner}/{repo}/actions/runs', {
            owner,
            repo,
            per_page: 100,
            status: 'completed'
        });
        return response.data.workflow_runs;
    } catch (error) {
        console.error("GitHub Actions Metrics Fetch Error", error.message);
        return [];
    }
};

module.exports = {
    init,
    getRepoStats,
    getRecentCommits,
    getWorkflowStats,
    getUserRepositories,
    getUserInfo,
    getVulnerabilityStats,
    getDependabotAlerts,
    triggerWorkflow,
    getWorkflowRunsForMetrics
};
