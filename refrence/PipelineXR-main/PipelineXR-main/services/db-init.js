const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

/**
 * Initialize database with schema if tables don't exist
 * @param {string} dbPath - Path to SQLite database file
 * @returns {Promise<void>}
 */
function initializeDatabase(dbPath) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                reject(err);
                return;
            }
        });

        const schemaPath = path.join(__dirname, '..', 'schema.sql');
        
        if (!fs.existsSync(schemaPath)) {
            db.close();
            reject(new Error('schema.sql file not found'));
            return;
        }

        const schema = fs.readFileSync(schemaPath, 'utf8');
        
        // Helper to add column if it doesn't exist
        const ensureUserIdColumn = (table) => {
            return new Promise((res) => {
                db.all(`PRAGMA table_info(${table})`, (err, columns) => {
                    if (err || !columns) return res();
                    const hasUserId = columns.some(c => c.name === 'user_id');
                    if (!hasUserId) {
                        db.run(`ALTER TABLE ${table} ADD COLUMN user_id INTEGER`, () => res());
                    } else {
                        res();
                    }
                });
            });
        };

        const tablesWithUserId = [
            'events', 'logs', 'ci_runs', 'metrics', 'test_runs', 'deployments', 
            'pipeline_runs', 'github_webhooks', 'workflow_runs', 'workflow_jobs', 
            'job_steps', 'pipeline_analytics', 'vulnerabilities', 'scan_results'
        ];

        // Ensure new columns on vulnerabilities table
        const ensureVulnColumns = () => new Promise(res => {
            db.all(`PRAGMA table_info(vulnerabilities)`, (err, columns) => {
                if (err || !columns) return res();
                const names = columns.map(c => c.name);
                const pending = [];
                if (!names.includes('scan_type')) pending.push(`ALTER TABLE vulnerabilities ADD COLUMN scan_type TEXT`);
                if (!names.includes('file_path')) pending.push(`ALTER TABLE vulnerabilities ADD COLUMN file_path TEXT`);
                if (pending.length === 0) return res();
                let done = 0;
                for (const sql of pending) {
                    db.run(sql, () => { if (++done === pending.length) res(); });
                }
            });
        });

        db.serialize(async () => {
            for (const table of tablesWithUserId) {
                await new Promise(res => {
                    db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='${table}'`, (err, row) => {
                        if (row) {
                            ensureUserIdColumn(table).then(res);
                        } else {
                            res();
                        }
                    });
                });
            }

            // Ensure new columns on vulnerabilities
            await ensureVulnColumns();

            // Ensure risk columns on workflow_runs
            await new Promise(res => {
                db.all(`PRAGMA table_info(workflow_runs)`, (err, columns) => {
                    if (err || !columns) return res();
                    const names = columns.map(c => c.name);
                    const pending = [];
                    if (!names.includes('risk_score'))    pending.push(`ALTER TABLE workflow_runs ADD COLUMN risk_score REAL DEFAULT 0`);
                    if (!names.includes('risk_level'))    pending.push(`ALTER TABLE workflow_runs ADD COLUMN risk_level TEXT DEFAULT 'Healthy'`);
                    if (!names.includes('critical_vulns')) pending.push(`ALTER TABLE workflow_runs ADD COLUMN critical_vulns INTEGER DEFAULT 0`);
                    if (!names.includes('high_vulns'))    pending.push(`ALTER TABLE workflow_runs ADD COLUMN high_vulns INTEGER DEFAULT 0`);
                    if (!names.includes('medium_vulns'))  pending.push(`ALTER TABLE workflow_runs ADD COLUMN medium_vulns INTEGER DEFAULT 0`);
                    if (!names.includes('low_vulns'))     pending.push(`ALTER TABLE workflow_runs ADD COLUMN low_vulns INTEGER DEFAULT 0`);
                    if (!names.includes('unknown_vulns')) pending.push(`ALTER TABLE workflow_runs ADD COLUMN unknown_vulns INTEGER DEFAULT 0`);
                    if (pending.length === 0) return res();
                    let done = 0;
                    for (const sql of pending) {
                        db.run(sql, () => { if (++done === pending.length) res(); });
                    }
                });
            });

            db.exec(schema, (err) => {
                if (err) {
                    console.error('❌ Error applying schema:', err.message);
                    db.close();
                    reject(err);
                    return;
                }

                console.log('✅ Database schema verified/updated successfully');
                db.close();
                resolve();
            });
        });
    });
}

module.exports = { initializeDatabase };
