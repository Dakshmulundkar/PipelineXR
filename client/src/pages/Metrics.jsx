import { useState, useEffect, useRef, useCallback } from 'react';
import { BarChart2, Clock, RefreshCw, Activity, Zap, Target, Database, Beaker, CheckCircle2, XCircle, TrendingUp, AlertTriangle } from 'lucide-react';
import { Line, Bar } from 'react-chartjs-2';
import {
    Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement,
    Title, Tooltip, Legend, BarElement, Filler
} from 'chart.js';
import StatCard from '../components/StatCard';
import ChartCard from '../components/ChartCard';
import { api } from '../services/api';
import { useAppContext } from '../contexts/AppContext';
import { cacheGet, cacheSet } from '../services/cache';
import AiInsightPanel from '../components/AiInsightPanel';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler);

function calcTrend(current, previous) {
    if (previous == null || previous === 0) return null;
    const delta = Math.round(((current - previous) / previous) * 100);
    return { trend: Math.abs(delta), trendUp: delta >= 0 };
}

const LINE_OPTS = (label, unit = '') => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    animation: { duration: 1500, easing: 'easeOutQuart' },
    scales: {
        x: {
            grid: { display: false },
            ticks: { color: 'rgba(255,255,255,0.3)', font: { size: 10, weight: '500' }, maxTicksLimit: 12, maxRotation: 0 },
            border: { display: false }
        },
        y: {
            grid: { color: 'rgba(255,255,255,0.03)', drawBorder: false },
            ticks: { color: 'rgba(255,255,255,0.3)', font: { size: 10 }, padding: 8 },
            border: { display: false },
            beginAtZero: true
        }
    },
    plugins: {
        legend: { display: false },
        tooltip: {
            backgroundColor: 'rgba(28, 28, 30, 0.9)',
            backdropFilter: 'blur(10px)',
            borderColor: 'rgba(255,255,255,0.1)',
            borderWidth: 1,
            titleColor: '#fff',
            titleFont: { size: 12, weight: 'bold' },
            bodyColor: 'rgba(255,255,255,0.7)',
            bodyFont: { size: 11 },
            padding: 12,
            cornerRadius: 12,
            displayColors: false,
            callbacks: { label: (ctx) => ` ${ctx.parsed.y}${unit || ''}` }
        }
    }
});

const RANGES = ['24h', '7d', '30d', '90d'];

// ── Test Results section (shared from Reports) ────────────────────────────────
const TestResultsSection = ({ repo }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        api.getTestReports(repo)
            .then(d => setData(Array.isArray(d) ? d : d?.tests || []))
            .catch(() => setData([]))
            .finally(() => setLoading(false));
    }, [repo]);

    if (loading) return <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: 13 }}>Loading test data...</div>;
    if (!data || data.length === 0) return (
        <div style={{ color: 'rgba(52,211,153,0.7)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircle2 size={14} /> No test runs recorded.
        </div>
    );

    let total = 0, passed = 0, failed = 0;
    const byWorkflow = {};

    for (const item of data) {
        const name = item.suite_name || item.workflow_name || 'Unknown';
        const t = parseInt(item.total_tests) || 0;
        const p = parseInt(item.passed) || 0;
        const f = parseInt(item.failed) || 0;
        if (t === 0) continue;

        if (!byWorkflow[name]) byWorkflow[name] = { total: 0, passed: 0, failed: 0 };
        byWorkflow[name].total += t;
        byWorkflow[name].passed += p;
        byWorkflow[name].failed += f;

        total += t;
        passed += p;
        failed += f;
    }

    const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;
    const workflowEntries = Object.entries(byWorkflow).filter(([, w]) => w.total > 0);

    return (
        <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
                <StatCard title="Total Tests" value={total} icon={Beaker} color="blue" />
                <StatCard title="Passed" value={passed} color="emerald" icon={CheckCircle2} />
                <StatCard title="Failed" value={failed} color={failed > 0 ? 'rose' : 'blue'} icon={XCircle} />
                <StatCard title="Pass Rate" value={`${passRate}%`} color={passRate >= 80 ? 'emerald' : passRate >= 60 ? 'orange' : 'rose'} icon={TrendingUp} />
            </div>

            {workflowEntries.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>By Workflow</div>
                    {workflowEntries.map(([name, w]) => {
                        const rate = w.total > 0 ? Math.round((w.passed / w.total) * 100) : 0;
                        return (
                            <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', width: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>{name}</div>
                                <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3 }}>
                                    <div style={{ height: '100%', borderRadius: 3, width: `${rate}%`, background: rate >= 80 ? '#34D399' : rate >= 60 ? '#FBBF24' : '#F87171', transition: 'width 0.6s ease' }} />
                                </div>
                                <span style={{ fontSize: 11, fontWeight: 700, color: rate >= 80 ? '#34D399' : rate >= 60 ? '#FBBF24' : '#F87171', width: 36, textAlign: 'right', flexShrink: 0 }}>{rate}%</span>
                                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', width: 50, textAlign: 'right', flexShrink: 0 }}>
                                    <span style={{ color: '#34D399' }}>{w.passed} </span>
                                    <span style={{ color: '#F87171' }}>{w.failed > 0 ? `${w.failed}` : ''}</span>
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

const Metrics = () => {
    const { selectedRepo, socket } = useAppContext();
    const [range, setRange] = useState('7d');
    const [loading, setLoading] = useState(true);
    const [charts, setCharts] = useState({});

    const [metricsData, setMetricsData] = useState(null);
    const [prevMetricsData, setPrevMetricsData] = useState(null);
    const controller = useRef(null);

    // Datadog connection state
    const [ddConnectionState, setDdConnectionState] = useState('unknown'); // 'unknown' | 'connected' | 'not_configured' | 'error'

    // Datadog panel state — shows PipelineXR metrics we push to Datadog
    const [ddEnabled, setDdEnabled] = useState(false);
    const DD_METRICS = [
        { query: 'build.success',          label: 'Build Successes',    color: '#34D399', unit: '' },
        { query: 'build.failure',          label: 'Build Failures',     color: '#F87171', unit: '' },
        { query: 'build.duration_seconds', label: 'Avg Build Duration', color: '#60A5FA', unit: 's' },
        { query: 'security.critical',      label: 'Critical Vulns',     color: '#EF4444', unit: '' },
        { query: 'security.high',          label: 'High Vulns',         color: '#F97316', unit: '' },
        { query: 'dora.success_rate',      label: 'DORA Success Rate',  color: '#A78BFA', unit: '%' },
    ];
    const [ddMetric, setDdMetric] = useState(DD_METRICS[0]);
    const [ddRange, setDdRange] = useState('24h');
    const [ddPoints, setDdPoints] = useState(null);
    const [ddLoading, setDdLoading] = useState(false);
    const [ddError, setDdError] = useState(null);

    const loadDatadog = useCallback(async (q, r) => {
        setDdLoading(true);
        setDdError(null);
        setDdConnectionState('unknown'); // Reset to unknown while loading
        try {
            const res = await api.queryDatadogMetric(q, r, selectedRepo || null);
            setDdPoints(res.points || []);
            setDdConnectionState('connected');
        } catch (e) {
            const errorMsg = e?.response?.data?.error || e.message || '';
            setDdError(errorMsg);
            setDdPoints([]);
            // Check if error is due to not configured vs actual error
            if (errorMsg.toLowerCase().includes('not configured') || errorMsg.toLowerCase().includes('api key') || e?.response?.status === 401) {
                setDdConnectionState('not_configured');
            } else {
                setDdConnectionState('error');
            }
        } finally {
            setDdLoading(false);
        }
    }, [selectedRepo]);

    const load = useCallback(async (r, force = false) => {
        if (!selectedRepo) {
            setMetricsData(null);
            setCharts({});
            setLoading(false);
            return;
        }

        // Show cache immediately
        if (!force) {
            const cached = cacheGet('metrics', selectedRepo, r);
            if (cached) {
                const { metricsData: md, charts: ch, prevMetricsData: pmd } = cached.data;
                setMetricsData(md);
                setCharts(ch);
                setPrevMetricsData(pmd);
                setLoading(false);
                if (!cached.stale) return;
                // stale — fall through to refresh silently (no loading spinner)
            } else {
                setLoading(true);
            }
        } else {
            setLoading(true);
        }

        if (controller.current) controller.current.abort();
        controller.current = new AbortController();

        try {
            // Auto-sync from GitHub API so data is always fresh — no webhook needed
            if (selectedRepo) {
                const days = r === '24h' ? 1 : r === '7d' ? 7 : r === '30d' ? 30 : 90;
                try {
                    await api.syncDoraMetrics(selectedRepo, days);
                } catch (syncErr) {
                    console.warn('DORA sync failed (continuing with cached data):', syncErr.message);
                }
            }

            // Fetch current and previous period data for trend calculation
            const days = r === '24h' ? 1 : r === '7d' ? 7 : r === '30d' ? 30 : 90;
            const [data, fullData] = await Promise.all([
                api.getDoraMetrics(selectedRepo || null, r),
                api.getDoraMetrics(selectedRepo || null, `${days * 2}d`), // Double period for previous comparison
            ]);
            setMetricsData(data);

            // Calculate current CFR from data if not present
            let currentCFR = 0;
            if (data?.rawRuns) {
                const totalRuns = data.rawRuns.length;
                const failedRuns = data.rawRuns.filter(run => run.conclusion && run.conclusion !== 'success').length;
                currentCFR = totalRuns > 0 ? Math.round((failedRuns / totalRuns) * 100) : 0;
            }
            // Don't mutate the API response — create new object with CFR
            const enrichedData = { ...data, changeFailureRate: currentCFR };
            setMetricsData(enrichedData);

            // Calculate previous period metrics for trends
            let newPrevMetrics = null;
            if (fullData?.rawRuns) {
                const cutoff = new Date();
                cutoff.setDate(cutoff.getDate() - days);
                const prevRuns = fullData.rawRuns.filter(run => new Date(run.run_started_at) < cutoff);
                const prevTotal = prevRuns.length;
                const prevSuccess = prevRuns.filter(run => run.conclusion === 'success').length;
                const prevFailed = prevRuns.filter(run => run.conclusion && run.conclusion !== 'success').length;
                const prevSuccessRate = prevTotal > 0 ? Math.round((prevSuccess / prevTotal) * 100) : 0;
                const prevDurations = prevRuns.map(run => (new Date(run.updated_at) - new Date(run.run_started_at)) / 60000).filter(v => v > 0);
                const prevAvgDuration = prevDurations.length ? Math.round((prevDurations.reduce((a, b) => a + b, 0) / prevDurations.length) * 10) / 10 : 0;
                const prevDeployFreq = days > 0 ? Math.round((prevSuccess / days) * 10) / 10 : 0;
                const prevCFR = prevTotal > 0 ? Math.round((prevFailed / prevTotal) * 100) : 0;
                newPrevMetrics = {
                    deploymentFrequency: prevDeployFreq,
                    totalDeployments: prevSuccess,
                    successRate: prevSuccessRate,
                    avgBuildDuration: prevAvgDuration,
                    changeFailureRate: prevCFR
                };
                setPrevMetricsData(newPrevMetrics);
            } else {
                setPrevMetricsData(null);
            }

            if (enrichedData && enrichedData.rawRuns) {
                const chartDays = r === '24h' ? 1 : r === '7d' ? 7 : r === '30d' ? 30 : 90;
                const use24h = r === '24h';
                const now = new Date();

                // For 24h: slot by hour (24 slots). For longer ranges: slot by day.
                let slots = [];
                let slotKey; // fn: run -> slot string
                let fmtLabel; // fn: slot string -> display label

                if (use24h) {
                    // 24 hourly slots: "YYYY-MM-DDTHH"
                    for (let i = 23; i >= 0; i--) {
                        const d = new Date(now);
                        d.setMinutes(0, 0, 0);
                        d.setHours(d.getHours() - i);
                        slots.push(d.toISOString().slice(0, 13)); // "2026-03-20T14"
                    }
                    slotKey = (run) => (run.run_started_at || '').slice(0, 13);
                    fmtLabel = (s) => {
                        const h = parseInt(s.slice(11, 13), 10);
                        const ampm = h >= 12 ? 'PM' : 'AM';
                        return `${h % 12 || 12}${ampm}`;
                    };
                } else {
                    // Daily slots: "YYYY-MM-DD"
                    for (let i = chartDays - 1; i >= 0; i--) {
                        const d = new Date(now);
                        d.setDate(d.getDate() - i);
                        slots.push(d.toISOString().split('T')[0]);
                    }
                    slotKey = (run) => (run.run_started_at || '').split('T')[0];
                    fmtLabel = (s) => new Date(s + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                }

                // Group runs by slot
                const bySlot = {};
                for (const run of enrichedData.rawRuns) {
                    const key = slotKey(run);
                    if (!key) continue;
                    if (!bySlot[key]) bySlot[key] = [];
                    bySlot[key].push(run);
                }

                const labels = slots.map(fmtLabel);

                // Build per-metric aggregated values per slot
                const buildDurationData = slots.map(slot => {
                    const runs = bySlot[slot];
                    if (!runs || runs.length === 0) return 0;
                    const durations = runs.map(run => {
                        const start = new Date(run.run_started_at);
                        const end = new Date(run.updated_at);
                        return (end - start) / 60000;
                    }).filter(v => v > 0);
                    if (durations.length === 0) return 0;
                    return parseFloat((durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(1));
                });

                const successRateData = slots.map(slot => {
                    const runs = bySlot[slot];
                    if (!runs || runs.length === 0) return 0;
                    const pct = (runs.filter(run => run.conclusion === 'success').length / runs.length) * 100;
                    return parseFloat(pct.toFixed(1));
                });

                const deployFreqData = slots.map(slot => {
                    const runs = bySlot[slot];
                    return runs ? runs.filter(run => run.conclusion === 'success').length : 0;
                });

                // Change Failure Rate (CFR) - percentage of deployments that failed
                const cfrData = slots.map(slot => {
                    const runs = bySlot[slot];
                    if (!runs || runs.length === 0) return 0;
                    const failed = runs.filter(run => run.conclusion && run.conclusion !== 'success').length;
                    const pct = (failed / runs.length) * 100;
                    return parseFloat(pct.toFixed(1));
                });

                // Point radius: show dot only on slots that have actual data
                const hasData = slots.map(slot => !!bySlot[slot]);
                const pointRadii = (dataArr) => dataArr.map((v, i) => hasData[i] ? 4 : 0);
                const pointHoverRadii = (dataArr) => dataArr.map((v, i) => hasData[i] ? 6 : 0);

                const newCharts = {
                    buildDuration: {
                        labels,
                        datasets: [{
                            label: 'Avg Build Duration (m)',
                            data: buildDurationData,
                            borderColor: '#60A5FA',
                            backgroundColor: (context) => {
                                const ctx = context.chart.ctx;
                                const g = ctx.createLinearGradient(0, 0, 0, 300);
                                g.addColorStop(0, 'rgba(96, 165, 250, 0.2)');
                                g.addColorStop(1, 'rgba(96, 165, 250, 0)');
                                return g;
                            },
                            fill: true, tension: 0.4,
                            pointRadius: pointRadii(buildDurationData),
                            pointHoverRadius: pointHoverRadii(buildDurationData),
                            pointBackgroundColor: '#60A5FA', pointBorderColor: '#fff',
                        }]
                    },
                    successRate: {
                        labels,
                        datasets: [{
                            label: 'Success Rate (%)',
                            data: successRateData,
                            borderColor: '#34D399',
                            backgroundColor: (context) => {
                                const ctx = context.chart.ctx;
                                const g = ctx.createLinearGradient(0, 0, 0, 300);
                                g.addColorStop(0, 'rgba(52, 211, 153, 0.2)');
                                g.addColorStop(1, 'rgba(52, 211, 153, 0)');
                                return g;
                            },
                            fill: true, tension: 0.4,
                            pointRadius: pointRadii(successRateData),
                            pointHoverRadius: pointHoverRadii(successRateData),
                            pointBackgroundColor: '#34D399', pointBorderColor: '#fff',
                        }]
                    },
                    deployFreq: {
                        labels,
                        datasets: [{
                            label: 'Successful Deployments',
                            data: deployFreqData,
                            backgroundColor: (context) => {
                                const ctx = context.chart.ctx;
                                const g = ctx.createLinearGradient(0, 0, 0, 300);
                                g.addColorStop(0, '#8B5CF6');
                                g.addColorStop(1, 'rgba(139, 92, 246, 0.2)');
                                return g;
                            },
                            borderRadius: 6, borderSkipped: false, barThickness: use24h ? 8 : days <= 7 ? 20 : days <= 30 ? 10 : 5,
                        }]
                    },
                    cfr: {
                        labels,
                        datasets: [{
                            label: 'Change Failure Rate (%)',
                            data: cfrData,
                            borderColor: '#F87171',
                            backgroundColor: (context) => {
                                const ctx = context.chart.ctx;
                                const g = ctx.createLinearGradient(0, 0, 0, 300);
                                g.addColorStop(0, 'rgba(248, 113, 113, 0.2)');
                                g.addColorStop(1, 'rgba(248, 113, 113, 0)');
                                return g;
                            },
                            fill: true, tension: 0.4,
                            pointRadius: pointRadii(cfrData),
                            pointHoverRadius: pointHoverRadii(cfrData),
                            pointBackgroundColor: '#F87171', pointBorderColor: '#fff',
                        }]
                    },
                };

                setCharts(newCharts);

                // Cache for instant re-render on next visit — use freshly computed prevMetrics, not stale state
                cacheSet('metrics', selectedRepo, { metricsData: enrichedData, charts: newCharts, prevMetricsData: newPrevMetrics }, r);
            }

        } catch (e) {
            if (e.name !== 'AbortError') console.error(e);
        } finally { setLoading(false); }
    }, [selectedRepo]);

    useEffect(() => { load(range); }, [range, load]);

    // Only show the Datadog panel when a repo is selected — data comes from local DB
    useEffect(() => {
        if (!selectedRepo) {
            setDdEnabled(false);
            setDdPoints(null);
            return;
        }
        setDdEnabled(true);
        loadDatadog(ddMetric.query, ddRange);
    }, [selectedRepo]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!socket) return;
        
        const handleWebhook = (data) => {
            if (data.event === 'workflow_run') {
                console.log('Workflow run updated, refreshing metrics');
                load(range);
            }
        };

        const handleMetricsUpdate = () => {
             console.log('Metrics broadcast updated, refreshing');
             load(range);
        };

        socket.on('github_webhook', handleWebhook);
        socket.on('METRICS_UPDATE', handleMetricsUpdate);

        return () => {
            socket.off('github_webhook', handleWebhook);
            socket.off('METRICS_UPDATE', handleMetricsUpdate);
        };
    }, [socket, load, range]);

    // Calculate real trends comparing current vs previous period
    const durTrend = prevMetricsData ? calcTrend(metricsData?.avgBuildDuration ?? 0, prevMetricsData.avgBuildDuration) : null;
    const depTrend = prevMetricsData ? calcTrend(metricsData?.totalDeployments ?? 0, prevMetricsData.totalDeployments) : null;
    const srTrend = prevMetricsData ? calcTrend(metricsData?.successRate ?? 0, prevMetricsData.successRate) : null;
    const cfrTrend = prevMetricsData ? calcTrend(metricsData?.changeFailureRate ?? 0, prevMetricsData.changeFailureRate) : null;

    const kpis = [
        { title: 'Avg Build Duration', value: metricsData ? `${metricsData.avgBuildDuration}m` : '…', subtitle: `Last ${range}`, icon: Clock, color: 'blue', ...(durTrend ? { trend: durTrend.trend, trendUp: !durTrend.trendUp } : {}) },
        { title: 'Total Deployments', value: metricsData ? metricsData.totalDeployments : '…', subtitle: `Last ${range}`, icon: BarChart2, color: 'purple', ...(depTrend || {}) },
        { title: 'Success Rate', value: metricsData ? `${metricsData.successRate}%` : '…', subtitle: 'Pipeline Average', icon: Activity, color: 'emerald', ...(srTrend || {}) },
        { title: 'Change Failure Rate', value: metricsData ? `${metricsData.changeFailureRate ?? 0}%` : '…', subtitle: 'Failed / Total', icon: AlertTriangle, color: 'rose', ...(cfrTrend ? { trend: cfrTrend.trend, trendUp: !cfrTrend.trendUp } : {}) },
    ];

    return (
        <div style={{ padding: '32px', maxWidth: 1400, margin: '0 auto', animation: 'fadeIn 0.5s ease-out' }}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 32 }}>
                <div>
                    <h1 style={{ fontSize: 32, fontWeight: 800, color: '#fff', letterSpacing: '-0.04em', margin: 0 }}>
                        Performance Analysis
                    </h1>
                    <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
                        DORA metrics and build efficiency benchmarks{selectedRepo ? ` for ${selectedRepo}` : ''}
                    </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ display: 'flex', background: 'rgba(255,255,255,0.03)', padding: 4, borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
                        {RANGES.map(r => (
                            <button key={r} onClick={() => setRange(r)}
                                style={{
                                    padding: '6px 14px',
                                    borderRadius: 9,
                                    fontSize: 12,
                                    fontWeight: 600,
                                    transition: 'all 0.2s',
                                    border: 'none',
                                    cursor: 'pointer',
                                    background: range === r ? 'rgba(255,255,255,0.1)' : 'transparent',
                                    color: range === r ? '#fff' : 'rgba(255,255,255,0.4)',
                                }}
                            >
                                {r}
                            </button>
                        ))}
                    </div>
                    <button onClick={() => load(range, true)}
                        style={{
                            width: 38, height: 38, borderRadius: 12,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                            color: 'rgba(255,255,255,0.6)', cursor: 'pointer'
                        }}
                    >
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {/* KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20, marginBottom: 32 }}>
                {kpis.map((k, i) => (
                    <div key={k.title} style={{ animation: `slideUp 0.5s ease-out ${i * 0.1}s both` }}>
                        <StatCard {...k} loading={loading} />
                    </div>
                ))}
            </div>

            {/* Empty state — no repo selected */}
            {!selectedRepo && (
                <div style={{ padding: 60, textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: 24, border: '1px dashed rgba(255,255,255,0.1)' }}>
                    <BarChart2 size={48} style={{ color: 'rgba(255,255,255,0.1)', margin: '0 auto 16px' }} />
                    <div style={{ color: '#fff', fontWeight: 600 }}>No repository selected</div>
                    <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, marginTop: 4 }}>Select a repository from the top bar to view metrics.</div>
                </div>
            )}

            {/* Empty state (no workflow run data) */}
{!loading && selectedRepo && (!metricsData?.rawRuns || metricsData.rawRuns.length === 0) && (
  <div
    style={{
      marginBottom: 24,
      padding: 16,
      borderRadius: 14,
      border: '1px solid rgba(255,255,255,0.08)',
      background: 'rgba(255,255,255,0.03)',
      color: 'rgba(255,255,255,0.75)',
    }}
  >
    <div style={{ fontWeight: 700, color: '#fff', marginBottom: 6 }}>
      No workflow run data yet
    </div>
    <div style={{ fontSize: 13, lineHeight: 1.5, color: 'rgba(255,255,255,0.55)' }}>
      We haven’t recorded any GitHub Actions workflow runs for the selected repository in the last <b>{range}</b>.
      Trigger a workflow (or ensure GitHub webhooks are configured) to populate build duration, success rate,
      deployment frequency, and lead time charts.
    </div>
  </div>
)}

            {/* Charts Grid */}
            {selectedRepo && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                <ChartCard title="Build Efficiency" icon={Clock} badge={{ label: 'Mins', className: 'badge-blue' }}>
                    {loading ? <div className="h-full skeleton rounded-xl" /> : charts.buildDuration ? <Line key={`bd-${range}`} data={charts.buildDuration} options={LINE_OPTS('Duration', 'm')} /> : <div className="flex h-full w-full items-center justify-center text-slate-500 text-sm">No data available</div>}
                </ChartCard>
                <ChartCard title="Mission Success" icon={Target} badge={{ label: 'Percentage', className: 'badge-green' }}>
                    {loading ? <div className="h-full skeleton rounded-xl" /> : charts.successRate ? <Line key={`sr-${range}`} data={charts.successRate} options={LINE_OPTS('Rate', '%')} /> : <div className="flex h-full w-full items-center justify-center text-slate-500 text-sm">No data available</div>}
                </ChartCard>
                <ChartCard title="Deployment Frequency" icon={BarChart2} badge={{ label: 'Volume', className: 'badge-muted' }}>
                    {loading ? <div className="h-full skeleton rounded-xl" /> : charts.deployFreq ? <Bar key={`df-${range}`} data={charts.deployFreq} options={LINE_OPTS('Deploys')} /> : <div className="flex h-full w-full items-center justify-center text-slate-500 text-sm">No data available</div>}
                </ChartCard>
                <ChartCard title="Change Failure Rate" icon={AlertTriangle} badge={{ label: 'Percentage', className: 'badge-rose' }}>
                    {loading ? <div className="h-full skeleton rounded-xl" /> : charts.cfr ? <Line key={`cfr-${range}`} data={charts.cfr} options={LINE_OPTS('CFR', '%')} /> : <div className="flex h-full w-full items-center justify-center text-slate-500 text-sm">No data available</div>}
                </ChartCard>
            </div>
            )}

            {/* Test Results */}
            {selectedRepo && (
                <div style={{ marginTop: 32, background: 'rgba(28,28,30,0.4)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 24, padding: 28 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                        <Beaker size={18} color="#60A5FA" />
                        <span style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>Test Results</span>
                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>from recorded workflow runs</span>
                    </div>
                    <TestResultsSection repo={selectedRepo} />
                </div>
            )}

            {/* AI DORA Insights */}
            {selectedRepo && !loading && metricsData && (
                <div style={{ marginTop: 32 }}>
                    <AiInsightPanel
                        key={`ai-${range}`}
                        title="AI DORA Insights"
                        onFetch={() => api.getDoraInsights(selectedRepo, range)}
                    />
                </div>
            )}

            {/* Datadog Live Metrics */}
            {ddEnabled && (
                <div style={{ marginTop: 32, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 24, padding: 24 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
                        <Database size={16} color="#7C3AED" />
                        <span style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>Datadog — PipelineXR Metrics</span>
                        {ddConnectionState === 'connected' && (
                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: 'rgba(52,211,153,0.15)', color: '#34D399', border: '1px solid rgba(52,211,153,0.3)' }}>connected</span>
                        )}
                        {ddConnectionState === 'not_configured' && (
                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: 'rgba(251,191,36,0.15)', color: '#FBBF24', border: '1px solid rgba(251,191,36,0.3)' }}>not configured</span>
                        )}
                        {ddConnectionState === 'error' && (
                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: 'rgba(248,113,113,0.15)', color: '#F87171', border: '1px solid rgba(248,113,113,0.3)' }}>connection error</span>
                        )}
                        {ddConnectionState === 'unknown' && (
                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.1)' }}>checking...</span>
                        )}
                    </div>

                    {/* Metric selector + range */}
                    <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
                        {DD_METRICS.map(m => (
                            <button key={m.query}
                                onClick={() => { setDdMetric(m); loadDatadog(m.query, ddRange); }}                                style={{
                                    padding: '7px 14px', borderRadius: 10, fontSize: 12, fontWeight: 600,
                                    border: `1px solid ${ddMetric.query === m.query ? m.color : 'rgba(255,255,255,0.08)'}`,
                                    cursor: 'pointer', transition: 'all 0.2s',
                                    background: ddMetric.query === m.query ? `${m.color}22` : 'rgba(255,255,255,0.03)',
                                    color: ddMetric.query === m.query ? m.color : 'rgba(255,255,255,0.4)',
                                }}
                            >{m.label}</button>
                        ))}
                        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                            {['1h', '6h', '24h', '7d'].map(r => (
                                <button key={r} onClick={() => { setDdRange(r); loadDatadog(ddMetric.query, r); }}
                                    style={{
                                        padding: '7px 12px', borderRadius: 9, fontSize: 12, fontWeight: 600,
                                        border: 'none', cursor: 'pointer',
                                        background: ddRange === r ? 'rgba(124,58,237,0.3)' : 'rgba(255,255,255,0.04)',
                                        color: ddRange === r ? '#A78BFA' : 'rgba(255,255,255,0.4)',
                                    }}
                                >{r}</button>
                            ))}
                            <button onClick={() => loadDatadog(ddMetric.query, ddRange)}
                                style={{ padding: '7px 12px', borderRadius: 9, fontSize: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}
                            ><RefreshCw size={12} className={ddLoading ? 'animate-spin' : ''} /></button>
                        </div>
                    </div>

                    {/* Chart */}
                    <div style={{
                        background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.05)',
                        borderRadius: 16, padding: 24, minHeight: 220,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        {ddLoading && <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Loading…</span>}
                        {ddConnectionState === 'not_configured' && !ddLoading && (
                            <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>
                                <div>Datadog is not configured</div>
                                <div style={{ fontSize: 11, marginTop: 4, color: 'rgba(255,255,255,0.3)' }}>Set DATADOG_API_KEY and DATADOG_APP_KEY to enable metrics</div>
                            </div>
                        )}
                        {ddConnectionState === 'error' && ddError && (
                            <div style={{ textAlign: 'center', color: '#F87171', fontSize: 13 }}>
                                <div>Connection failed</div>
                                <div style={{ fontSize: 11, marginTop: 4, color: 'rgba(255,255,255,0.4)' }}>{ddError}</div>
                            </div>
                        )}
                        {ddConnectionState === 'connected' && !ddLoading && !ddError && ddPoints !== null && (
                            ddPoints.length === 0
                                ? <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>No data yet — metrics will appear after pipelines run.</span>
                                : <div style={{ width: '100%', height: 200 }}>
                                    <Line
                                        data={{
                                            labels: ddPoints.map(p => new Date(p.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })),
                                            datasets: [{
                                                label: ddMetric.label,
                                                data: ddPoints.map(p => p.value?.toFixed ? Number(p.value.toFixed(2)) : p.value),
                                                borderColor: ddMetric.color,
                                                backgroundColor: (ctx) => {
                                                    const g = ctx.chart.ctx.createLinearGradient(0, 0, 0, 200);
                                                    g.addColorStop(0, `${ddMetric.color}40`);
                                                    g.addColorStop(1, `${ddMetric.color}00`);
                                                    return g;
                                                },
                                                fill: true, tension: 0.4, pointRadius: 3, pointBackgroundColor: ddMetric.color,
                                            }]
                                        }}
                                        options={LINE_OPTS(ddMetric.label, ddMetric.unit)}
                                    />
                                  </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default Metrics;
