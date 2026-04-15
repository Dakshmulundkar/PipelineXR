import axios from 'axios';

// In production (Netlify), VITE_API_BASE_URL is set to the Railway backend URL.
// In development, it's empty and all requests go through Vite's proxy to localhost:3001.
const API_ORIGIN = import.meta.env.VITE_API_BASE_URL || '';
const API_BASE = `${API_ORIGIN}/api`;

const apiInstance = axios.create({
    baseURL: API_ORIGIN,
    withCredentials: true,
});

// In production (Netlify auth), attach the GitHub token from localStorage to every Railway request
apiInstance.interceptors.request.use((config) => {
    const token = localStorage.getItem('gh_token');
    if (token && API_ORIGIN) {
        config.headers['x-github-token'] = token;
    }
    return config;
});

const get = (url) => apiInstance.get(url).then(res => res.data);

export const api = {
    // Auth — Railway handles OAuth flow, token stored in localStorage for API calls
    login: () => { window.location.href = `${API_ORIGIN}/auth/github`; },
    logout: () => {
        localStorage.removeItem('sf_auth');
        localStorage.removeItem('pxr_user');
        localStorage.removeItem('gh_token');
        // Fire-and-forget session cleanup on Railway — don't redirect through it
        fetch(`${API_ORIGIN}/auth/logout`, { credentials: 'include' }).catch(() => {});
        window.location.href = '/';
    },
    checkAuth: () => get(`${API_ORIGIN}/auth/user`),

    // GitHub
    getRepos: () => get(`${API_BASE}/github/user/repos`),

    // Metrics
    getLiveMetrics: (repo = null) => {
        let url = `${API_BASE}/metrics/live`;
        if (repo) url += `?repository=${encodeURIComponent(repo)}`;
        return get(url);
    },

    getDoraMetrics: (repo, timeRange = '7d') => {
        const repoParam = repo ? encodeURIComponent(repo) : 'all';
        // timeRange can be a string like '7d' or a number of days
        const isNumeric = typeof timeRange === 'number' || /^\d+$/.test(timeRange);
        const query = isNumeric ? `days=${timeRange}` : `range=${timeRange}`;
        return get(`${API_BASE}/metrics/dora/${repoParam}?${query}`);
    },

    // Pipeline
    getPipelineRuns: (limit = 20, repo = null) => {
        let url = `${API_BASE}/pipeline/runs?limit=${limit}`;
        if (repo) url += `&repository=${encodeURIComponent(repo)}`;
        return get(url);
    },

    getPipelineStats: (repo = null) => {
        let url = `${API_BASE}/pipelines/stats`;
        if (repo) url += `?repository=${encodeURIComponent(repo)}`;
        return get(url);
    },

    triggerPipeline: (data) => apiInstance.post(`${API_BASE}/ci/run`, data).then(res => res.data),

    // Metrics trend
    getMetricsTrend: (metricName, timeRange = '7d', repo = null) => {
        let url = `${API_BASE}/metrics/trend/${metricName}?timeRange=${timeRange}`;
        if (repo) url += `&repository=${encodeURIComponent(repo)}`;
        return get(url);
    },

    // Reports & Tests
    getTestReports: (repo = null) => {
        let url = `${API_BASE}/reports/tests`;
        if (repo) url += `?repository=${encodeURIComponent(repo)}`;
        return get(url);
    },

    syncReports: (repository) => apiInstance.post(`${API_BASE}/reports/sync`, { repository }).then(res => res.data),

    generateReportPdf: (repo = null) => {
        let url = `${API_BASE}/reports/download`;
        if (repo) url += `?repository=${encodeURIComponent(repo)}`;
        return apiInstance.get(url, { responseType: 'blob' }).then(res => res.data);
    },

    getSecuritySummary: (repo = null) => {
        let url = `${API_BASE}/security/summary`;
        if (repo) url += `?repository=${encodeURIComponent(repo)}`;
        return get(url);
    },

    getSnykIssues: (owner, repo) => get(`${API_BASE}/security/snyk/${owner}/${repo}`),
    getDependabotAlerts: (owner, repo) => get(`${API_BASE}/security/dependabot/${owner}/${repo}`),

    getSecurityInsights: (repo) => get(`${API_BASE}/security/insights?repository=${encodeURIComponent(repo)}`),

    // Pipeline sync — pulls runs from GitHub API into local DB
    syncPipeline: (repository) => apiInstance.post(`${API_BASE}/pipeline/sync`, { repository }).then(res => res.data),

    // Deployments
    getDeploymentStats: () => get(`${API_BASE}/deployments/stats`),

    // Trivy Advanced
    triggerTrivyScan: (data) => apiInstance.post(`${API_BASE}/security/scan/trivy`, data).then(res => res.data),
    owaspScan: (url) => apiInstance.post(`${API_BASE}/security/owasp-scan`, { url }).then(res => res.data),

    getVulnerabilities: (owner, repo) => get(`${API_BASE}/security/vulnerabilities/${owner}/${repo}`),
    getSBOM: (owner, repo) => get(`${API_BASE}/security/sbom/${owner}/${repo}`),

    // Workflows
    getWorkflows: (owner, repo) => get(`${API_BASE}/github/workflows?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`),

    // DORA sync — pulls runs from GitHub API into local DB
    syncDoraMetrics: (repository, days = 30) => apiInstance.post(`${API_BASE}/metrics/dora/sync`, { repository, days }).then(res => res.data),

    // Datadog
    getDatadogStatus: () => get(`${API_BASE}/datadog/status`),
    queryDatadogMetric: (metric, range = '24h', repository = null) => {
        let url = `${API_BASE}/datadog/metrics/query?metric=${encodeURIComponent(metric)}&range=${range}`;
        if (repository) url += `&repository=${encodeURIComponent(repository)}`;
        return get(url);
    },

    // Analytics
    trackPageView: (path, sessionId) => apiInstance.post(`${API_BASE}/analytics/pageview`, { path, sessionId }).catch(() => {}),
    getAnalyticsSummary: () => get(`${API_BASE}/analytics/summary`),

    // Uptime Monitor
    getMonitorSites: () => get(`${API_BASE}/monitor/sites`),
    addMonitorSite: (url, alert_email) => apiInstance.post(`${API_BASE}/monitor/sites`, { url, alert_email }).then(r => r.data),
    removeMonitorSite: (id) => apiInstance.delete(`${API_BASE}/monitor/sites/${id}`).then(r => r.data),
    getMonitorChecks: (id, hours = 24) => get(`${API_BASE}/monitor/sites/${id}/checks?hours=${hours}`),
    getMonitorStats: (id, hours = 24) => get(`${API_BASE}/monitor/sites/${id}/stats?hours=${hours}`),
    getMonitorIncidents: (id) => get(`${API_BASE}/monitor/sites/${id}/incidents`),
    sendMonitorVerification: (url, email) => apiInstance.post(`${API_BASE}/monitor/verify/send`, { url, email }).then(r => r.data),
    confirmMonitorVerification: (url, email, code) => apiInstance.post(`${API_BASE}/monitor/verify/confirm`, { url, email, code }).then(r => r.data),

    // AI / LLM
    getAiHealth: () => get(`${API_BASE}/ai/health`),
    getSecurityReview: (repository) => apiInstance.post(`${API_BASE}/ai/security-review`, { repository }).then(r => r.data),
    getPipelineEmail: (run_id, failed_steps = []) => apiInstance.post(`${API_BASE}/ai/pipeline-email`, { run_id, failed_steps }).then(r => r.data),
    getMonitorEmail: (site_id) => apiInstance.post(`${API_BASE}/ai/monitor-email`, { site_id }).then(r => r.data),
    getDoraInsights: (repo, range = '7d') => get(`${API_BASE}/ai/dora-insights/${encodeURIComponent(repo)}?range=${range}`),
    getIncidentResponse: (incident) => apiInstance.post(`${API_BASE}/ai/incident-response`, incident).then(r => r.data),
    getAiEmails: () => get(`${API_BASE}/ai/emails`),

    // IDS — Intrusion Detection (admin only)
    getIdsEvents: (limit = 100) => get(`${API_BASE}/ids/events?limit=${limit}`),
    getIdsBlocked: () => get(`${API_BASE}/ids/blocked`),
    getIdsTraffic: () => get(`${API_BASE}/ids/traffic`),
    unblockIp: (ip) => apiInstance.delete(`${API_BASE}/ids/blocked/${encodeURIComponent(ip)}`).then(r => r.data),

    // Visitor Analytics (admin only)
    getVisitorSites: () => get(`${API_BASE}/visitor/sites`),
    getVisitorScript: (siteId) => get(`${API_BASE}/visitor/script/${siteId}`),
    getVisitorStats: (siteId, hours = 24) => get(`${API_BASE}/visitor/stats/${siteId}?hours=${hours}`),
};

export default api;
