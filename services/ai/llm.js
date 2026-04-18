'use strict';

/**
 * services/ai/llm.js
 *
 * Unified LLM client for PipelineXR.
 *
 * Primary:  Hugging Face Space (Qwen-7B)  — HF_SPACE_URL env var
 * Fallback: Google Gemini 2.0 Flash Lite  — GEMINI_API_KEY env var
 * Last:     Static templates              — always available
 *
 * All public methods return { ok, data, source, latency_ms }
 * Callers should never throw — errors are caught and fallback is used.
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');

const HF_URL     = (process.env.HF_SPACE_URL || process.env.HUGGINGFACE_LLM_URL || '').replace(/\/$/, '');
const HF_SECRET  = process.env.HF_SPACE_SECRET || process.env.HUGGINGFACE_API_SECRET || '';
const HF_TIMEOUT = parseInt(process.env.HF_TIMEOUT_MS || '600000', 10);

if (!HF_URL && !process.env.GEMINI_API_KEY) {
    console.warn('[LLM] Warning: No HF Space or Gemini configured — only static templates will work');
}

// Simple in-process cache: key → { data, ts }
const _cache = new Map();
const CACHE_TTL = 30 * 60 * 1000; // 30 min — HF inference is slow, cache longer

function cacheGet(key) {
    const entry = _cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > CACHE_TTL) { _cache.delete(key); return null; }
    return entry.data;
}
function cacheSet(key, data) {
    _cache.set(key, { data, ts: Date.now() });
    // Evict oldest entries if cache grows large
    if (_cache.size > 200) {
        const oldest = [..._cache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
        _cache.delete(oldest[0]);
    }
}

// ── HF Space HTTP call ────────────────────────────────────────────────────────
// Your HF Space returns: { ok: true, data: "<json string>" }
// The "data" field is a JSON string that must be parsed by the caller.
// timeoutMs: per-call override — all endpoints use HF_TIMEOUT (up to 10 min) for CPU inference,
//            with 1 retry to handle cold starts.
async function hfPost(endpoint, body, retries = 2, timeoutMs = HF_TIMEOUT) {
    if (!HF_URL) throw new Error('HF_SPACE_URL not configured');

    const headers = { 'Content-Type': 'application/json' };
    if (HF_SECRET) headers['Authorization'] = `Bearer ${HF_SECRET}`;

    for (let attempt = 0; attempt <= retries; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const res = await fetch(`${HF_URL}${endpoint}`, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
                signal: controller.signal,
            });
            clearTimeout(timer);
            if (!res.ok) {
                const text = await res.text().catch(() => '');
                if (res.status >= 400 && res.status < 500) {
                    throw new Error(`HF Space ${res.status}: ${text.slice(0, 200)}`);
                }
                throw new Error(`HF Space ${res.status}: ${text.slice(0, 200)}`);
            }
            const json = await res.json();
            if (json.ok && typeof json.data === 'string') {
                try { json.data = JSON.parse(json.data); } catch (_) { /* leave as string */ }
            }
            return json;
        } catch (err) {
            clearTimeout(timer);
            if (attempt === retries) throw err;
            // On fetch failed (Space sleeping/cold start), wait longer before retry
            const isFetchFail = err.message === 'fetch failed' || err.name === 'AbortError';
            const backoff = isFetchFail ? 15000 * (attempt + 1) : 3000 * (attempt + 1);
            console.warn(`[LLM] HF attempt ${attempt + 1} failed (${err.message}) — retrying in ${backoff / 1000}s`);
            await new Promise(r => setTimeout(r, backoff));
        }
    }
}

// ── Gemini fallback ───────────────────────────────────────────────────────────
let _gemini = null;
let _geminiQuotaExhaustedUntil = 0;

function isGeminiQuotaError(err) {
    const msg = err?.message || '';
    return msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED');
}

function getGemini() {
    if (!process.env.GEMINI_API_KEY) return null;
    if (Date.now() < _geminiQuotaExhaustedUntil) return null;
    if (!_gemini) {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        // gemini-2.0-flash-lite: highest free tier quota (1500 RPD, 30 RPM) — do NOT use 2.5-flash-lite (only 20 RPD free)
        _gemini = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-lite' });
    }
    return _gemini;
}

async function geminiGenerate(prompt) {
    const m = getGemini();
    if (!m) {
        if (Date.now() < _geminiQuotaExhaustedUntil) {
            const mins = Math.ceil((_geminiQuotaExhaustedUntil - Date.now()) / 60000);
            throw new Error(`Gemini quota exhausted — backing off for ~${mins}m`);
        }
        throw new Error('Gemini not configured');
    }
    try {
        const result = await m.generateContent(prompt);
        return (await result.response).text();
    } catch (err) {
        if (isGeminiQuotaError(err)) {
            const retryMatch = err.message.match(/retry[^0-9]*(\d+)(?:\.\d+)?s/i);
            const retrySecs = retryMatch ? parseInt(retryMatch[1], 10) : null;
            const backoffMs = retrySecs && retrySecs < 3600
                ? retrySecs * 1000 + 5000
                : 60 * 60 * 1000;
            _geminiQuotaExhaustedUntil = Date.now() + backoffMs;
            console.warn(`[LLM] Gemini quota exhausted — backing off for ${Math.ceil(backoffMs / 1000)}s`);
        }
        throw err;
    }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Security review — enhances Trivy findings with LLM analysis.
 * @param {string} repository
 * @param {Array}  vulnerabilities  — from securityService.getVulnerabilities()
 * @param {string} scanEngine
 */
async function securityReview(repository, vulnerabilities, scanEngine = 'trivy') {
    const crypto = require('crypto');
    const vulnHash = crypto
        .createHash('md5')
        .update(JSON.stringify(vulnerabilities.map(v => v.id || v.cve_id)))
        .digest('hex')
        .substring(0, 8);
    const cacheKey = `sec:${repository}:${vulnHash}`;
    const cached = cacheGet(cacheKey);
    if (cached) return { ...cached, source: 'cache' };

    const t0 = Date.now();

    // 1. Try HF Space — full timeout, security review is worth waiting for
    if (HF_URL) {
        try {
            const res = await hfPost('/security-review', { repository, vulnerabilities, scan_engine: scanEngine }, 2, HF_TIMEOUT);
            if (res.ok) {
                const out = { ok: true, data: res.data, source: 'hf', latency_ms: Date.now() - t0 };
                cacheSet(cacheKey, out);
                return out;
            }
        } catch (e) {
            console.warn('[LLM] HF security-review failed, trying Gemini:', e.message);
        }
    }

    // 2. Gemini fallback
    try {
        const top = vulnerabilities.slice(0, 5).map(v =>
            `[${v.severity?.toUpperCase()}] ${v.cve_id || 'N/A'} in ${v.package_name}: ${(v.description || '').slice(0, 100)}`
        ).join('\n');
        const text = await geminiGenerate(
            `You are a security analyst. Summarize these vulnerabilities and provide remediation steps:\n${top}\nRepository: ${repository}`
        );
        const out = { ok: true, data: { risk_summary: text, source_model: 'gemini' }, source: 'gemini', latency_ms: Date.now() - t0 };
        cacheSet(cacheKey, out);
        return out;
    } catch (e) {
        console.warn('[LLM] Gemini security-review failed:', e.message);
    }

    // 3. Static template
    const critCount = vulnerabilities.filter(v => v.severity === 'critical').length;
    return {
        ok: true,
        data: {
            risk_summary: `${vulnerabilities.length} vulnerabilities found (${critCount} critical). Review and apply available patches.`,
            critical_actions: critCount > 0 ? ['Update critical packages immediately', 'Run npm audit fix'] : ['Schedule patch cycle'],
            overall_posture: critCount > 0 ? 'critical' : vulnerabilities.length > 10 ? 'at-risk' : 'secure',
            source_model: 'static',
        },
        source: 'static',
        latency_ms: Date.now() - t0,
    };
}

/**
 * Generate pipeline failure email content.
 * @param {object} runData  — workflow_run row from DB
 * @param {Array}  failedSteps
 */
async function pipelineFailureEmail(runData, failedSteps = []) {
    const t0 = Date.now();
    const body = {
        repository:        runData.repository || '',
        workflow_name:     runData.workflow_name || '',
        conclusion:        runData.conclusion || 'failure',
        duration_seconds:  runData.duration_seconds || 0,
        head_branch:       runData.head_branch || 'main',
        triggering_actor:  runData.triggering_actor || '',
        failed_steps:      failedSteps,
        commit_message:    runData.head_commit_message || '',
        run_url:           runData.html_url || '',
    };

    if (HF_URL) {
        try {
            const res = await hfPost('/pipeline-email', body, 1, HF_TIMEOUT);
            if (res.ok) return { ok: true, data: res.data, source: 'hf', latency_ms: Date.now() - t0 };
        } catch (e) {
            console.warn('[LLM] HF pipeline-email failed:', e.message);
        }
    }

    // Gemini fallback
    try {
        const prompt = `Write a professional pipeline failure notification email for:
Repository: ${body.repository}, Workflow: ${body.workflow_name}, Branch: ${body.head_branch}
Failed steps: ${failedSteps.join(', ') || 'unknown'}
Include: subject line, executive summary, technical details, recommended actions.`;
        const text = await geminiGenerate(prompt);
        return { ok: true, data: { subject: `[FAILED] ${body.workflow_name} on ${body.head_branch}`, body_text: text, urgency: 'high' }, source: 'gemini', latency_ms: Date.now() - t0 };
    } catch (e) {
        console.warn('[LLM] Gemini pipeline-email failed:', e.message);
    }

    // Static template
    return {
        ok: true,
        data: {
            subject: `[FAILED] ${body.workflow_name} on ${body.head_branch} — ${body.repository}`,
            body_text: `Pipeline failure detected.\n\nRepository: ${body.repository}\nWorkflow: ${body.workflow_name}\nBranch: ${body.head_branch}\nTriggered by: ${body.triggering_actor}\n\nFailed steps:\n${failedSteps.map(s => `  - ${s}`).join('\n') || '  (details unavailable)'}\n\nPlease investigate and re-run the pipeline.\n\nView run: ${body.run_url}`,
            urgency: 'high',
            source_model: 'static',
        },
        source: 'static',
        latency_ms: Date.now() - t0,
    };
}

/**
 * Generate monitoring alert email content.
 * @param {object} siteData  — monitored_sites row
 * @param {object} checkData — latest uptime_checks row
 */
async function monitorAlertEmail(siteData, checkData = {}) {
    const t0 = Date.now();
    const body = {
        url:                  siteData.url,
        is_up:                siteData.is_up === 1,
        response_time_ms:     checkData.response_time_ms || 0,
        consecutive_failures: siteData.consecutive_failures || 0,
        incident_started_at:  siteData.last_checked || '',
        error:                checkData.error || '',
    };

    if (HF_URL) {
        try {
            const res = await hfPost('/monitor-email', body, 1, HF_TIMEOUT);
            if (res.ok) return { ok: true, data: res.data, source: 'hf', latency_ms: Date.now() - t0 };
        } catch (e) {
            console.warn('[LLM] HF monitor-email failed:', e.message);
        }
    }

    // Static template
    const status = body.is_up ? 'RECOVERED' : 'DOWN';
    return {
        ok: true,
        data: {
            subject: `[${status}] ${body.url}`,
            body_text: `Service ${status}\n\nURL: ${body.url}\nStatus: ${status}\nConsecutive failures: ${body.consecutive_failures}\nError: ${body.error || 'N/A'}\n\nPlease investigate immediately.`,
            severity: body.consecutive_failures >= 3 ? 'critical' : 'warning',
            source_model: 'static',
        },
        source: 'static',
        latency_ms: Date.now() - t0,
    };
}

/**
 * DORA metrics AI insights.
 * @param {string} repository
 * @param {object} metricsData  — from metricsService.getDoraMetrics()
 * @param {string} timeRange
 */
async function doraInsights(repository, metricsData, timeRange = '7d') {
    const cacheKey = `dora:${repository}:${timeRange}`;
    const cached = cacheGet(cacheKey);
    if (cached) return { ...cached, source: 'cache' };

    const t0 = Date.now();
    const body = {
        repository,
        time_range:          timeRange,
        avg_build_duration:  metricsData.avgBuildDuration || 0,
        success_rate:        metricsData.successRate || 0,
        total_deployments:   metricsData.totalDeployments || 0,
        failed_deployments:  metricsData.failedDeployments || 0,
        trend_data:          metricsData.trendData || [],
    };

    if (HF_URL) {
        try {
            const res = await hfPost('/dora-insights', body, 1, HF_TIMEOUT);
            if (res.ok) {
                const out = { ok: true, data: res.data, source: 'hf', latency_ms: Date.now() - t0 };
                cacheSet(cacheKey, out);
                return out;
            }
        } catch (e) {
            console.warn('[LLM] HF dora-insights failed:', e.message);
        }
    }

    // Gemini fallback
    try {
        const prompt = `Analyze these DORA metrics for ${repository} (${timeRange}):
Success rate: ${body.success_rate}%, Avg build: ${body.avg_build_duration}min, Deployments: ${body.total_deployments}
Provide: performance grade (Elite/High/Medium/Low), 3 key insights, 2 recommendations.`;
        const text = await geminiGenerate(prompt);
        const out = { ok: true, data: { executive_summary: text, source_model: 'gemini' }, source: 'gemini', latency_ms: Date.now() - t0 };
        cacheSet(cacheKey, out);
        return out;
    } catch (e) {
        console.warn('[LLM] Gemini dora-insights failed:', e.message);
    }

    // Static
    const grade = body.success_rate >= 95 ? 'Elite' : body.success_rate >= 80 ? 'High' : body.success_rate >= 60 ? 'Medium' : 'Low';
    return {
        ok: true,
        data: {
            executive_summary: `${repository} achieved a ${body.success_rate}% success rate over ${timeRange} with ${body.total_deployments} deployments.`,
            performance_grade: grade,
            key_insights: [`Success rate: ${body.success_rate}%`, `Avg build: ${body.avg_build_duration}min`, `Total runs: ${body.total_deployments}`],
            recommendations: body.success_rate < 80 ? ['Investigate flaky tests', 'Add pre-merge checks'] : ['Maintain current practices'],
            source_model: 'static',
        },
        source: 'static',
        latency_ms: Date.now() - t0,
    };
}

/**
 * Incident response guidance.
 * @param {object} incident  — { title, severity, affected_service, symptoms[], recent_changes[], error_logs[] }
 */
async function incidentResponse(incident) {
    const t0 = Date.now();

    if (HF_URL) {
        try {
            const res = await hfPost('/incident-response', {
                title:            incident.title || 'Unknown incident',
                severity:         incident.severity || 'high',
                affected_service: incident.affected_service || '',
                symptoms:         incident.symptoms || [],
                recent_changes:   incident.recent_changes || [],
                error_logs:       incident.error_logs || [],
            }, 1, HF_TIMEOUT);
            if (res.ok) return { ok: true, data: res.data, source: 'hf', latency_ms: Date.now() - t0 };
        } catch (e) {
            console.warn('[LLM] HF incident-response failed:', e.message);
        }
    }

    // Static template
    return {
        ok: true,
        data: {
            immediate_actions: ['Check service logs', 'Verify recent deployments', 'Check infrastructure health'],
            likely_root_causes: ['Recent deployment', 'Resource exhaustion', 'External dependency failure'],
            diagnostic_commands: ['kubectl get pods', 'docker ps', 'tail -f /var/log/app.log'],
            escalation_path: 'Escalate to on-call engineer if not resolved in 15 minutes',
            post_incident_tasks: ['Write post-mortem', 'Update runbooks'],
            source_model: 'static',
        },
        source: 'static',
        latency_ms: Date.now() - t0,
    };
}

module.exports = {
    securityReview,
    pipelineFailureEmail,
    monitorAlertEmail,
    doraInsights,
    incidentResponse,
    hfHealth,
};

// ── Keep HF Space warm — ping /health every 4 min to prevent sleep ────────────
// HF free Spaces sleep after ~15 min of inactivity. Waking up takes 2-3 min
// just to load the 4.4GB model before any inference can happen.
// This keepalive runs only when HF_URL is configured.
async function hfHealth() {
    if (!HF_URL) return { ok: false, reason: 'not configured' };
    try {
        const controller = new AbortController();
        // 3 min timeout — HF Space cold start loads a 4.4GB model, takes 2-3 min
        setTimeout(() => controller.abort(), 3 * 60 * 1000);
        const r = await fetch(`${HF_URL}/health`, { signal: controller.signal });
        if (!r.ok) return { ok: false, reason: `HTTP ${r.status}` };
        const data = await r.json();
        return { ok: true, ...data };
    } catch (e) {
        return { ok: false, reason: e.message };
    }
}

if (HF_URL) {
    // Ping immediately at startup
    hfHealth().then(s => {
        if (s.ok) console.log(`[LLM] HF Space is warm — model: ${s.model || 'unknown'}`);
        else console.log(`[LLM] HF Space not ready yet (${s.reason}) — will retry`);
    });
    // Keep warm every 10 minutes (HF sleeps after ~15 min of inactivity)
    setInterval(() => {
        hfHealth().catch(() => {});
    }, 10 * 60 * 1000);
}
