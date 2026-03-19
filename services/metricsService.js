// Database connection centralized in database.js

class MetricsService {
    constructor() {
        this.db = require('./database');
    }

    // Convert SQL rows to trend
    _fillSyntheticDays(rows, days = 7) {
        const out = [];
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            const match = rows.find(r => r.date === dateStr);
            out.push({
                timestamp: d.toISOString(),
                value: match ? match.value : 0
            });
        }
        return out;
    }

    async getDoraMetrics(repo = null, days = 7) {
        return new Promise((resolve, reject) => {
            const safeDays = Number(days) || 7;

            // 1) Pull raw runs for charts (latest N runs in range)
            const rawSql = `
      SELECT
        run_started_at,
        created_at,
        updated_at,
        conclusion
      FROM workflow_runs
      WHERE datetime(run_started_at) >= datetime('now', '-' || ? || ' days')
      ${repo ? 'AND repository = ?' : ''}
      ORDER BY datetime(run_started_at) DESC
      LIMIT 60
    `;

            const rawParams = repo ? [safeDays, repo] : [safeDays];

            this.db.all(rawSql, rawParams, (rawErr, rawRuns) => {
                if (rawErr) return reject(rawErr);

                // 2) Aggregate KPIs
                const kpiSql = `
        SELECT
          COUNT(*) as total_runs,
          SUM(CASE WHEN conclusion = 'success' THEN 1 ELSE 0 END) as successful_runs,
          AVG(duration_seconds) as avg_duration_seconds
        FROM workflow_runs
        WHERE datetime(run_started_at) >= datetime('now', '-' || ? || ' days')
        ${repo ? 'AND repository = ?' : ''}
      `;

                const kpiParams = repo ? [safeDays, repo] : [safeDays];

                this.db.get(kpiSql, kpiParams, (kpiErr, row) => {
                    if (kpiErr) return reject(kpiErr);

                    const totalRuns = row?.total_runs || 0;
                    const successfulRuns = row?.successful_runs || 0;
                    const avgDurationSeconds = row?.avg_duration_seconds || 0;

                    const successRate = totalRuns > 0 ? Math.round((successfulRuns / totalRuns) * 100) : 0;
                    const avgBuildDuration = avgDurationSeconds > 0 ? Math.round((avgDurationSeconds / 60) * 10) / 10 : 0;

                    resolve({
                        avgBuildDuration,
                        totalDeployments: successfulRuns,
                        successRate,
                        rawRuns: rawRuns || []
                    });
                });
            });
        });
    }

    // --------------------------------------------------------------------------
// NEW: Sync workflow runs from GitHub Actions into workflow_runs table
// --------------------------------------------------------------------------
async syncWorkflowRunsFromGitHub(repository, days = 7, userId = 1) {
    const safeDays = Number(days) || 7;

    if (!repository || !repository.includes('/')) {
        throw new Error('Invalid repository. Expected "owner/repo".');
    }

    const githubService = require('./github');

    // Initialize GitHub client using env token (or you can pass token in from server later)
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
        throw new Error('GITHUB_TOKEN is not configured in environment.');
    }
    await githubService.init(token);

    // Prefer the existing helper your repo already provides
    let workflowRuns = [];
    try {
        // Your github.js exports getWorkflowRunsForMetrics — use it
        const [owner, repo] = repository.split('/');
workflowRuns = await githubService.getWorkflowRunsForMetrics(owner, repo);
    } catch (e) {
        // Fallback: try triggerWorkflowRuns-like helper naming (just in case)
        throw new Error(`Failed to fetch workflow runs from GitHub: ${e.message}`);
    }

    // Normalize: allow either { workflow_runs: [...] } or [...]
    const runsArray = Array.isArray(workflowRuns)
        ? workflowRuns
        : (workflowRuns?.workflow_runs || workflowRuns?.data?.workflow_runs || []);

    console.log('[DORA SYNC] repository:', repository, 'days:', safeDays);
console.log('[DORA SYNC] runsArray length:', runsArray.length);
if (runsArray[0]) console.log('[DORA SYNC] first run id:', runsArray[0].id, 'name:', runsArray[0].name);

    // Create unique index so ON CONFLICT(user_id, run_id) works
    await new Promise((resolve, reject) => {
        this.db.run(
            `CREATE UNIQUE INDEX IF NOT EXISTS idx_workflow_runs_user_run ON workflow_runs(user_id, run_id)`,
            (err) => (err ? reject(err) : resolve())
        );
    });

    for (const r of runsArray) {
        const runId = r.id ?? r.run_id; // support either naming
        if (!runId) continue;

        const workflowId = r.workflow_id || null;
        const workflowName = r.name || r.workflow_name || r.display_title || null;
        const headBranch = r.head_branch || null;
        const headSha = r.head_sha || null;
        const status = r.status || null;
        const conclusion = r.conclusion || null;
        const event = r.event || null;
        const runNumber = r.run_number || null;
        const runAttempt = r.run_attempt || null;
        const runStartedAt = r.run_started_at || null;
        const createdAt = r.created_at || null;
        const updatedAt = r.updated_at || null;
        const htmlUrl = r.html_url || null;

        // owner column in your table is repo owner, not user owner
        const [owner] = repository.split('/');

        let durationSeconds = null;
        if (runStartedAt && updatedAt) {
            const start = new Date(runStartedAt);
            const end = new Date(updatedAt);
            durationSeconds = Math.max(0, Math.floor((end - start) / 1000));
        }

        const sql = `
            INSERT INTO workflow_runs (
              user_id, run_id, workflow_id, workflow_name, head_branch, head_sha, status, conclusion, event,
              run_number, run_attempt, run_started_at, created_at, updated_at, repository, owner, html_url,
              duration_seconds, jobs_count
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, run_id) DO UPDATE SET
              workflow_id=excluded.workflow_id,
              workflow_name=excluded.workflow_name,
              head_branch=excluded.head_branch,
              head_sha=excluded.head_sha,
              status=excluded.status,
              conclusion=excluded.conclusion,
              event=excluded.event,
              run_number=excluded.run_number,
              run_attempt=excluded.run_attempt,
              run_started_at=excluded.run_started_at,
              created_at=excluded.created_at,
              updated_at=excluded.updated_at,
              repository=excluded.repository,
              owner=excluded.owner,
              html_url=excluded.html_url,
              duration_seconds=excluded.duration_seconds,
              jobs_count=excluded.jobs_count
        `;

        const params = [
            userId,
            runId,
            workflowId,
            workflowName,
            headBranch,
            headSha,
            status,
            conclusion,
            event,
            runNumber,
            runAttempt,
            runStartedAt,
            createdAt,
            updatedAt,
            repository,
            owner,
            htmlUrl,
            durationSeconds,
            0
        ];

        await new Promise((resolve, reject) => {
            this.db.run(sql, params, (err) => (err ? reject(err) : resolve()));
        });
    }

    return {
        repository,
        upserted: runsArray.length
    };
}
    getTrend(metricName, days = 7, repo = null) {
        return new Promise((resolve, reject) => {
            let sql = '';
            let params = repo ? [days, repo] : [days];
            const repoFilter = repo ? 'AND repository = ?' : '';

            if (metricName === 'deploy_frequency') {
                sql = `
                    SELECT DATE(run_started_at) as date, COUNT(*) as value
                    FROM workflow_runs
                    WHERE datetime(run_started_at) >= datetime('now', '-' || ? || ' days')
                    ${repoFilter}
                    AND conclusion = 'success'
                    GROUP BY date
                `;
            } else if (metricName === 'success_rate') {
                sql = `
                    SELECT DATE(run_started_at) as date, 
                    ROUND(SUM(CASE WHEN conclusion = 'success' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 1) as value
                    FROM workflow_runs
                    WHERE datetime(run_started_at) >= datetime('now', '-' || ? || ' days')
                    ${repoFilter}
                    GROUP BY date
                `;
            } else if (metricName === 'build_duration') {
                sql = `
                    SELECT DATE(run_started_at) as date, 
                    ROUND(AVG(duration_seconds) / 60.0, 1) as value
                    FROM workflow_runs
                    WHERE datetime(run_started_at) >= datetime('now', '-' || ? || ' days')
                    ${repoFilter}
                    GROUP BY date
                `;
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