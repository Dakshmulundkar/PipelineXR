const db = require('./database');

class TestService {
    constructor() {
        this.db = db;
    }

    async getTestReports() {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT run_id, suite_name,
                    COUNT(*) as total_tests,
                    SUM(CASE WHEN status = 'passed' THEN 1 ELSE 0 END) as passed,
                    SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
                    SUM(CASE WHEN status = 'flaky' THEN 1 ELSE 0 END) as flaky,
                    AVG(duration_ms) as avg_duration_ms,
                    MAX(timestamp) as latest_run
                FROM test_runs
                GROUP BY run_id, suite_name
                ORDER BY latest_run DESC LIMIT 15
            `;
            this.db.all(sql, [], (err, rows) => {
                if (err) return reject(err);
                resolve((rows || []).map(row => ({
                    ...row,
                    pass_rate: row.total_tests > 0 ? Math.round((row.passed / row.total_tests) * 100) : 0
                })));
            });
        });
    }

    async getTestPassRate() {
        return new Promise((resolve) => {
            const sql = `
                SELECT SUM(CASE WHEN status = 'passed' THEN 1 ELSE 0 END) as passed, COUNT(*) as total
                FROM test_runs WHERE timestamp >= NOW() - INTERVAL '7 days'
            `;
            this.db.get(sql, [], (err, row) => {
                if (err || !row || row.total === 0) return resolve(0);
                resolve(Math.round((row.passed / row.total) * 100));
            });
        });
    }
}

module.exports = new TestService();
