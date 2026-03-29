const db = require('./database');

class RealtimeStreamService {
    constructor(io) {
        this.io = io;
        this.db = db;
        this.subscribers = new Set();
        this._pollInterval = null;
        this.setupSocketHandlers();
        // Delay polling start by 5s to let schema initialization finish
        setTimeout(() => this.startPolling(), 5000);
    }

    startPolling() {
        // Poll every 30s — Neon free tier has limited connections, don't hammer it
        this._pollInterval = setInterval(() => this.checkForUpdates(), 30000);
    }

    async checkForUpdates() {
        try {
            const recentRuns = await this.getRecentWorkflowRuns(5);
            if (recentRuns && recentRuns.length > 0) {
                this.io.emit('pipeline_update', {
                    type: 'WORKFLOW_RUNS_UPDATE',
                    data: recentRuns,
                    timestamp: new Date().toISOString()
                });
            }
        } catch (error) {
            // Silently ignore — tables may not exist yet or connection may be busy
        }
    }

    setupSocketHandlers() {
        this.io.on('connection', (socket) => {
            console.log(`🔌 Client connected: ${socket.id}`);
            this.subscribers.add(socket.id);

            this.sendInitialData(socket);

            socket.on('subscribe_to_pipeline', () => socket.join('pipeline_updates'));
            socket.on('unsubscribe_from_pipeline', () => socket.leave('pipeline_updates'));

            socket.on('get_pipeline_status', async (data) => {
                try {
                    const status = await this.getPipelineStatus(data);
                    socket.emit('pipeline_status', status);
                } catch (error) {
                    socket.emit('error', { message: 'Failed to get pipeline status', error: error.message });
                }
            });

            socket.on('get_workflow_details', async (data) => {
                try {
                    const details = await this.getWorkflowRunDetails(data.runId);
                    socket.emit('workflow_details', details);
                } catch (error) {
                    socket.emit('error', { message: 'Failed to get workflow details', error: error.message });
                }
            });

            socket.on('disconnect', () => {
                console.log(`🔌 Client disconnected: ${socket.id}`);
                this.subscribers.delete(socket.id);
            });
        });
    }

    async sendInitialData(socket) {
        try {
            const recentRuns = await this.getRecentWorkflowRuns(10);
            const analytics = await this.getRecentAnalytics();
            socket.emit('pipeline_initial_data', {
                recentRuns,
                analytics,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            // Non-fatal — client will load data via REST
        }
    }

    getRecentWorkflowRuns(limit = 10) {
        return new Promise((resolve, reject) => {
            this.db.all(
                `SELECT run_id, workflow_name, status, conclusion, run_number,
                    run_started_at, updated_at, duration_seconds, html_url, repository
                 FROM workflow_runs ORDER BY run_started_at DESC LIMIT ?`,
                [limit],
                (err, rows) => err ? reject(err) : resolve(rows || [])
            );
        });
    }

    getRunningJobs() {
        return new Promise((resolve, reject) => {
            this.db.all(
                `SELECT j.job_id, j.job_name, j.status, j.started_at, j.workflow_name,
                    r.run_number, r.html_url as run_url
                 FROM workflow_jobs j
                 JOIN workflow_runs r ON j.run_id = r.run_id
                 WHERE j.status = 'in_progress'
                 ORDER BY j.started_at DESC`,
                [],
                (err, rows) => err ? reject(err) : resolve(rows || [])
            );
        });
    }

    getRecentSteps(limit = 10) {
        return new Promise((resolve, reject) => {
            this.db.all(
                `SELECT s.name, s.status, s.conclusion, s.completed_at,
                    j.job_name, r.workflow_name, r.run_number
                 FROM job_steps s
                 JOIN workflow_jobs j ON s.job_id = j.job_id
                 JOIN workflow_runs r ON j.run_id = r.run_id
                 WHERE s.status = 'completed'
                 ORDER BY s.completed_at DESC LIMIT ?`,
                [limit],
                (err, rows) => err ? reject(err) : resolve(rows || [])
            );
        });
    }

    getRecentAnalytics() {
        return new Promise((resolve) => {
            this.db.all(
                `SELECT metric_name, AVG(value) as avg_value, COUNT(*) as count, MAX(timestamp) as last_updated
                 FROM pipeline_analytics
                 WHERE timestamp >= NOW() - INTERVAL '1 day'
                 GROUP BY metric_name ORDER BY metric_name`,
                [],
                (err, rows) => {
                    if (err) return resolve({});
                    const formatted = {};
                    (rows || []).forEach(row => {
                        formatted[row.metric_name] = { value: row.avg_value, count: row.count, last_updated: row.last_updated };
                    });
                    resolve(formatted);
                }
            );
        });
    }

    async getPipelineStatus(filters = {}) {
        const { repository, workflow_name, timeRange = '24h' } = filters;
        const intervalMap = { '1h': '1 hour', '24h': '1 day', '7d': '7 days', '30d': '30 days' };
        const interval = intervalMap[timeRange] || '1 day';

        let whereClause = `run_started_at >= NOW() - INTERVAL '${interval}'`;
        const params = [];
        if (repository) { whereClause += ' AND repository = ?'; params.push(repository); }
        if (workflow_name) { whereClause += ' AND workflow_name = ?'; params.push(workflow_name); }

        return new Promise((resolve, reject) => {
            this.db.all(
                `SELECT workflow_name, status, conclusion, COUNT(*) as count,
                    AVG(duration_seconds) as avg_duration, MAX(run_started_at) as last_run
                 FROM workflow_runs WHERE ${whereClause}
                 GROUP BY workflow_name, status, conclusion ORDER BY last_run DESC`,
                params,
                (err, rows) => err ? reject(err) : resolve(rows || [])
            );
        });
    }

    getWorkflowRunDetails(runId) {
        return new Promise((resolve, reject) => {
            this.db.get(
                `SELECT r.run_id, r.workflow_name, r.status, r.conclusion, r.run_number,
                    r.run_started_at, r.updated_at, r.duration_seconds, r.html_url, r.repository,
                    COUNT(DISTINCT j.job_id) as jobs_count, COUNT(DISTINCT s.id) as steps_count
                 FROM workflow_runs r
                 LEFT JOIN workflow_jobs j ON r.run_id = j.run_id
                 LEFT JOIN job_steps s ON j.job_id = s.job_id
                 WHERE r.run_id = ? GROUP BY r.run_id`,
                [runId],
                (err, row) => err ? reject(err) : resolve(row)
            );
        });
    }

    emitEvent(eventType, data) {
        this.io.emit(eventType, { data, timestamp: new Date().toISOString() });
    }

    emitToRoom(room, eventType, data) {
        this.io.to(room).emit(eventType, { data, timestamp: new Date().toISOString() });
    }

    getStats() {
        return {
            subscribers: this.subscribers.size,
            rooms: Array.from(this.io.sockets.adapter.rooms.keys())
        };
    }
}

module.exports = RealtimeStreamService;
