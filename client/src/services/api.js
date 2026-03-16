import axios from 'axios';

const API_BASE = '/api';

const apiInstance = axios.create({
    withCredentials: true,
});

const get = (url) => apiInstance.get(url).then(res => res.data);

export const api = {
    // Auth - These are at root on server
    login: () => { window.location.href = `/auth/github`; },
    logout: () => { window.location.href = `/auth/logout`; },
    checkAuth: () => get(`/auth/user`),

    // GitHub
    getRepos: () => get(`${API_BASE}/github/user/repos`),

    // Metrics
    getLiveMetrics: (repo = null) => {
        let url = `${API_BASE}/metrics/live`;
        if (repo) url += `?repository=${encodeURIComponent(repo)}`;
        return get(url);
    },

    getDoraMetrics: (repo, timeRange = '7d') => {
        let url = `${API_BASE}/metrics/dora/${encodeURIComponent(repo)}?range=${timeRange}`;
        return get(url);
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
    getTestReports: () => get(`${API_BASE}/reports/tests`),

    // Security Summary
    getSecuritySummary: (repo = null) => {
        let url = `${API_BASE}/security/summary`;
        if (repo) url += `?repository=${encodeURIComponent(repo)}`;
        return get(url);
    },

    getSnykIssues: (owner, repo) => get(`${API_BASE}/security/snyk/${owner}/${repo}`),
    getDependabotAlerts: (owner, repo) => get(`${API_BASE}/security/dependabot/${owner}/${repo}`),

    getSecurityInsights: (repo) => get(`${API_BASE}/security/insights?repository=${encodeURIComponent(repo)}`),

    // Reports PDF
    generateReportPdf: () => apiInstance.get(`${API_BASE}/reports/pdf`, { responseType: 'blob' }).then(res => res.data),

    // Deployments
    getDeploymentStats: () => get(`${API_BASE}/deployments/stats`),

    // Trivy Advanced
    triggerTrivyScan: (data) => apiInstance.post(`${API_BASE}/security/scan/trivy`, data).then(res => res.data),

    getVulnerabilities: (owner, repo) => get(`${API_BASE}/security/vulnerabilities/${owner}/${repo}`),
    getSBOM: (owner, repo) => get(`${API_BASE}/security/sbom/${owner}/${repo}`)
};

export default api;
