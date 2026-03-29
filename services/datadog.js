/**
 * Datadog Integration Service
 * Sends pipeline metrics, security findings, and DORA data to Datadog.
 */

const { client, v1, v2 } = require('@datadog/datadog-api-client');

const DD_SITE    = process.env.DATADOG_SITE    || 'ap1.datadoghq.com';
const DD_API_KEY = process.env.DATADOG_API_KEY || '';
const DD_APP_KEY = process.env.DATADOG_APP_KEY || '';

const enabled = Boolean(DD_API_KEY);

if (!enabled) {
    console.warn('[Datadog] DATADOG_API_KEY not set — Datadog integration disabled.');
}

// Build a shared configuration
function getConfig() {
    const configuration = client.createConfiguration({
        authMethods: {
            apiKeyAuth: DD_API_KEY,
            appKeyAuth: DD_APP_KEY,
        },
        serverVariables: { site: DD_SITE },
    });
    return configuration;
}

/**
 * Send a batch of metrics to Datadog.
 * @param {Array<{metricName: string, value: number, tags: string[]}>} metrics
 */
async function sendMetrics(metrics) {
    if (!enabled) return;
    try {
        const config = getConfig();
        const api = new v1.MetricsApi(config);

        const series = metrics.map(m => ({
            metric: `pipelinexr.${m.metricName}`,
            type: 'gauge',
            points: [[Math.floor(Date.now() / 1000), Number(m.value) || 0]],
            tags: ['service:pipelinexr', ...(m.tags || [])],
        }));

        await api.submitMetrics({ body: { series } });
    } catch (err) {
        console.error('[Datadog] Failed to send metrics:', err.message);
    }
}

/**
 * Send an event to Datadog (shows up in the Events Explorer).
 * @param {string} title
 * @param {string} text
 * @param {'info'|'warning'|'error'|'success'} alertType
 * @param {string[]} tags
 */
async function sendEvent(title, text, alertType = 'info', tags = []) {
    if (!enabled) return;
    try {
        const config = getConfig();
        const api = new v1.EventsApi(config);

        await api.createEvent({
            body: {
                title,
                text,
                alertType,
                tags: ['service:pipelinexr', ...tags],
                sourceTypeName: 'PipelineXR',
            },
        });
    } catch (err) {
        console.error('[Datadog] Failed to send event:', err.message);
    }
}

// ── Public helpers ────────────────────────────────────────────────────────────

/**
 * Called when a workflow run completes (from webhook handler).
 * Sends build duration, success/failure counter, and a Datadog event.
 */
async function trackPipelineRun(run) {
    if (!enabled) return;

    const repo    = run.repository || 'unknown';
    const success = run.conclusion === 'success' ? 1 : 0;
    const failed  = run.conclusion !== 'success' ? 1 : 0;
    const duration = run.duration_seconds || 0;
    const branch  = run.head_branch || 'unknown';

    const tags = [`repo:${repo}`, `branch:${branch}`, `conclusion:${run.conclusion || 'unknown'}`];

    await sendMetrics([
        { metricName: 'build.duration_seconds', value: duration, tags },
        { metricName: 'build.success',           value: success,  tags },
        { metricName: 'build.failure',           value: failed,   tags },
    ]);

    // Only send a Datadog event for failures to avoid noise
    if (failed) {
        await sendEvent(
            `Pipeline failed: ${repo}`,
            `Branch: ${branch}\nWorkflow: ${run.workflow_name || 'unknown'}\nRun: #${run.run_number || '?'}`,
            'error',
            tags
        );
    }
}

/**
 * Called after a security scan completes.
 * Sends CVE counts by severity and a Datadog event if critical findings exist.
 */
async function trackSecurityScan(repository, metrics) {
    if (!enabled) return;

    const tags = [`repo:${repository}`];
    const critical = metrics?.critical || 0;
    const high     = metrics?.high     || 0;
    const medium   = metrics?.medium   || 0;
    const low      = metrics?.low      || 0;

    await sendMetrics([
        { metricName: 'security.critical', value: critical, tags },
        { metricName: 'security.high',     value: high,     tags },
        { metricName: 'security.medium',   value: medium,   tags },
        { metricName: 'security.low',      value: low,      tags },
        { metricName: 'security.total',    value: critical + high + medium + low, tags },
    ]);

    if (critical > 0 || high > 0) {
        await sendEvent(
            `Security findings detected: ${repository}`,
            `Critical: ${critical} | High: ${high} | Medium: ${medium} | Low: ${low}`,
            critical > 0 ? 'error' : 'warning',
            tags
        );
    }
}

/**
 * Called after DORA metrics are synced.
 * Sends deployment frequency, success rate, and avg build duration.
 */
async function trackDoraMetrics(repository, data) {
    if (!enabled) return;

    const tags = [`repo:${repository}`];

    await sendMetrics([
        { metricName: 'dora.deployment_frequency',  value: Number(data.deploymentFrequency  || 0), tags },
        { metricName: 'dora.success_rate',           value: Number(data.successRate          || 0), tags },
        { metricName: 'dora.avg_build_duration_min', value: Number(data.avgBuildDuration     || 0), tags },
    ]);
}

/**
 * Query a PipelineXR metric time-series from local SQLite.
 * Replaces the Datadog query API (which requires metrics_read scope).
 * Supported metric keys: build.success, build.failure, build.duration_seconds,
 *   security.critical, security.high, dora.success_rate
 */
async function queryLocalMetric(metricKey, from, to, repository = null, userId = null) {
    const db = require('./database');
    const fromDate = new Date(from * 1000).toISOString();
    const toDate   = new Date(to   * 1000).toISOString();

    if (!userId) return [];

    return new Promise((resolve) => {
        let sql, params;
        const userFilter = 'AND user_id = ?';

        if (metricKey === 'build.success' || metricKey === 'build.failure') {
            const conclusion = metricKey === 'build.success' ? 'success' : 'failure';
            sql = `SELECT DATE(run_started_at) as day, COUNT(*) as value
                   FROM workflow_runs
                   WHERE run_started_at >= ? AND run_started_at <= ?
                   AND conclusion = ?
                   ${repository ? 'AND repository = ?' : ''}
                   ${userFilter}
                   GROUP BY day ORDER BY day`;
            params = repository ? [fromDate, toDate, conclusion, repository, userId] : [fromDate, toDate, conclusion, userId];

        } else if (metricKey === 'build.duration_seconds') {
            sql = `SELECT DATE(run_started_at) as day, ROUND(AVG(duration_seconds)::numeric, 1) as value
                   FROM workflow_runs
                   WHERE run_started_at >= ? AND run_started_at <= ?
                   AND duration_seconds IS NOT NULL
                   ${repository ? 'AND repository = ?' : ''}
                   ${userFilter}
                   GROUP BY day ORDER BY day`;
            params = repository ? [fromDate, toDate, repository, userId] : [fromDate, toDate, userId];

        } else if (metricKey === 'security.critical' || metricKey === 'security.high') {
            const sev = metricKey === 'security.critical' ? 'critical' : 'high';
            sql = `SELECT DATE(timestamp) as day, COUNT(*) as value
                   FROM vulnerabilities
                   WHERE timestamp >= ? AND timestamp <= ?
                   AND severity = ? AND status = 'open'
                   ${repository ? 'AND repository = ?' : ''}
                   ${userFilter}
                   GROUP BY day ORDER BY day`;
            params = repository ? [fromDate, toDate, sev, repository, userId] : [fromDate, toDate, sev, userId];

        } else if (metricKey === 'dora.success_rate') {
            sql = `SELECT DATE(run_started_at) as day,
                   ROUND(SUM(CASE WHEN conclusion='success' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 1) as value
                   FROM workflow_runs
                   WHERE run_started_at >= ? AND run_started_at <= ?
                   ${repository ? 'AND repository = ?' : ''}
                   ${userFilter}
                   GROUP BY day ORDER BY day`;
            params = repository ? [fromDate, toDate, repository, userId] : [fromDate, toDate, userId];

        } else {
            return resolve([]);
        }

        db.all(sql, params, (err, rows) => {
            if (err) return resolve([]);
            resolve((rows || []).map(r => ({
                timestamp: new Date(r.day + 'T12:00:00Z').getTime(),
                value: r.value ?? 0,
            })));
        });
    });
}

module.exports = { trackPipelineRun, trackSecurityScan, trackDoraMetrics, sendMetrics, sendEvent, queryLocalMetric, enabled };
