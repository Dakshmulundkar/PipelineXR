CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    type TEXT NOT NULL,
    payload TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    source TEXT,
    message TEXT,
    level TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ci_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    status TEXT,
    start_time DATETIME,
    end_time DATETIME,
    logs TEXT
);

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    github_id TEXT UNIQUE,
    avatar_url TEXT,
    name TEXT,
    password_hash TEXT, -- Nullable for OAuth users
    last_login DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    metric_name TEXT NOT NULL,
    value REAL NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    metadata TEXT
);

CREATE TABLE IF NOT EXISTS test_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    run_id TEXT NOT NULL,
    suite_name TEXT NOT NULL,
    test_name TEXT NOT NULL,
    status TEXT NOT NULL,
    duration_ms INTEGER,
    retries INTEGER DEFAULT 0,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS deployments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    deployment_id TEXT NOT NULL,
    environment TEXT NOT NULL,
    status TEXT NOT NULL,
    start_time DATETIME,
    end_time DATETIME,
    commit_sha TEXT,
    metadata TEXT
);

CREATE TABLE IF NOT EXISTS pipeline_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    pipeline_id TEXT NOT NULL,
    status TEXT NOT NULL,
    start_time DATETIME,
    end_time DATETIME,
    stages TEXT,
    metadata TEXT
);

-- GitHub Actions Pipeline Monitoring Tables
CREATE TABLE IF NOT EXISTS github_webhooks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    event_type TEXT NOT NULL,
    delivery_id TEXT UNIQUE NOT NULL,
    payload TEXT NOT NULL,
    repository TEXT,
    workflow_id INTEGER,
    run_id INTEGER,
    status TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS workflow_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    run_id INTEGER UNIQUE NOT NULL,
    workflow_id INTEGER,
    workflow_name TEXT,
    head_branch TEXT,
    head_sha TEXT,
    status TEXT,
    conclusion TEXT,
    event TEXT,
    run_number INTEGER,
    run_attempt INTEGER,
    run_started_at DATETIME,
    created_at DATETIME,
    updated_at DATETIME,
    repository TEXT,
    owner TEXT,
    html_url TEXT,
    duration_seconds INTEGER,
    jobs_count INTEGER DEFAULT 0,
    risk_score REAL DEFAULT 0,
    risk_level TEXT DEFAULT 'Healthy',
    critical_vulns INTEGER DEFAULT 0,
    high_vulns INTEGER DEFAULT 0,
    medium_vulns INTEGER DEFAULT 0,
    low_vulns INTEGER DEFAULT 0,
    unknown_vulns INTEGER DEFAULT 0
);

-- Index for faster repository-based queries
CREATE INDEX IF NOT EXISTS idx_workflow_runs_repository ON workflow_runs(repository);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_user ON workflow_runs(user_id);

CREATE TABLE IF NOT EXISTS workflow_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    job_id INTEGER UNIQUE NOT NULL,
    run_id INTEGER NOT NULL,
    workflow_name TEXT,
    job_name TEXT,
    status TEXT,
    conclusion TEXT,
    started_at DATETIME,
    completed_at DATETIME,
    duration_seconds INTEGER,
    steps_count INTEGER DEFAULT 0,
    html_url TEXT,
    FOREIGN KEY (run_id) REFERENCES workflow_runs(run_id)
);

CREATE TABLE IF NOT EXISTS job_steps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    step_id INTEGER,
    job_id INTEGER NOT NULL,
    name TEXT,
    status TEXT,
    conclusion TEXT,
    number INTEGER,
    started_at DATETIME,
    completed_at DATETIME,
    duration_seconds INTEGER,
    FOREIGN KEY (job_id) REFERENCES workflow_jobs(job_id)
);

CREATE TABLE IF NOT EXISTS pipeline_analytics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    metric_name TEXT NOT NULL,
    value REAL NOT NULL,
    repository TEXT,
    workflow_name TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    metadata TEXT
);

CREATE TABLE IF NOT EXISTS vulnerabilities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    repository TEXT NOT NULL,
    scanner TEXT NOT NULL, -- e.g., 'snyk', 'trivy'
    cve_id TEXT,
    package_name TEXT,
    severity TEXT NOT NULL, -- 'critical', 'high', 'medium', 'low'
    description TEXT,
    remediation TEXT,
    installed_version TEXT,
    fixed_version TEXT,
    link TEXT,
    status TEXT DEFAULT 'open', -- 'open', 'resolved', 'ignored'
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_vuln_user_repo ON vulnerabilities(user_id, repository);

CREATE TABLE IF NOT EXISTS scan_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
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
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME
);
