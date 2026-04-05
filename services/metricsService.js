const db = require('./database');

class MetricsService {
    constructor() {
        this.db = db;
    }

    _fillSyntheticDays(rows, days = 7) {
        const out = [];
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            const match = rows.find(r => r.date === dateStr);
            out.push({ timestamp: d.toISOString(), value: match ? match.value : 0 });
        }
        return out;
    }

    async getDoraMetrics(repo = null, days = 7, userId = null) {
        return new Promise((resolve, reject) => {
            const safeDays = Number(days) || 7;
            const userFilter = userId ? 'AND user_id = ?' : '';

            const rawSql = `
                SELECT run_started_at, created_at, updated_at, conclusion
                FROM workflow_runs
                WHERE run_started_at >= NOW() - (? * INTERVAL '1 day')
                ${repo ? 'AND repository = ?' : ''}
                ${userFilter}
                ORDER BY run_started_at DESC
            `;
            const rawParams = [safeDays, ...(repo ? [repo] : []), ...(userId ? [userId] : [])];

            this.db.all(rawSql, rawParams, (rawErr, rawRuns) => {
                if (rawErr) return reject(rawErr);

                const kpiSql = `
                    SELECT COUNT(*) as total_runs,
                        SUM(CASE WHEN conclusion = 'success' THEN 1 ELSE 0 END) as successful_runs,
                        AVG(duration_seconds) as avg_duration_seconds
                    FROM workflow_runs
                    WHERE run_started_at >= NOW() - (? * INTERVAL '1 day')
                    ${repo ? 'AND repository = ?' : ''}
                    ${userFilter}
                `;
                const kpiParams = [safeDays, ...(repo ? [repo] : []), ...(userId ? [userId] : [])];

                this.db.get(kpiSql, kpiParams, (kpiErr, row) => {
                    if (kpiErr) return reject(kpiErr);

                    const totalRuns = parseInt(row?.total_runs) || 0;
                    const successfulRuns = parseInt(row?.successful_runs) || 0;
                    const avgDurationSeconds = parseFloat(row?.avg_duration_seconds) || 0;
                    const successRate = totalRuns > 0 ? Math.round((successfulRuns / totalRuns) * 100) : 0;
                    const avgBuildDuration = avgDurationSeconds > 0 ? Math.round((avgDurationSeconds / 60) * 10) / 10 : 0;
                    const deploymentFrequency = safeDays > 0 ? Math.round((successfulRuns / safeDays) * 10) / 10 : 0;

                    const waitSql = `
                        SELECT AVG(EXTRACT(EPOCH FROM (run_started_at - created_at)) / 3600) as avg_wait_hours
                        FROM workflow_runs
                        WHERE run_started_at >= NOW() - (? * INTERVAL '1 day')
                        AND run_started_at IS NOT NULL AND created_at IS NOT NULL
                        ${repo ? 'AND repository = ?' : ''}
                        ${userFilter}
                    `;
                    const waitParams = [safeDays, ...(repo ? [repo] : []), ...(userId ? [userId] : [])];

                    this.db.get(waitSql, waitParams, (_waitErr, waitRow) => {
                        const avgWaitTime = waitRow?.avg_wait_hours > 0
                            ? Math.round(waitRow.avg_wait_hours * 100) / 100 : 0;
                        resolve({ avgBuildDuration, totalDeployments: successfulRuns, deploymentFrequency, avgWaitTime, successRate, rawRuns: rawRuns || [] });
                    });
                });
            });
        });
    }

    async syncWorkflowRunsFromGitHub(repository, days = 7, userId) {
        const safeDays = Number(days) || 7;
        if (!repository || !repository.includes('/')) throw new Error('Invalid repository. Expected "owner/repo".');

        const githubService = require('./github');
        const token = process.env.GITHUB_TOKEN;
        if (!token) throw new Error('GITHUB_TOKEN is not configured in environment.');
        await githubService.init(token);

        const [owner, repo] = repository.split('/');
        let workflowRuns = [];
        try {
            workflowRuns = await githubService.getWorkflowRunsForMetrics(owner, repo, safeDays);
        } catch (e) {
            throw new Error(`Failed to fetch workflow runs from GitHub: ${e.message}`);
        }

        const runsArray = Array.isArray(workflowRuns)
            ? workflowRuns
            : (workflowRuns?.workflow_runs || workflowRuns?.data?.workflow_runs || []);

        console.log('[DORA SYNC] repository:', repository, 'days:', safeDays, 'runs:', runsArray.length);

        for (const r of runsArray) {
            const runId = r.id ?? r.run_id;
            if (!runId) continue;

            let durationSeconds = null;
            if (r.run_started_at && r.updated_at) {
                durationSeconds = Math.max(0, Math.floor((new Date(r.updated_at) - new Date(r.run_started_at)) / 1000));
            }

            const sql = `
                INSERT INTO workflow_runs (
                    user_id, run_id, workflow_id, workflow_name, head_branch, head_sha, status, conclusion, event,
                    run_number, run_attempt, run_started_at, created_at, updated_at, repository, owner, html_url,
                    duration_seconds, jobs_count, head_commit_message, triggering_actor
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(user_id, run_id) DO UPDATE SET
                    workflow_id=EXCLUDED.workflow_id, workflow_name=EXCLUDED.workflow_name,
                    head_branch=EXCLUDED.head_branch, head_sha=EXCLUDED.head_sha,
                    status=EXCLUDED.status, conclusion=EXCLUDED.conclusion, event=EXCLUDED.event,
                    run_number=EXCLUDED.run_number, run_attempt=EXCLUDED.run_attempt,
                    run_started_at=EXCLUDED.run_started_at, created_at=EXCLUDED.created_at,
                    updated_at=EXCLUDED.updated_at, repository=EXCLUDED.repository,
                    owner=EXCLUDED.owner, html_url=EXCLUDED.html_url,
                    duration_seconds=EXCLUDED.duration_seconds, jobs_count=EXCLUDED.jobs_count,
                    head_commit_message=EXCLUDED.head_commit_message,
                    triggering_actor=EXCLUDED.triggering_actor
            `;
            const params = [
                userId, runId, r.workflow_id || null, r.name || r.workflow_name || null,
                r.head_branch || null, r.head_sha || null, r.status || null, r.conclusion || null,
                r.event || null, r.run_number || null, r.run_attempt || null,
                r.run_started_at || null, r.created_at || null, r.updated_at || null,
                repository, owner, r.html_url || null, durationSeconds, 0,
                r.head_commit?.message || null,
                r.triggering_actor?.login || null,
            ];

            await new Promise((resolve, reject) => {
                this.db.run(sql, params, (err) => (err ? reject(err) : resolve()));
            });
        }

        try {
            const doraData = await this.getDoraMetrics(repository, 7, userId);
            const datadog = require('./datadog');
            datadog.trackDoraMetrics(repository, doraData).catch(() => {});
        } catch (e) { /* non-fatal */ }

        return { repository, upserted: runsArray.length };
    }

    getTrend(metricName, days = 7, repo = null, userId = null) {
        return new Promise((resolve, reject) => {
            const userFilter = userId ? 'AND user_id = ?' : '';
            const repoFilter = repo ? 'AND repository = ?' : '';
            const params = [days, ...(repo ? [repo] : []), ...(userId ? [userId] : [])];
            let sql = '';

            if (metricName === 'deploy_frequency') {
                sql = `SELECT DATE(run_started_at) as date, COUNT(*) as value
                    FROM workflow_runs
                    WHERE run_started_at >= NOW() - (? * INTERVAL '1 day')
                    ${repoFilter} ${userFilter} AND conclusion = 'success' GROUP BY date`;
            } else if (metricName === 'success_rate') {
                sql = `SELECT DATE(run_started_at) as date,
                    ROUND(SUM(CASE WHEN conclusion = 'success' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 1) as value
                    FROM workflow_runs
                    WHERE run_started_at >= NOW() - (? * INTERVAL '1 day')
                    ${repoFilter} ${userFilter} GROUP BY date`;
            } else if (metricName === 'build_duration') {
                sql = `SELECT DATE(run_started_at) as date, ROUND(AVG(duration_seconds) / 60.0, 1) as value
                    FROM workflow_runs
                    WHERE run_started_at >= NOW() - (? * INTERVAL '1 day')
                    ${repoFilter} ${userFilter} GROUP BY date`;
            } else {
                return resolve([]);
            }

            this.db.all(sql, params, (err, rows) => {
                if (err) return reject(err);
                resolve(this._fillSyntheticDays(rows || [], days));
            });
        });
    }
}

module.exports = new MetricsService();
