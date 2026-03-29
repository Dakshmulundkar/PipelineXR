const { Pool } = require('pg');

/**
 * Initialize PostgreSQL database — creates all tables if they don't exist.
 * Safe to call on every startup (all statements use IF NOT EXISTS).
 */
async function initializeDatabase() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost')
            ? false
            : { rejectUnauthorized: false },
    });

    const client = await pool.connect();
    try {
        console.log('[DB] Running schema initialization...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email TEXT UNIQUE,
                github_id TEXT UNIQUE,
                avatar_url TEXT,
                name TEXT,
                password_hash TEXT,
                last_login TIMESTAMPTZ,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS events (
                id SERIAL PRIMARY KEY,
                user_id INTEGER,
                type TEXT NOT NULL,
                payload TEXT,
                timestamp TIMESTAMPTZ DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS logs (
                id SERIAL PRIMARY KEY,
                user_id INTEGER,
                source TEXT,
                message TEXT,
                level TEXT,
                timestamp TIMESTAMPTZ DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS ci_runs (
                id SERIAL PRIMARY KEY,
                user_id INTEGER,
                status TEXT,
                start_time TIMESTAMPTZ,
                end_time TIMESTAMPTZ,
                logs TEXT
            );

            CREATE TABLE IF NOT EXISTS metrics (
                id SERIAL PRIMARY KEY,
                user_id INTEGER,
                metric_name TEXT NOT NULL,
                value REAL NOT NULL,
                timestamp TIMESTAMPTZ DEFAULT NOW(),
                metadata TEXT
            );

            CREATE TABLE IF NOT EXISTS test_runs (
                id SERIAL PRIMARY KEY,
                user_id INTEGER,
                run_id TEXT NOT NULL,
                suite_name TEXT NOT NULL,
                test_name TEXT NOT NULL,
                status TEXT NOT NULL,
                duration_ms INTEGER,
                retries INTEGER DEFAULT 0,
                timestamp TIMESTAMPTZ DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS deployments (
                id SERIAL PRIMARY KEY,
                user_id INTEGER,
                deployment_id TEXT NOT NULL,
                environment TEXT NOT NULL,
                status TEXT NOT NULL,
                start_time TIMESTAMPTZ,
                end_time TIMESTAMPTZ,
                commit_sha TEXT,
                metadata TEXT
            );

            CREATE TABLE IF NOT EXISTS pipeline_runs (
                id SERIAL PRIMARY KEY,
                user_id INTEGER,
                pipeline_id TEXT NOT NULL,
                status TEXT NOT NULL,
                start_time TIMESTAMPTZ,
                end_time TIMESTAMPTZ,
                stages TEXT,
                metadata TEXT
            );

            CREATE TABLE IF NOT EXISTS github_webhooks (
                id SERIAL PRIMARY KEY,
                user_id INTEGER,
                event_type TEXT NOT NULL,
                delivery_id TEXT UNIQUE NOT NULL,
                payload TEXT NOT NULL,
                repository TEXT,
                workflow_id BIGINT,
                run_id BIGINT,
                status TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS workflow_runs (
                id SERIAL PRIMARY KEY,
                user_id INTEGER,
                run_id BIGINT NOT NULL,
                workflow_id BIGINT,
                workflow_name TEXT,
                head_branch TEXT,
                head_sha TEXT,
                status TEXT,
                conclusion TEXT,
                event TEXT,
                run_number INTEGER,
                run_attempt INTEGER,
                run_started_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ,
                updated_at TIMESTAMPTZ,
                repository TEXT,
                owner TEXT,
                html_url TEXT,
                head_commit_message TEXT,
                head_commit_author TEXT,
                triggering_actor TEXT,
                duration_seconds INTEGER,
                jobs_count INTEGER DEFAULT 0,
                risk_score REAL DEFAULT 0,
                risk_level TEXT DEFAULT 'Healthy',
                critical_vulns INTEGER DEFAULT 0,
                high_vulns INTEGER DEFAULT 0,
                medium_vulns INTEGER DEFAULT 0,
                low_vulns INTEGER DEFAULT 0,
                unknown_vulns INTEGER DEFAULT 0,
                UNIQUE(user_id, run_id)
            );

            CREATE TABLE IF NOT EXISTS workflow_jobs (
                id SERIAL PRIMARY KEY,
                user_id INTEGER,
                job_id BIGINT UNIQUE NOT NULL,
                run_id BIGINT NOT NULL,
                workflow_name TEXT,
                job_name TEXT,
                status TEXT,
                conclusion TEXT,
                started_at TIMESTAMPTZ,
                completed_at TIMESTAMPTZ,
                duration_seconds INTEGER,
                steps_count INTEGER DEFAULT 0,
                html_url TEXT
            );

            CREATE TABLE IF NOT EXISTS job_steps (
                id SERIAL PRIMARY KEY,
                user_id INTEGER,
                step_id BIGINT,
                job_id BIGINT NOT NULL,
                name TEXT,
                status TEXT,
                conclusion TEXT,
                number INTEGER,
                started_at TIMESTAMPTZ,
                completed_at TIMESTAMPTZ,
                duration_seconds INTEGER,
                UNIQUE(user_id, job_id, number)
            );

            CREATE TABLE IF NOT EXISTS pipeline_analytics (
                id SERIAL PRIMARY KEY,
                user_id INTEGER,
                metric_name TEXT NOT NULL,
                value REAL NOT NULL,
                repository TEXT,
                workflow_name TEXT,
                timestamp TIMESTAMPTZ DEFAULT NOW(),
                metadata TEXT
            );

            CREATE TABLE IF NOT EXISTS vulnerabilities (
                id SERIAL PRIMARY KEY,
                user_id INTEGER,
                repository TEXT NOT NULL,
                scanner TEXT NOT NULL,
                cve_id TEXT,
                package_name TEXT,
                severity TEXT NOT NULL,
                description TEXT,
                remediation TEXT,
                installed_version TEXT,
                fixed_version TEXT,
                link TEXT,
                status TEXT DEFAULT 'open',
                scan_type TEXT,
                file_path TEXT,
                timestamp TIMESTAMPTZ DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS scan_results (
                id SERIAL PRIMARY KEY,
                user_id INTEGER,
                repository TEXT NOT NULL,
                scan_type TEXT NOT NULL,
                status TEXT DEFAULT 'completed',
                findings_count INTEGER DEFAULT 0,
                critical_count INTEGER DEFAULT 0,
                high_count INTEGER DEFAULT 0,
                medium_count INTEGER DEFAULT 0,
                low_count INTEGER DEFAULT 0,
                scan_metadata TEXT,
                started_at TIMESTAMPTZ DEFAULT NOW(),
                completed_at TIMESTAMPTZ
            );

            CREATE TABLE IF NOT EXISTS page_views (
                id SERIAL PRIMARY KEY,
                user_id INTEGER,
                path TEXT NOT NULL,
                ip_hash TEXT,
                session_id TEXT,
                user_agent TEXT,
                timestamp TIMESTAMPTZ DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS monitored_sites (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                url TEXT NOT NULL,
                alert_email TEXT,
                is_up INTEGER DEFAULT 1,
                active INTEGER DEFAULT 1,
                consecutive_failures INTEGER DEFAULT 0,
                added_at TIMESTAMPTZ DEFAULT NOW(),
                last_checked TIMESTAMPTZ
            );

            CREATE TABLE IF NOT EXISTS uptime_checks (
                id SERIAL PRIMARY KEY,
                site_id INTEGER NOT NULL,
                is_up INTEGER NOT NULL,
                status_code INTEGER,
                response_time_ms INTEGER,
                error TEXT,
                checked_at TIMESTAMPTZ DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS uptime_incidents (
                id SERIAL PRIMARY KEY,
                site_id INTEGER NOT NULL,
                started_at TIMESTAMPTZ NOT NULL,
                resolved_at TIMESTAMPTZ,
                type TEXT DEFAULT 'outage'
            );

            CREATE TABLE IF NOT EXISTS visitor_events (
                id SERIAL PRIMARY KEY,
                site_id INTEGER NOT NULL,
                path TEXT,
                referrer TEXT,
                ip_hash TEXT,
                country TEXT,
                ua TEXT,
                session_id TEXT,
                timestamp TIMESTAMPTZ DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS ids_events (
                id SERIAL PRIMARY KEY,
                type TEXT NOT NULL,
                ip TEXT,
                detail TEXT,
                timestamp TIMESTAMPTZ DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS monitor_verifications (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                email TEXT NOT NULL,
                url TEXT NOT NULL,
                code TEXT NOT NULL,
                expires_at TIMESTAMPTZ NOT NULL,
                used BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
        `);

        // Indexes (IF NOT EXISTS is safe to re-run)
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_workflow_runs_repository ON workflow_runs(repository);
            CREATE INDEX IF NOT EXISTS idx_workflow_runs_user ON workflow_runs(user_id);
            CREATE INDEX IF NOT EXISTS idx_workflow_runs_user_run ON workflow_runs(user_id, run_id);
            CREATE INDEX IF NOT EXISTS idx_vuln_user_repo ON vulnerabilities(user_id, repository);
            CREATE INDEX IF NOT EXISTS idx_page_views_timestamp ON page_views(timestamp);
            CREATE INDEX IF NOT EXISTS idx_page_views_path ON page_views(path);
            CREATE INDEX IF NOT EXISTS idx_uptime_checks_site ON uptime_checks(site_id, checked_at);
            CREATE INDEX IF NOT EXISTS idx_monitored_sites_user ON monitored_sites(user_id);
            CREATE INDEX IF NOT EXISTS idx_visitor_events_site ON visitor_events(site_id, timestamp);
            CREATE INDEX IF NOT EXISTS idx_ids_events_timestamp ON ids_events(timestamp);
            CREATE INDEX IF NOT EXISTS idx_ids_events_ip ON ids_events(ip);
            CREATE INDEX IF NOT EXISTS idx_workflow_jobs_user_job ON workflow_jobs(user_id, job_id);
            CREATE INDEX IF NOT EXISTS idx_job_steps_user_job_num ON job_steps(user_id, job_id, number);
        `);

        console.log('[DB] Schema initialized successfully');

        // ── Live migrations (safe to re-run) ─────────────────────────────────
        // Drop NOT NULL on users.email — GitHub accounts with private emails
        // have null email, which previously caused upsertUser to fail and left
        // users with no dbId, making every API call return 401.
        try {
            await client.query(`ALTER TABLE users ALTER COLUMN email DROP NOT NULL`);
            console.log('[DB] Migration: users.email is now nullable');
        } catch (e) {
            // Postgres throws if the constraint doesn't exist — safe to ignore
            if (!e.message.includes('does not exist') && !e.message.includes('already')) {
                console.warn('[DB] Migration warning (email nullable):', e.message);
            }
        }
    } finally {
        client.release();
        await pool.end();
    }
}

module.exports = { initializeDatabase };
