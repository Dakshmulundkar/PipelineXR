const db = require('./database');

class AnalyticsService {
    constructor() {
        this.db = db;
    }

    async getTestReports(userId) {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT 
                    wj.run_id as run_id,
                    wj.job_name as suite_name,
                    wj.steps_count as total_tests,
                    (SELECT COUNT(*) FROM job_steps js WHERE js.job_id = wj.job_id AND js.conclusion = 'success' AND js.user_id = ?) as passed,
                    (SELECT COUNT(*) FROM job_steps js WHERE js.job_id = wj.job_id AND js.conclusion = 'failure' AND js.user_id = ?) as failed,
                    0 as flaky,
                    wj.duration_seconds * 1000 as avg_duration_ms,
                    wj.started_at as latest_run
                FROM workflow_jobs wj
                WHERE wj.status = 'completed' AND wj.user_id = ?
                ORDER BY wj.started_at DESC
                LIMIT 20
            `;

            this.db.all(sql, [userId, userId, userId], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows.map(row => ({
                        ...row,
                        duration: this.formatDuration(row.avg_duration_ms)
                    })));
                }
            });
        });
    }

    async getDetailedTestResults(userId) {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT 
                    js.step_id as run_id,
                    js.name as test_name,
                    wj.job_name as suite_name,
                    js.conclusion as status,
                    js.duration_seconds * 1000 as duration_ms,
                    js.started_at as timestamp
                FROM job_steps js
                JOIN workflow_jobs wj ON js.job_id = wj.job_id
                WHERE js.user_id = ?
                ORDER BY js.started_at DESC 
                LIMIT 20
            `;

            this.db.all(sql, [userId], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows.map(row => ({
                        ...row,
                        duration: this.formatDuration(row.duration_ms)
                    })));
                }
            });
        });
    }

    async getMetricsTrend(metricName, timeRange = '7d', userId = null) {
        return new Promise((resolve, reject) => {
            let timeFilter = '';
            switch (timeRange) {
                case '24h': timeFilter = "datetime(timestamp) >= datetime('now', '-1 day')"; break;
                case '7d': timeFilter = "datetime(timestamp) >= datetime('now', '-7 days')"; break;
                case '30d': timeFilter = "datetime(timestamp) >= datetime('now', '-30 days')"; break;
                case '90d': timeFilter = "datetime(timestamp) >= datetime('now', '-90 days')"; break;
                default: timeFilter = "datetime(timestamp) >= datetime('now', '-7 days')";
            }

            let sql = `SELECT value, timestamp FROM metrics WHERE metric_name = ? AND ${timeFilter}`;
            let params = [metricName];
            
            if (userId) {
                sql += ` AND user_id = ?`;
                params.push(userId);
            }
            sql += ` ORDER BY timestamp ASC`;

            this.db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    async getQualityMetrics(userId) {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT 
                    COUNT(*) as total_tests,
                    SUM(CASE WHEN conclusion = 'success' THEN 1 ELSE 0 END) as passed,
                    SUM(CASE WHEN conclusion = 'failure' THEN 1 ELSE 0 END) as failed,
                    0 as flaky,
                    ROUND(
                        (SUM(CASE WHEN conclusion = 'success' THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0)), 1
                    ) as pass_rate
                FROM job_steps 
                WHERE conclusion IS NOT NULL AND user_id = ?
            `;

            this.db.get(sql, [userId], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve({
                        total_tests: row?.total_tests || 0,
                        passed: row?.passed || 0,
                        failed: row?.failed || 0,
                        flaky: 0,
                        pass_rate: row?.pass_rate || 0
                    });
                }
            });
        });
    }

    formatDuration(ms) {
        if (ms < 1000) return `${ms}ms`;
        if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
        return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
    }

    async insertTestRun(userId, runData) {
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(`
                INSERT INTO test_runs (user_id, run_id, suite_name, test_name, status, duration_ms, retries)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `);

            stmt.run(userId, runData.run_id, runData.suite_name, runData.test_name, runData.status, runData.duration_ms, runData.retries || 0, (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
            stmt.finalize();
        });
    }

    async insertMetric(userId, name, value, metadata = null) {
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(`
                INSERT INTO metrics (user_id, metric_name, value, metadata)
                VALUES (?, ?, ?, ?)
            `);

            stmt.run(userId, name, value, metadata, (err) => {
                if (err) reject(err);
                else resolve();
            });
            stmt.finalize();
        });
    }

    async upsertUser(user) {
        return new Promise((resolve, reject) => {
            const sql = `
                INSERT INTO users (email, github_id, avatar_url, name, last_login)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(email) DO UPDATE SET
                    github_id = excluded.github_id,
                    avatar_url = excluded.avatar_url,
                    name = excluded.name,
                    last_login = excluded.last_login
                RETURNING *
            `;

            this.db.get(
                sql,
                [user.email, user.github_id, user.avatar_url, user.name, user.last_login],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
    }

    close() {
        if (this.db) {
            this.db.close();
        }
    }
}

module.exports = AnalyticsService;