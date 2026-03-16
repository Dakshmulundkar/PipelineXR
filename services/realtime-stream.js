// Database connection centralized in database.js

class RealtimeStreamService {
    constructor(io) {
        this.io = io;
        this.db = require('./database');
        this.subscribers = new Set();
        this.init();
    }

    init() {
        this.setupDatabaseListeners();
        this.setupSocketHandlers();
    }

    // Setup database change listeners
    setupDatabaseListeners() {
        // SQLite doesn't have built-in notifications, so we'll poll for changes
        // In production, consider using PostgreSQL with LISTEN/NOTIFY or similar
        setInterval(() => {
            this.checkForUpdates();
        }, 2000); // Check every 2 seconds
    }

    // Check for database updates and emit to clients
    async checkForUpdates() {
        try {
            // Check for new workflow runs
            const recentRuns = await this.getRecentWorkflowRuns(5);
            if (recentRuns.length > 0) {
                this.io.emit('pipeline_update', {
                    type: 'WORKFLOW_RUNS_UPDATE',
                    data: recentRuns,
                    timestamp: new Date().toISOString()
                });
            }

            // Check for running jobs
            const runningJobs = await this.getRunningJobs();
            if (runningJobs.length > 0) {
                this.io.emit('pipeline_update', {
                    type: 'JOBS_UPDATE',
                    data: runningJobs,
                    timestamp: new Date().toISOString()
                });
            }

            // Check for recent steps
            const recentSteps = await this.getRecentSteps(10);
            if (recentSteps.length > 0) {
                this.io.emit('pipeline_update', {
                    type: 'STEPS_UPDATE',
                    data: recentSteps,
                    timestamp: new Date().toISOString()
                });
            }
        } catch (error) {
            console.error('Real-time update check failed:', error);
        }
    }

    // Setup Socket.io handlers
    setupSocketHandlers() {
        this.io.on('connection', (socket) => {
            console.log(`🔌 Client connected: ${socket.id}`);
            this.subscribers.add(socket.id);

            // Send initial data
            this.sendInitialData(socket);

            // Handle subscription events
            socket.on('subscribe_to_pipeline', (data) => {
                console.log(`📡 ${socket.id} subscribed to pipeline updates`);
                socket.join('pipeline_updates');
            });

            socket.on('unsubscribe_from_pipeline', (data) => {
                console.log(`🔇 ${socket.id} unsubscribed from pipeline updates`);
                socket.leave('pipeline_updates');
            });

            // Handle specific pipeline requests
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

    // Send initial data to newly connected client
    async sendInitialData(socket) {
        try {
            const recentRuns = await this.getRecentWorkflowRuns(10);
            const analytics = await this.getRecentAnalytics();

            socket.emit('pipeline_initial_data', {
                recentRuns,
                analytics,
                timestamp: new Date().toISOString()
            });

            console.log(`📤 Sent initial data to ${socket.id}`);
        } catch (error) {
            console.error('Failed to send initial data:', error);
        }
    }

    // Get recent workflow runs
    getRecentWorkflowRuns(limit = 10) {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT 
                    run_id,
                    workflow_name,
                    status,
                    conclusion,
                    run_number,
                    run_started_at,
                    updated_at,
                    duration_seconds,
                    html_url,
                    repository
                FROM workflow_runs 
                ORDER BY run_started_at DESC 
                LIMIT ?
            `;
            
            this.db.all(sql, [limit], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    // Get currently running jobs
    getRunningJobs() {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT 
                    j.job_id,
                    j.job_name,
                    j.status,
                    j.started_at,
                    j.workflow_name,
                    r.run_number,
                    r.html_url as run_url
                FROM workflow_jobs j
                JOIN workflow_runs r ON j.run_id = r.run_id
                WHERE j.status = 'in_progress'
                ORDER BY j.started_at DESC
            `;
            
            this.db.all(sql, [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    // Get recent job steps
    getRecentSteps(limit = 10) {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT 
                    s.name,
                    s.status,
                    s.conclusion,
                    s.completed_at,
                    j.job_name,
                    r.workflow_name,
                    r.run_number
                FROM job_steps s
                JOIN workflow_jobs j ON s.job_id = j.job_id
                JOIN workflow_runs r ON j.run_id = r.run_id
                WHERE s.status = 'completed'
                ORDER BY s.completed_at DESC
                LIMIT ?
            `;
            
            this.db.all(sql, [limit], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    // Get pipeline analytics
    getRecentAnalytics() {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT 
                    metric_name,
                    AVG(value) as avg_value,
                    COUNT(*) as count,
                    MAX(timestamp) as last_updated
                FROM pipeline_analytics 
                WHERE datetime(timestamp) >= datetime('now', '-1 day')
                GROUP BY metric_name
                ORDER BY metric_name
            `;

            this.db.all(sql, [], (err, rows) => {
                if (err) reject(err);
                else {
                    const formatted = {};
                    rows.forEach(row => {
                        formatted[row.metric_name] = {
                            value: row.avg_value,
                            count: row.count,
                            last_updated: row.last_updated
                        };
                    });
                    resolve(formatted);
                }
            });
        });
    }

    // Get pipeline status for specific repository/workflow
    async getPipelineStatus(filters = {}) {
        const { repository, workflow_name, timeRange = '24h' } = filters;
        
        let timeFilter = "datetime(run_started_at) >= datetime('now', '-1 day')";
        switch (timeRange) {
            case '1h':
                timeFilter = "datetime(run_started_at) >= datetime('now', '-1 hour')";
                break;
            case '24h':
                timeFilter = "datetime(run_started_at) >= datetime('now', '-1 day')";
                break;
            case '7d':
                timeFilter = "datetime(run_started_at) >= datetime('now', '-7 days')";
                break;
            case '30d':
                timeFilter = "datetime(run_started_at) >= datetime('now', '-30 days')";
                break;
        }

        let whereClause = timeFilter;
        const params = [];

        if (repository) {
            whereClause += " AND repository = ?";
            params.push(repository);
        }

        if (workflow_name) {
            whereClause += " AND workflow_name = ?";
            params.push(workflow_name);
        }

        return new Promise((resolve, reject) => {
            const sql = `
                SELECT 
                    workflow_name,
                    status,
                    conclusion,
                    COUNT(*) as count,
                    AVG(duration_seconds) as avg_duration,
                    MAX(run_started_at) as last_run
                FROM workflow_runs 
                WHERE ${whereClause}
                GROUP BY workflow_name, status, conclusion
                ORDER BY last_run DESC
            `;

            this.db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    // Get detailed workflow run information
    getWorkflowRunDetails(runId) {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT 
                    r.run_id,
                    r.workflow_name,
                    r.status,
                    r.conclusion,
                    r.run_number,
                    r.run_started_at,
                    r.updated_at,
                    r.duration_seconds,
                    r.html_url,
                    r.repository,
                    COUNT(DISTINCT j.job_id) as jobs_count,
                    COUNT(DISTINCT s.id) as steps_count
                FROM workflow_runs r
                LEFT JOIN workflow_jobs j ON r.run_id = j.run_id
                LEFT JOIN job_steps s ON j.job_id = s.job_id
                WHERE r.run_id = ?
                GROUP BY r.run_id
            `;

            this.db.get(sql, [runId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    // Stream logs for a specific workflow run
    streamRunLogs(runId, socket) {
        const interval = setInterval(async () => {
            try {
                const steps = await this.getRecentStepsForRun(runId, 5);
                if (steps.length > 0) {
                    socket.emit('log_stream', {
                        runId,
                        steps,
                        timestamp: new Date().toISOString()
                    });
                }
                
                // Check if run is complete to stop streaming
                const run = await this.getWorkflowRunDetails(runId);
                if (run && run.status === 'completed') {
                    clearInterval(interval);
                    socket.emit('log_stream_complete', { runId });
                }
            } catch (error) {
                console.error('Log streaming error:', error);
                clearInterval(interval);
            }
        }, 3000); // Stream every 3 seconds
    }

    // Get recent steps for a specific run
    getRecentStepsForRun(runId, limit = 10) {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT 
                    s.name,
                    s.status,
                    s.conclusion,
                    s.completed_at,
                    j.job_name
                FROM job_steps s
                JOIN workflow_jobs j ON s.job_id = j.job_id
                WHERE j.run_id = ?
                ORDER BY s.completed_at DESC
                LIMIT ?
            `;
            
            this.db.all(sql, [runId, limit], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    // Emit real-time event to all connected clients
    emitEvent(eventType, data) {
        this.io.emit(eventType, {
            data,
            timestamp: new Date().toISOString()
        });
    }

    // Emit event to specific room
    emitToRoom(room, eventType, data) {
        this.io.to(room).emit(eventType, {
            data,
            timestamp: new Date().toISOString()
        });
    }

    // Get connection statistics
    getStats() {
        return {
            subscribers: this.subscribers.size,
            rooms: Array.from(this.io.sockets.adapter.rooms.keys())
        };
    }
}

module.exports = RealtimeStreamService;