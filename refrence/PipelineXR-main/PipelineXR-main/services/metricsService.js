// Database connection centralized in database.js
const path = require('path');

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

    async getDoraMetrics(repo = null) {
        return new Promise((resolve, reject) => {
            const sql = `
                WITH last_7d AS (
                    SELECT * FROM workflow_runs 
                    WHERE datetime(run_started_at) >= datetime('now', '-7 days')
                    ${repo ? 'AND repository = ?' : ''}
                )
                SELECT 
                    COUNT(*) as total_runs,
                    SUM(CASE WHEN conclusion = 'success' THEN 1 ELSE 0 END) as successful_runs,
                    SUM(CASE WHEN conclusion = 'failure' THEN 1 ELSE 0 END) as failed_runs,
                    AVG(duration_seconds) as avg_duration,
                    COUNT(DISTINCT DATE(run_started_at)) as active_days
                FROM last_7d
            `;

            const params = repo ? [days, repo] : [days];
            this.db.get(sql, params, (err, row) => {
                if (err) return reject(err);

                // If there's no data, return zeros instead of crashing
                if (!row || row.total_runs === 0) {
                    return resolve({
                        deploys: 0,
                        changeFailureRate: 0,
                        mttr: '0m',
                        leadTime: '0h',
                        successRate: 0,
                        testPassRate: 0,
                        activeIncidents: 0,
                        queueLength: 0
                    });
                }

                const successRate = Math.round((row.successful_runs / row.total_runs) * 100);
                const failureRate = Math.round((row.failed_runs / row.total_runs) * 100);

                // Estimate MTTR -> if failure rate is high, MTTR is likely higher
                const mttrMinutes = row.failed_runs > 0 ? Math.round((row.avg_duration || 300) / 60) * 2 : 0;

                resolve({
                    deploys: row.successful_runs,
                    changeFailureRate: failureRate,
                    mttr: `${mttrMinutes}m`,
                    leadTime: `${((row.avg_duration || 0) / 3600).toFixed(1)}h`,
                    successRate: successRate,
                    testPassRate: 0,
                    activeIncidents: 0,
                    queueLength: 0
                });
            });
        });
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
