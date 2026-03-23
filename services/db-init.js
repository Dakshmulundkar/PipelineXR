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
            'job_steps', 'pipeline_analytics', 'vulnerabilities', 'scan_results',
            'monitored_sites', 'uptime_checks', 'uptime_incidents'
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

            // Migrate workflow_runs unique constraint from run_id → (user_id, run_id)
            // We do this by recreating the table if the old single-column unique exists
            await new Promise(res => {
                db.all(`PRAGMA index_list(workflow_runs)`, (err, indexes) => {
                    if (err || !indexes) return res();
                    // Check if there's a unique index on just run_id (not the composite one)
                    const hasOldUnique = indexes.some(idx => idx.unique && idx.name !== 'idx_workflow_runs_user_run' && idx.name !== 'sqlite_autoindex_workflow_runs_1');
                    if (!hasOldUnique) return res();
                    // Recreate table with correct constraint
                    db.serialize(() => {
                        db.run(`ALTER TABLE workflow_runs RENAME TO workflow_runs_old`, (e) => {
                            if (e) return res();
                            db.run(`CREATE TABLE workflow_runs (
                                id INTEGER PRIMARY KEY AUTOINCREMENT,
                                user_id INTEGER,
                                run_id INTEGER NOT NULL,
                                workflow_id INTEGER, workflow_name TEXT, head_branch TEXT, head_sha TEXT,
                                status TEXT, conclusion TEXT, event TEXT, run_number INTEGER, run_attempt INTEGER,
                                run_started_at DATETIME, created_at DATETIME, updated_at DATETIME,
                                repository TEXT, owner TEXT, html_url TEXT,
                                head_commit_message TEXT, head_commit_author TEXT, triggering_actor TEXT,
                                duration_seconds INTEGER, jobs_count INTEGER DEFAULT 0,
                                risk_score REAL DEFAULT 0, risk_level TEXT DEFAULT 'Healthy',
                                critical_vulns INTEGER DEFAULT 0, high_vulns INTEGER DEFAULT 0,
                                medium_vulns INTEGER DEFAULT 0, low_vulns INTEGER DEFAULT 0, unknown_vulns INTEGER DEFAULT 0,
                                UNIQUE(user_id, run_id)
                            )`, (e2) => {
                                if (e2) return res();
                                db.run(`INSERT OR IGNORE INTO workflow_runs SELECT * FROM workflow_runs_old`, () => {
                                    db.run(`DROP TABLE workflow_runs_old`, () => res());
                                });
                            });
                        });
                    });
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
