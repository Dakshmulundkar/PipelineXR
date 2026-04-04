import { useState, useEffect, useCallback } from 'react';
import {
    FileText, Download, RefreshCw, Shield, TrendingUp,
    CheckCircle2, XCircle, AlertTriangle, Activity,
    Clock, Zap, BarChart2
} from 'lucide-react';
import { Bar, Line } from 'react-chartjs-2';
import {
    Chart as ChartJS, CategoryScale, LinearScale, BarElement,
    PointElement, LineElement, Title, Tooltip, Legend, Filler
} from 'chart.js';
import { api } from '../services/api';
import { useAppContext } from '../contexts/AppContext';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const GRADE_COLOR = { Elite: '#34D399', High: '#60A5FA', Medium: '#FBBF24', Low: '#F87171' };
const SEV_COLOR   = { critical: '#F87171', high: '#FB923C', medium: '#FBBF24', low: '#60A5FA' };

// ── Stat card ─────────────────────────────────────────────────────────────────
const StatCard = ({ label, value, sub, color = '#fff', icon: Icon }) => (
    <div style={{ background: 'rgba(28,28,30,0.4)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: '20px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
                <div style={{ fontSize: 28, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)', marginTop: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
                {sub && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 4 }}>{sub}</div>}
            </div>
            {Icon && <Icon size={18} style={{ color: 'rgba(255,255,255,0.1)' }} />}
        </div>
    </div>
);

// ── Section header ────────────────────────────────────────────────────────────
const SectionHeader = ({ icon: Icon, color, title, sub }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <Icon size={16} style={{ color }} />
        <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{title}</span>
        {sub && <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>{sub}</span>}
    </div>
);

// ── DORA section ──────────────────────────────────────────────────────────────
const DoraSection = ({ repo, timeRange }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        api.getDoraMetrics(repo, timeRange)
            .then(setData)
            .catch(() => setData(null))
            .finally(() => setLoading(false));
    }, [repo, timeRange]);

    const grade = data?.performanceGrade || data?.performance_grade || null;
    const successRate = data?.successRate ?? data?.success_rate ?? null;
    const avgBuild = data?.avgBuildDuration ?? data?.avg_build_duration ?? null;
    const totalDeploys = data?.totalDeployments ?? data?.total_deployments ?? 0;
    const trendData = data?.trendData || data?.trend_data || [];

    const chartData = trendData.length > 1 ? {
        labels: trendData.map(d => new Date(d.timestamp || d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
        datasets: [{
            label: 'Success Rate %',
            data: trendData.map(d => d.value ?? d.success_rate ?? 0),
            borderColor: '#34D399',
            backgroundColor: 'rgba(52,211,153,0.08)',
            fill: true, tension: 0.4,
            pointRadius: 3, pointBackgroundColor: '#34D399',
        }]
    } : null;

    const chartOpts = {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(28,28,30,0.95)', titleColor: '#fff', bodyColor: 'rgba(255,255,255,0.7)', padding: 10, cornerRadius: 10 } },
        scales: {
            x: { grid: { display: false }, ticks: { color: 'rgba(255,255,255,0.3)', font: { size: 10 } }, border: { display: false } },
            y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: 'rgba(255,255,255,0.3)', font: { size: 10 } }, border: { display: false }, beginAtZero: true, max: 100 },
        },
    };

    if (loading) return <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.2)', fontSize: 13 }}>Loading DORA metrics...</div>;
    if (!data) return <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: 13 }}>No DORA data available — sync pipeline runs first.</div>;

    return (
        <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
                <StatCard label="Deployments" value={totalDeploys} sub={`last ${timeRange}`} icon={Zap} />
                <StatCard label="Success Rate" value={successRate != null ? `${Math.round(successRate)}%` : '—'} color={successRate >= 90 ? '#34D399' : successRate >= 70 ? '#FBBF24' : '#F87171'} icon={CheckCircle2} />
                <StatCard label="Avg Build" value={avgBuild != null ? `${Math.round(avgBuild)}m` : '—'} icon={Clock} />
                <StatCard label="DORA Grade" value={grade || '—'} color={GRADE_COLOR[grade] || '#fff'} icon={BarChart2} />
            </div>
            {chartData && (
                <div style={{ height: 120 }}>
                    <Line data={chartData} options={chartOpts} />
                </div>
            )}
        </div>
    );
};

// ── Security section ──────────────────────────────────────────────────────────
const SecuritySection = ({ data, loading }) => {

    if (loading) return <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: 13 }}>Loading security data...</div>;
    if (!data || data.total === 0) return <div style={{ color: 'rgba(52,211,153,0.7)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}><CheckCircle2 size={14} /> No open vulnerabilities found.</div>;

    const sevs = [
        { key: 'critical', label: 'Critical', count: data.critical || 0 },
        { key: 'high',     label: 'High',     count: data.high     || 0 },
        { key: 'medium',   label: 'Medium',   count: data.medium   || 0 },
        { key: 'low',      label: 'Low',      count: data.low      || 0 },
    ];

    const barData = {
        labels: sevs.map(s => s.label),
        datasets: [{
            data: sevs.map(s => s.count),
            backgroundColor: sevs.map(s => `${SEV_COLOR[s.key]}80`),
            borderColor: sevs.map(s => SEV_COLOR[s.key]),
            borderWidth: 1, borderRadius: 6,
        }]
    };
    const barOpts = {
        responsive: true, maintainAspectRatio: false, indexAxis: 'y',
        plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(28,28,30,0.95)', titleColor: '#fff', bodyColor: 'rgba(255,255,255,0.7)', padding: 10, cornerRadius: 10 } },
        scales: {
            x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: 'rgba(255,255,255,0.3)', font: { size: 10 } }, border: { display: false }, beginAtZero: true },
            y: { grid: { display: false }, ticks: { color: 'rgba(255,255,255,0.5)', font: { size: 11, weight: '600' } }, border: { display: false } },
        },
    };

    const posture = (data.critical || 0) > 0 ? 'critical' : (data.high || 0) > 0 ? 'at-risk' : 'secure';
    const postureColor = posture === 'critical' ? '#F87171' : posture === 'at-risk' ? '#FBBF24' : '#34D399';

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div style={{ padding: '4px 12px', borderRadius: 8, background: `${postureColor}15`, border: `1px solid ${postureColor}40`, fontSize: 11, fontWeight: 800, color: postureColor, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {posture}
                </div>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>{data.total} open vulnerabilities</span>
                {data.lastScanned && <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', marginLeft: 'auto' }}>Last scan: {new Date(data.lastScanned).toLocaleDateString()}</span>}
            </div>
            <div style={{ height: 100 }}>
                <Bar data={barData} options={barOpts} />
            </div>
        </div>
    );
};

// ── Build stability timeline (Jenkins-style) ──────────────────────────────────
// ── Build stability — non-technical card view ─────────────────────────────────
const _now = () => Date.now();

const BuildStabilitySection = ({ repo }) => {
    const [runs, setRuns] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        api.getPipelineRuns(60, repo)
            .then(data => setRuns(Array.isArray(data) ? data : data?.runs || []))
            .catch(() => setRuns([]))
            .finally(() => setLoading(false));
    }, [repo]);

    if (loading) return <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: 13 }}>Loading build history...</div>;
    if (!runs || runs.length === 0) return <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: 13 }}>No build history found.</div>;

    // Per-workflow stats
    const byWorkflow = {};
    for (const r of runs) {
        const name = r.workflow_name || 'Unknown';
        if (!byWorkflow[name]) byWorkflow[name] = { total: 0, success: 0, failed: 0, lastRun: null, lastConclusion: null };
        byWorkflow[name].total++;
        if (r.conclusion === 'success') byWorkflow[name].success++;
        if (r.conclusion === 'failure') byWorkflow[name].failed++;
        const ts = r.run_started_at || r.created_at;
        if (!byWorkflow[name].lastRun || ts > byWorkflow[name].lastRun) {
            byWorkflow[name].lastRun = ts;
            byWorkflow[name].lastConclusion = r.conclusion;
        }
    }

    // Consecutive failure streak (most recent first)
    const recent = [...runs].sort((a, b) => new Date(b.run_started_at || b.created_at) - new Date(a.run_started_at || a.created_at));
    let streak = 0;
    for (const r of recent) { if (r.conclusion === 'failure') streak++; else break; }

    const timeAgo = (ts) => {
        if (!ts) return '—';
        const diff = (_now() - new Date(ts)) / 1000;
        if (diff < 3600)  return `${Math.round(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
        return `${Math.round(diff / 86400)}d ago`;
    };

    const healthLabel = (rate) => rate >= 90 ? 'Healthy' : rate >= 70 ? 'Needs attention' : 'Failing';
    const healthColor = (rate) => rate >= 90 ? '#34D399' : rate >= 70 ? '#FBBF24' : '#F87171';
    const healthBg    = (rate) => rate >= 90 ? 'rgba(52,211,153,0.08)' : rate >= 70 ? 'rgba(251,191,36,0.08)' : 'rgba(248,113,113,0.08)';

    return (
        <div>
            {/* Streak alert */}
            {streak >= 2 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, padding: '12px 16px', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 12 }}>
                    <AlertTriangle size={14} color="#F87171" />
                    <div>
                        <div style={{ fontSize: 13, color: '#F87171', fontWeight: 700 }}>Build is broken</div>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                            The last {streak} runs failed in a row. Someone needs to investigate.
                        </div>
                    </div>
                </div>
            )}

            {/* Workflow cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {Object.entries(byWorkflow).map(([name, w]) => {
                    const rate = Math.round((w.success / w.total) * 100);
                    const isUp = w.lastConclusion === 'success';
                    const statusColor = isUp ? '#34D399' : '#F87171';

                    return (
                        <div key={name} style={{ padding: '14px 18px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, display: 'flex', alignItems: 'center', gap: 16 }}>
                            {/* Status dot */}
                            <div style={{ width: 10, height: 10, borderRadius: '50%', background: statusColor, flexShrink: 0, boxShadow: isUp ? `0 0 8px ${statusColor}60` : 'none' }} />

                            {/* Name + last run */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
                                    Last ran {timeAgo(w.lastRun)} · {w.total} total runs
                                </div>
                            </div>

                            {/* Pass/fail counts */}
                            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: 14, fontWeight: 800, color: '#34D399' }}>{w.success}</div>
                                    <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase' }}>passed</div>
                                </div>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: 14, fontWeight: 800, color: w.failed > 0 ? '#F87171' : 'rgba(255,255,255,0.2)' }}>{w.failed}</div>
                                    <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase' }}>failed</div>
                                </div>
                            </div>

                            {/* Health badge */}
                            <div style={{ padding: '4px 12px', borderRadius: 8, background: healthBg(rate), fontSize: 11, fontWeight: 700, color: healthColor(rate), flexShrink: 0, minWidth: 80, textAlign: 'center' }}>
                                {healthLabel(rate)} · {rate}%
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
const PipelineSection = ({ repo, timeRange }) => {
    const [runs, setRuns] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        api.getPipelineRuns(50, repo)
            .then(data => setRuns(Array.isArray(data) ? data : data?.runs || []))
            .catch(() => setRuns([]))
            .finally(() => setLoading(false));
    }, [repo, timeRange]);

    if (loading) return <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: 13 }}>Loading pipeline data...</div>;
    if (!runs || runs.length === 0) return <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: 13 }}>No pipeline runs found.</div>;

    const total   = runs.length;
    const success = runs.filter(r => r.conclusion === 'success').length;
    const failed  = runs.filter(r => r.conclusion === 'failure').length;
    const rate    = total > 0 ? Math.round((success / total) * 100) : 0;

    // Group by workflow name for per-workflow breakdown
    const byWorkflow = {};
    for (const r of runs) {
        const name = r.workflow_name || 'Unknown';
        if (!byWorkflow[name]) byWorkflow[name] = { total: 0, success: 0 };
        byWorkflow[name].total++;
        if (r.conclusion === 'success') byWorkflow[name].success++;
    }
    const workflows = Object.entries(byWorkflow)
        .map(([name, d]) => ({ name, total: d.total, rate: Math.round((d.success / d.total) * 100) }))
        .sort((a, b) => a.rate - b.rate)
        .slice(0, 5);

    return (
        <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
                <StatCard label="Total Runs" value={total} icon={Activity} />
                <StatCard label="Success Rate" value={`${rate}%`} color={rate >= 90 ? '#34D399' : rate >= 70 ? '#FBBF24' : '#F87171'} icon={CheckCircle2} />
                <StatCard label="Failures" value={failed} color={failed > 0 ? '#F87171' : '#34D399'} icon={XCircle} />
            </div>
            {workflows.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Workflow Breakdown</div>
                    {workflows.map(w => (
                        <div key={w.name} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', width: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>{w.name}</div>
                            <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3 }}>
                                <div style={{ height: '100%', borderRadius: 3, width: `${w.rate}%`, background: w.rate >= 90 ? '#34D399' : w.rate >= 70 ? '#FBBF24' : '#F87171', transition: 'width 0.6s ease' }} />
                            </div>
                            <span style={{ fontSize: 11, fontWeight: 700, color: w.rate >= 90 ? '#34D399' : w.rate >= 70 ? '#FBBF24' : '#F87171', width: 36, textAlign: 'right', flexShrink: 0 }}>{w.rate}%</span>
                            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', width: 40, textAlign: 'right', flexShrink: 0 }}>{w.total} runs</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

// ── Main Reports page ─────────────────────────────────────────────────────────
const Reports = () => {
    const { selectedRepo } = useAppContext();
    const { secSummary: ctxSecSummary } = useAppContext();
    const [timeRange, setTimeRange] = useState('7d');
    const [downloading, setDownloading] = useState(false);
    const [syncing, setSyncing] = useState(false);

    const handleSync = useCallback(async () => {
        if (!selectedRepo) return;
        setSyncing(true);
        try {
            await api.syncDoraMetrics(selectedRepo, timeRange === '30d' ? 30 : timeRange === '90d' ? 90 : 7);
        } catch (e) {
            console.warn('Sync failed:', e.message);
        } finally {
            setSyncing(false);
        }
    }, [selectedRepo, timeRange]);

    const handleDownloadPdf = async () => {
        setDownloading(true);
        try {
            const blob = await api.generateReportPdf(selectedRepo || null);
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `pipelinexr-report-${selectedRepo?.replace('/', '-') || 'all'}.pdf`;
            document.body.appendChild(a); a.click(); a.remove();
            window.URL.revokeObjectURL(url);
        } catch (e) {
            console.error('PDF failed:', e);
        } finally {
            setDownloading(false);
        }
    };

    if (!selectedRepo) return (
        <div style={{ padding: 40, color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>
            Select a repository to view the health report.
        </div>
    );

    return (
        <div style={{ padding: '32px', maxWidth: 1200, margin: '0 auto', animation: 'fadeIn 0.5s ease-out' }}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 32 }}>
                <div>
                    <h1 style={{ fontSize: 32, fontWeight: 800, color: '#fff', letterSpacing: '-0.04em', margin: 0 }}>Health Report</h1>
                    <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
                        Cross-domain engineering health digest · {selectedRepo}
                    </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {/* Time range selector */}
                    <div style={{ display: 'flex', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, overflow: 'hidden' }}>
                        {['7d', '30d', '90d'].map(r => (
                            <button key={r} onClick={() => setTimeRange(r)} style={{ padding: '8px 14px', fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer', background: timeRange === r ? 'rgba(255,255,255,0.1)' : 'transparent', color: timeRange === r ? '#fff' : 'rgba(255,255,255,0.4)', transition: 'all 0.15s' }}>
                                {r}
                            </button>
                        ))}
                    </div>
                    <button onClick={handleSync} disabled={syncing} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)', padding: '8px 14px', borderRadius: 10, fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, cursor: syncing ? 'not-allowed' : 'pointer', opacity: syncing ? 0.6 : 1 }}>
                        <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} /> {syncing ? 'Syncing...' : 'Sync'}
                    </button>
                    <button onClick={handleDownloadPdf} disabled={downloading} style={{ background: 'rgba(255,255,255,0.05)', color: '#fff', padding: '8px 16px', borderRadius: 10, fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, border: '1px solid rgba(255,255,255,0.1)', cursor: downloading ? 'not-allowed' : 'pointer', opacity: downloading ? 0.5 : 1 }}>
                        {downloading ? <RefreshCw size={13} className="animate-spin" /> : <Download size={13} />}
                        {downloading ? 'Generating...' : 'Export PDF'}
                    </button>
                </div>
            </div>

            {/* DORA Metrics */}
            <div style={{ background: 'rgba(28,28,30,0.4)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 24, padding: 28, marginBottom: 20 }}>
                <SectionHeader icon={TrendingUp} color="#34D399" title="DORA Metrics" sub={`last ${timeRange}`} />
                <DoraSection repo={selectedRepo} timeRange={timeRange} />
            </div>

            {/* Build Stability Timeline */}
            <div style={{ background: 'rgba(28,28,30,0.4)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 24, padding: 28, marginBottom: 20 }}>
                <SectionHeader icon={Activity} color="#FBBF24" title="Build Stability" sub="last 60 runs · Jenkins-style history" />
                <BuildStabilitySection repo={selectedRepo} />
            </div>

            {/* Security Posture */}
            <div style={{ background: 'rgba(28,28,30,0.4)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 24, padding: 28, marginBottom: 20 }}>
                <SectionHeader icon={Shield} color="#F87171" title="Security Posture" sub="open vulnerabilities" />
                <SecuritySection data={ctxSecSummary} loading={ctxSecSummary === null} />
            </div>

            {/* Pipeline Reliability */}
            <div style={{ background: 'rgba(28,28,30,0.4)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 24, padding: 28, marginBottom: 20 }}>
                <SectionHeader icon={Activity} color="#60A5FA" title="Pipeline Reliability" sub={`last 50 runs`} />
                <PipelineSection repo={selectedRepo} timeRange={timeRange} />
            </div>

            {/* Report metadata footer */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 0', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <FileText size={12} style={{ color: 'rgba(255,255,255,0.2)' }} />
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>
                    Generated {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} · {selectedRepo} · PipelineXR Health Report
                </span>
            </div>
        </div>
    );
};

export default Reports;
