const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();
const pipelineLogger = require('./pipeline-logger');
const { calculateDeploymentRiskScore, getRiskLevel } = require('./security/securityScanner');
const datadog = require('./datadog');
require('dotenv').config();

// Dynamic import for Octokit (ES Module)
let Octokit;

class GitHubWebhookService {
    constructor() {
        this.db = new sqlite3.Database('./devops.sqlite');
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
                resolve(row?.id || null); // null if user not found — caller must handle
            });
        });
    }

    // Validate webhook signature
    validateSignature(payload, signature) {
        if (!this.secret) return true;
        const expectedSignature = 'sha256=' + crypto.createHmac('sha256', this.secret).update(payload).digest('hex');
        return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
    }

    // Handle incoming webhook
    async handleWebhook(eventType, deliveryId, payload, signature, rawBody) {
        pipelineLogger.webhook(eventType, deliveryId, 'PROCESSING', 'Starting');
        
        if (signature && !this.validateSignature(rawBody, signature)) {
            throw new Error('Invalid signature');
        }

        const ownerId = payload.repository?.owner?.id;
        const userId = await this.getUserIdByOwner(ownerId);
        if (!userId) {
            console.warn(`[WEBHOOK] Unknown GitHub owner ID ${ownerId} — skipping data storage`);
            return { status: 'skipped', reason: 'unknown_user' };
        }

        // Store webhook event
        await this.storeWebhookEvent(eventType, deliveryId, payload, userId);

        try {
            switch (eventType) {
                case 'workflow_run':
                    await this.handleWorkflowRunEvent(payload, userId);
                    break;
                case 'workflow_job':
                    await this.handleWorkflowJobEvent(payload, userId);
                    break;
                default:
                    pipelineLogger.webhook(eventType, deliveryId, 'SKIPPED', 'Unhandled');
            }
            return { status: 'processed' };
        } catch (error) {
            pipelineLogger.error('WEBHOOK_PROCESSING', error);
            throw error;
        }
    }

    // Store webhook event in database
    async storeWebhookEvent(eventType, deliveryId, payload, userId) {
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(`
                INSERT INTO github_webhooks (user_id, event_type, delivery_id, payload, repository, workflow_id, run_id, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `);
            const repo = payload.repository?.full_name || 'unknown';
            const workflowId = payload.workflow_run?.id || payload.workflow?.id || null;
            const runId = payload.workflow_run?.run_id || payload.run_id || null;
            const status = payload.workflow_run?.status || payload.status || 'unknown';

            stmt.run(userId, eventType, deliveryId, JSON.stringify(payload), repo, workflowId, runId, status, (err) => {
                if (err) reject(err);
                else resolve();
            });
            stmt.finalize();
        });
    }

    // Handle workflow_run event
    async handleWorkflowRunEvent(payload, userId) {
        const run = payload.workflow_run;
        try {
            await this.storeWorkflowRun(run, payload.repository, userId);
            if (this.octokit && (run.status === 'completed' || run.status === 'in_progress')) {
                await this.fetchWorkflowJobs(run.id, payload.repository, userId);
            }
            await this.updateRunAnalytics(run, userId);

            // Send to Datadog when run completes
            if (run.status === 'completed') {
                const duration = run.run_started_at && run.updated_at
                    ? Math.floor((new Date(run.updated_at) - new Date(run.run_started_at)) / 1000)
                    : 0;
                datadog.trackPipelineRun({
                    repository: payload.repository?.full_name,
                    conclusion: run.conclusion,
                    duration_seconds: duration,
                    head_branch: run.head_branch,
                    workflow_name: run.name,
                    run_number: run.run_number,
                }).catch(() => {});
            }
        } catch (error) {
            console.error('Workflow run processing error:', error);
        }
    }

    // Handle workflow_job event
    async handleWorkflowJobEvent(payload, userId) {
        const job = payload.workflow_job;
        try {
            await this.storeWorkflowJob(job, userId);
            if (job.status === 'completed' && job.steps) {
                await this.storeJobSteps(job, userId);
            }
        } catch (error) {
            console.error('Job processing error:', error);
        }
    }

    // Store workflow run in database
    async storeWorkflowRun(run, repository, userId) {
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(`
                INSERT OR REPLACE INTO workflow_runs 
                (user_id, run_id, workflow_id, workflow_name, head_branch, head_sha, status, conclusion, 
                 event, run_number, run_attempt, run_started_at, created_at, updated_at, 
                 repository, owner, html_url, duration_seconds, jobs_count,
                 risk_score, risk_level, head_commit_message, head_commit_author, triggering_actor)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            const duration = run.run_started_at && run.updated_at ? 
                Math.floor((new Date(run.updated_at) - new Date(run.run_started_at)) / 1000) : null;

            const deployRisk = calculateDeploymentRiskScore({
                status: run.conclusion || run.status,
                durationSeconds: duration || 0
            });
            const riskLevel = getRiskLevel(deployRisk);

            const commitMsg = run.head_commit?.message || null;
            const commitAuthor = run.head_commit?.author?.name || null;
            const actor = run.triggering_actor?.login || null;

            stmt.run(userId, run.id, run.workflow_id, run.name, run.head_branch, run.head_sha, run.status, run.conclusion, run.event, run.run_number, run.run_attempt, run.run_started_at, run.created_at, run.updated_at, repository.full_name, repository.owner.login, run.html_url, duration, run.jobs || 0, deployRisk, riskLevel, commitMsg, commitAuthor, actor, (err) => {
                if (err) reject(err);
                else resolve();
            });
            stmt.finalize();
        });
    }

    // Fetch and store jobs for a workflow run
    async fetchWorkflowJobs(runId, repository, userId) {
        await this.octokitReady;
        if (!this.octokit) return;
        try {
            const { data: jobs } = await this.octokit.request('GET /repos/{owner}/{repo}/actions/runs/{run_id}/jobs', {
                owner: repository.owner.login,
                repo: repository.name,
                run_id: runId,
                per_page: 100
            });
            for (const job of jobs.jobs) {
                await this.storeWorkflowJob(job, userId);
                if (job.status === 'completed' && job.steps) {
                    await this.storeJobSteps(job, userId);
                }
            }
        } catch (error) {
            console.error(`Failed to fetch jobs for run ${runId}:`, error.message);
        }
    }

    // Store workflow job
    async storeWorkflowJob(job, userId) {
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(`
                INSERT OR REPLACE INTO workflow_jobs 
                (user_id, job_id, run_id, workflow_name, job_name, status, conclusion, 
                 started_at, completed_at, duration_seconds, steps_count, html_url)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            const duration = job.started_at && job.completed_at ? 
                Math.floor((new Date(job.completed_at) - new Date(job.started_at)) / 1000) : null;

            stmt.run(userId, job.id, job.run_id, job.workflow_name, job.name, job.status, job.conclusion, job.started_at, job.completed_at, duration, job.steps ? job.steps.length : 0, job.html_url, (err) => {
                if (err) reject(err);
                else resolve();
            });
            stmt.finalize();
        });
    }

    // Store job steps
    async storeJobSteps(job, userId) {
        if (!job.steps) return;
        for (const step of job.steps) {
            await this.storeJobStep(step, job.id, userId);
        }
    }

    // Store individual job step
    async storeJobStep(step, jobId, userId) {
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(`
                INSERT OR REPLACE INTO job_steps 
                (user_id, step_id, job_id, name, status, conclusion, number, started_at, completed_at, duration_seconds)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            const duration = step.started_at && step.completed_at ? 
                Math.floor((new Date(step.completed_at) - new Date(step.started_at)) / 1000) : null;

            stmt.run(userId, step.id || null, jobId, step.name, step.status, step.conclusion, step.number, step.started_at, step.completed_at, duration, (err) => {
                if (err) reject(err);
                else resolve();
            });
            stmt.finalize();
        });
    }

    // Update analytics for completed runs
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

    // Store analytics data
    async storeAnalytics(userId, metricName, value, workflowName, repository) {
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(`
                INSERT INTO pipeline_analytics (user_id, metric_name, value, workflow_name, repository)
                VALUES (?, ?, ?, ?, ?)
            `);
            stmt.run(userId, metricName, value, workflowName, repository, (err) => {
                if (err) reject(err);
                else resolve();
            });
            stmt.finalize();
        });
    }

    // Get recent workflow runs — includes stages (jobs) for each run
    async getRecentWorkflowRuns(limit = 50, repository = null, userId = null) {
        return new Promise(async (resolve, reject) => {
            let sql = `SELECT * FROM workflow_runs WHERE 1=1 `;
            const params = [];
            if (repository) {
                sql += `AND repository = ? `;
                params.push(repository);
            }
            if (userId) {
                sql += `AND user_id = ? `;
                params.push(userId);
            }
            sql += `ORDER BY run_started_at DESC LIMIT ?`;
            params.push(limit);

            this.db.all(sql, params, async (err, rows) => {
                if (err) return reject(err);
                try {
                    const runsWithStages = await Promise.all(rows.map(async (run) => {
                        const jobsSql = `SELECT job_id, job_name, status, conclusion, started_at, completed_at, duration_seconds, html_url FROM workflow_jobs WHERE run_id = ? ORDER BY started_at`;
                        const jobs = await new Promise((res) => {
                            this.db.all(jobsSql, [run.run_id], (err, jobsRows) => res(err ? [] : jobsRows));
                        });
                        const stages = jobs.map(job => ({
                            name: job.job_name,
                            status: job.conclusion || job.status || 'pending',
                            duration: job.duration_seconds || 0,
                            job_id: job.job_id,
                            html_url: job.html_url || null
                        }));
                        return { ...run, stages };
                    }));
                    resolve(runsWithStages);
                } catch (e) { reject(e); }
            });
        });
    }

    // Get workflow run details
    async getWorkflowRunDetails(runId, userId = null) {
        return new Promise(async (resolve, reject) => {
            try {
                let runSql = `SELECT * FROM workflow_runs WHERE run_id = ?`;
                let params = [runId];
                if (userId) {
                    runSql += ` AND user_id = ?`;
                    params.push(userId);
                }
                this.db.get(runSql, params, async (err, run) => {
                    if (err || !run) return resolve(null);
                    const jobsSql = `SELECT * FROM workflow_jobs WHERE run_id = ? ORDER BY started_at`;
                    this.db.all(jobsSql, [runId], async (err, jobs) => {
                        if (err) return reject(err);
                        const jobsWithSteps = [];
                        for (const job of jobs) {
                            const stepsSql = `SELECT * FROM job_steps WHERE job_id = ? ORDER BY number`;
                            const steps = await new Promise((res) => {
                                this.db.all(stepsSql, [job.job_id], (err, steps) => res(steps || []));
                            });
                            jobsWithSteps.push({ ...job, steps });
                        }
                        resolve({ ...run, jobs: jobsWithSteps });
                    });
                });
            } catch (error) { reject(error); }
        });
    }

    // Get pipeline analytics
    async getPipelineAnalytics(timeRange = '7d', userId = null) {
        return new Promise((resolve, reject) => {
            let timeFilter = "datetime(timestamp) >= datetime('now', '-7 days')";
            if (timeRange === '24h') timeFilter = "datetime(timestamp) >= datetime('now', '-1 day')";
            if (timeRange === '30d') timeFilter = "datetime(timestamp) >= datetime('now', '-30 days')";
            
            let sql = `SELECT metric_name, AVG(value) as avg_value, COUNT(*) as count FROM pipeline_analytics WHERE ${timeFilter}`;
            const params = [];
            if (userId) {
                sql += ` AND user_id = ?`;
                params.push(userId);
            }
            sql += ` GROUP BY metric_name`;
            this.db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    close() { this.db.close(); }
}
module.exports = GitHubWebhookService;
