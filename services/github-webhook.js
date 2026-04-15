const crypto = require('crypto');
const db = require('./database');
const pipelineLogger = require('./pipeline-logger');
const { calculateDeploymentRiskScore, getRiskLevel } = require('./security/securityScanner');
const datadog = require('./datadog');
require('dotenv').config();

let Octokit;

class GitHubWebhookService {
    constructor() {
        this.db = db;
        this.secret = process.env.GITHUB_WEBHOOK_SECRET || 'development-secret';
        this.octokit = null;
        this.octokitReady = this.initOctokit();
    }

    async initOctokit() {
        try {
            if (!Octokit) {
                const octokitModule = await import('octokit');
                Octokit = octokitModule.Octokit;
            }
            const token = process.env.GITHUB_TOKEN;
            if (token) {
                this.octokit = new Octokit({ auth: token });
                console.log('GitHub Webhook Service initialized with token');
            }
        } catch (error) {
            console.error('Failed to initialize Octokit:', error);
        }
    }

    async getUserIdByOwner(ownerGithubId) {
        return new Promise((resolve) => {
            this.db.get('SELECT id FROM users WHERE github_id = ?', [ownerGithubId.toString()], (err, row) => {
                resolve(row?.id || null);
            });
        });
    }

    validateSignature(payload, signature) {
        if (!this.secret) return true;
        const expectedSignature = 'sha256=' + crypto.createHmac('sha256', this.secret).update(payload).digest('hex');
        return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
    }

    async handleWebhook(eventType, deliveryId, payload, signature, rawBody) {
        pipelineLogger.webhook(eventType, deliveryId, 'PROCESSING', 'Starting');
        if (signature && !this.validateSignature(rawBody, signature)) throw new Error('Invalid signature');

        const ownerId = payload.repository?.owner?.id;
        const userId = await this.getUserIdByOwner(ownerId);
        if (!userId) {
            console.warn(`[WEBHOOK] Unknown GitHub owner ID ${ownerId} — skipping data storage`);
            return { status: 'skipped', reason: 'unknown_user' };
        }

        await this.storeWebhookEvent(eventType, deliveryId, payload, userId);

        try {
            switch (eventType) {
                case 'workflow_run': await this.handleWorkflowRunEvent(payload, userId); break;
                case 'workflow_job': await this.handleWorkflowJobEvent(payload, userId); break;
                case 'push': this.handlePushEvent(payload, userId); break; // fire-and-forget
                default: pipelineLogger.webhook(eventType, deliveryId, 'SKIPPED', 'Unhandled');
            }
            return { status: 'processed' };
        } catch (error) {
            pipelineLogger.error('WEBHOOK_PROCESSING', error);
            throw error;
        }
    }

    async storeWebhookEvent(eventType, deliveryId, payload, userId) {
        return new Promise((resolve, reject) => {
            const repo = payload.repository?.full_name || 'unknown';
            const workflowId = payload.workflow_run?.id || payload.workflow?.id || null;
            const runId = payload.workflow_run?.run_id || payload.run_id || null;
            const status = payload.workflow_run?.status || payload.status || 'unknown';
            this.db.run(
                `INSERT INTO github_webhooks (user_id, event_type, delivery_id, payload, repository, workflow_id, run_id, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT(delivery_id) DO NOTHING`,
                [userId, eventType, deliveryId, JSON.stringify(payload), repo, workflowId, runId, status],
                (err) => (err ? reject(err) : resolve())
            );
        });
    }

    async handleWorkflowRunEvent(payload, userId) {
        const run = payload.workflow_run;
        try {
            await this.storeWorkflowRun(run, payload.repository, userId);
            if (this.octokit && (run.status === 'completed' || run.status === 'in_progress')) {
                await this.fetchWorkflowJobs(run.id, payload.repository, userId);
            }
            await this.updateRunAnalytics(run, userId);
            if (run.status === 'completed') {
                const duration = run.run_started_at && run.updated_at
                    ? Math.floor((new Date(run.updated_at) - new Date(run.run_started_at)) / 1000) : 0;
                datadog.trackPipelineRun({
                    repository: payload.repository?.full_name,
                    conclusion: run.conclusion,
                    duration_seconds: duration,
                    head_branch: run.head_branch,
                    workflow_name: run.name,
                    run_number: run.run_number,
                }).catch(() => {});

                // Send failure email alert
                if (run.conclusion === 'failure') {
                    const notifier = require('./emailNotifier');
                    const failedSteps = [];
                    // Collect failed job names from DB
                    this.db.all(
                        `SELECT job_name FROM workflow_jobs WHERE run_id = ? AND conclusion = 'failure'`,
                        [run.id],
                        (err, rows) => {
                            if (!err && rows) rows.forEach(r => failedSteps.push(r.job_name));
                            notifier.sendPipelineFailureEmail(userId, {
                                run_id: run.id,
                                repository: payload.repository?.full_name,
                                workflow_name: run.name,
                                conclusion: run.conclusion,
                                duration_seconds: duration,
                                head_branch: run.head_branch,
                                triggering_actor: run.triggering_actor?.login,
                                head_commit_message: run.head_commit?.message,
                                html_url: run.html_url,
                            }, failedSteps).catch(() => {});
                        }
                    );
                }
            }
        } catch (error) {
            console.error('Workflow run processing error:', error);
        }
    }

    async handleWorkflowJobEvent(payload, userId) {
        const job = payload.workflow_job;
        try {
            await this.storeWorkflowJob(job, userId);
            if (job.status === 'completed' && job.steps) await this.storeJobSteps(job, userId);
        } catch (error) {
            console.error('Job processing error:', error);
        }
    }

    // Fire-and-forget: auto-scan repo on push, then email if critical/high vulns found
    handlePushEvent(payload, userId) {
        const repo = payload.repository?.full_name;
        const commitSha = payload.after || payload.head_commit?.id || '';
        if (!repo || !commitSha || commitSha === '0000000000000000000000000000000000000000') return;

        // Run in background — don't block webhook response
        setImmediate(async () => {
            try {
                console.log(`[WEBHOOK] Auto-scanning ${repo} on push (commit: ${commitSha.slice(0, 7)})`);
                const trivyLite = require('./security/trivyLite');
                const token = process.env.GITHUB_TOKEN;
                if (!token) return;

                // Clone and scan via TrivyLite (lightweight, no Docker needed)
                const repoUrl = `https://github.com/${repo}`;
                const results = await trivyLite.scanRemoteRepo(repoUrl, token).catch(() => []);

                if (results.length > 0) {
                    // Persist to DB
                    const securityService = require('./securityService');
                    for (const v of results) {
                        await securityService.addVulnerability(
                            userId, repo,
                            v.scanner || 'trivy:vuln',
                            v.id || v.cve_id || null,
                            v.package_name || null,
                            (v.severity || 'low').toLowerCase(),
                            v.description || null,
                            v.remediation || null,
                            v.installed_version || null,
                            v.fixed_version || null,
                            v.primary_url || null
                        ).catch(() => {});
                    }

                    // Send email alert (deduped by commitSha)
                    const notifier = require('./emailNotifier');
                    await notifier.sendSecurityAlertEmail(userId, repo, results, commitSha).catch(() => {});
                }
            } catch (e) {
                console.warn(`[WEBHOOK] Auto-scan failed for ${repo}:`, e.message);
            }
        });
    }

    async storeWorkflowRun(run, repository, userId) {
        return new Promise((resolve, reject) => {
            const duration = run.run_started_at && run.updated_at
                ? Math.floor((new Date(run.updated_at) - new Date(run.run_started_at)) / 1000) : null;
            const deployRisk = calculateDeploymentRiskScore({ status: run.conclusion || run.status, durationSeconds: duration || 0 });
            const riskLevel = getRiskLevel(deployRisk);
            const commitMsg = run.head_commit?.message || null;
            const commitAuthor = run.head_commit?.author?.name || null;
            const actor = run.triggering_actor?.login || null;

            this.db.run(
                `INSERT INTO workflow_runs
                 (user_id, run_id, workflow_id, workflow_name, head_branch, head_sha, status, conclusion,
                  event, run_number, run_attempt, run_started_at, created_at, updated_at,
                  repository, owner, html_url, duration_seconds, jobs_count,
                  risk_score, risk_level, head_commit_message, head_commit_author, triggering_actor)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT(user_id, run_id) DO UPDATE SET
                    status=EXCLUDED.status, conclusion=EXCLUDED.conclusion,
                    updated_at=EXCLUDED.updated_at, duration_seconds=EXCLUDED.duration_seconds,
                    risk_score=EXCLUDED.risk_score, risk_level=EXCLUDED.risk_level`,
                [userId, run.id, run.workflow_id, run.name, run.head_branch, run.head_sha,
                 run.status, run.conclusion, run.event, run.run_number, run.run_attempt,
                 run.run_started_at, run.created_at, run.updated_at,
                 repository.full_name, repository.owner.login, run.html_url,
                 duration, run.jobs || 0, deployRisk, riskLevel, commitMsg, commitAuthor, actor],
                (err) => (err ? reject(err) : resolve())
            );
        });
    }

    async fetchWorkflowJobs(runId, repository, userId) {
        await this.octokitReady;
        if (!this.octokit) return;
        try {
            const { data: jobs } = await this.octokit.request('GET /repos/{owner}/{repo}/actions/runs/{run_id}/jobs', {
                owner: repository.owner.login, repo: repository.name, run_id: runId, per_page: 100
            });
            for (const job of jobs.jobs) {
                await this.storeWorkflowJob(job, userId);
                if (job.status === 'completed' && job.steps) await this.storeJobSteps(job, userId);
            }
        } catch (error) {
            console.error(`Failed to fetch jobs for run ${runId}:`, error.message);
        }
    }

    async storeWorkflowJob(job, userId) {
        return new Promise((resolve, reject) => {
            const duration = job.started_at && job.completed_at
                ? Math.floor((new Date(job.completed_at) - new Date(job.started_at)) / 1000) : null;
            this.db.run(
                `INSERT INTO workflow_jobs
                 (user_id, job_id, run_id, workflow_name, job_name, status, conclusion,
                  started_at, completed_at, duration_seconds, steps_count, html_url)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT(job_id) DO UPDATE SET
                    status=EXCLUDED.status, conclusion=EXCLUDED.conclusion,
                    completed_at=EXCLUDED.completed_at, duration_seconds=EXCLUDED.duration_seconds,
                    steps_count=EXCLUDED.steps_count`,
                [userId, job.id, job.run_id, job.workflow_name, job.name, job.status, job.conclusion,
                 job.started_at, job.completed_at, duration, job.steps ? job.steps.length : 0, job.html_url],
                (err) => (err ? reject(err) : resolve())
            );
        });
    }

    async storeJobSteps(job, userId) {
        if (!job.steps) return;
        for (const step of job.steps) await this.storeJobStep(step, job.id, userId);
    }

    async storeJobStep(step, jobId, userId) {
        return new Promise((resolve, reject) => {
            const duration = step.started_at && step.completed_at
                ? Math.floor((new Date(step.completed_at) - new Date(step.started_at)) / 1000) : null;
            this.db.run(
                `INSERT INTO job_steps
                 (user_id, step_id, job_id, name, status, conclusion, number, started_at, completed_at, duration_seconds)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT(user_id, job_id, number) DO UPDATE SET
                    status=EXCLUDED.status, conclusion=EXCLUDED.conclusion,
                    completed_at=EXCLUDED.completed_at, duration_seconds=EXCLUDED.duration_seconds`,
                [userId, step.id || null, jobId, step.name, step.status, step.conclusion,
                 step.number, step.started_at, step.completed_at, duration],
                (err) => (err ? reject(err) : resolve())
            );
        });
    }

    async updateRunAnalytics(run, userId) {
        if (run.status !== 'completed') return;
        const analytics = [
            { name: 'workflow_success_rate', value: run.conclusion === 'success' ? 100 : 0 },
            { name: 'workflow_duration', value: run.run_started_at && run.updated_at ? Math.floor((new Date(run.updated_at) - new Date(run.run_started_at)) / 1000) : 0 }
        ];
        for (const metric of analytics) {
            await this.storeAnalytics(userId, metric.name, metric.value, run.name, run.repository?.full_name);
        }
    }

    async storeAnalytics(userId, metricName, value, workflowName, repository) {
        return new Promise((resolve, reject) => {
            this.db.run(
                `INSERT INTO pipeline_analytics (user_id, metric_name, value, workflow_name, repository) VALUES (?, ?, ?, ?, ?)`,
                [userId, metricName, value, workflowName, repository],
                (err) => (err ? reject(err) : resolve())
            );
        });
    }

    async getRecentWorkflowRuns(limit = 50, repository = null, userId = null) {
        return new Promise(async (resolve, reject) => {
            let sql = `SELECT * FROM workflow_runs WHERE 1=1 `;
            const params = [];
            if (repository) { sql += `AND repository = ? `; params.push(repository); }
            if (userId) { sql += `AND user_id = ? `; params.push(userId); }
            sql += `ORDER BY run_started_at DESC LIMIT ?`;
            params.push(limit);

            this.db.all(sql, params, async (err, rows) => {
                if (err) return reject(err);
                try {
                    const runsWithStages = await Promise.all((rows || []).map(async (run) => {
                        const jobs = await new Promise((res) => {
                            this.db.all(
                                `SELECT job_id, job_name, status, conclusion, started_at, completed_at, duration_seconds, html_url FROM workflow_jobs WHERE run_id = ? ORDER BY started_at`,
                                [run.run_id], (err, jobsRows) => res(err ? [] : jobsRows)
                            );
                        });
                        const stages = (jobs || []).map(job => ({
                            name: job.job_name, status: job.conclusion || job.status || 'pending',
                            duration: job.duration_seconds || 0, job_id: job.job_id, html_url: job.html_url || null
                        }));
                        return { ...run, stages };
                    }));
                    resolve(runsWithStages);
                } catch (e) { reject(e); }
            });
        });
    }

    async getWorkflowRunDetails(runId, userId = null) {
        return new Promise(async (resolve, reject) => {
            try {
                let runSql = `SELECT * FROM workflow_runs WHERE run_id = ?`;
                const params = [runId];
                if (userId) { runSql += ` AND user_id = ?`; params.push(userId); }
                this.db.get(runSql, params, async (err, run) => {
                    if (err || !run) return resolve(null);
                    this.db.all(`SELECT * FROM workflow_jobs WHERE run_id = ? ORDER BY started_at`, [runId], async (err, jobs) => {
                        if (err) return reject(err);
                        const jobsWithSteps = [];
                        for (const job of (jobs || [])) {
                            const steps = await new Promise((res) => {
                                this.db.all(`SELECT * FROM job_steps WHERE job_id = ? ORDER BY number`, [job.job_id], (err, s) => res(s || []));
                            });
                            jobsWithSteps.push({ ...job, steps });
                        }
                        resolve({ ...run, jobs: jobsWithSteps });
                    });
                });
            } catch (error) { reject(error); }
        });
    }

    async getPipelineAnalytics(timeRange = '7d', userId = null) {
        return new Promise((resolve, reject) => {
            const intervalMap = { '24h': '1 day', '7d': '7 days', '30d': '30 days' };
            const interval = intervalMap[timeRange] || '7 days';
            let sql = `SELECT metric_name, AVG(value) as avg_value, COUNT(*) as count FROM pipeline_analytics WHERE timestamp >= NOW() - INTERVAL '${interval}'`;
            const params = [];
            if (userId) { sql += ` AND user_id = ?`; params.push(userId); }
            sql += ` GROUP BY metric_name`;
            this.db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
        });
    }

    close() {}
}

module.exports = GitHubWebhookService;
