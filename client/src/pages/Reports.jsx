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
const SecuritySection = ({ repo }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        api.getSecuritySummary(repo)
            .then(setData)
            .catch(() => setData(null))
            .finally(() => setLoading(false));
    }, [repo]);

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
const BuildStabilitySection = ({ repo }) => {
    const [runs, setRuns] = useState(null);
    const [loading, setLoading] = useState(true);
    const [tooltip, setTooltip] = useState(null); // { run, x, y }

    useEffect(() => {
        setLoading(true);
        api.getPipelineRuns(60, repo)
            .then(data => setRuns(Array.isArray(data) ? data : data?.runs || []))
            .catch(() => setRuns([]))
            .finally(() => setLoading(false));
    }, [repo]);

    if (loading) return <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: 13 }}>Loading build history...</div>;
    if (!runs || runs.length === 0) return <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: 13 }}>No build history found.</div>;

    // Sort oldest → newest so timeline reads left to right
    const sorted = [...runs].sort((a, b) => new Date(a.run_started_at || a.created_at) - new Date(b.run_started_at || b.created_at));

    // Group by workflow name
    const byWorkflow = {};
    for (const r of sorted) {
        const name = r.workflow_name || 'Unknown';
        if (!byWorkflow[name]) byWorkflow[name] = [];
        byWorkflow[name].push(r);
    }

    // Consecutive failure streak across all runs (most recent first)
    const recent = [...runs].sort((a, b) => new Date(b.run_started_at || b.created_at) - new Date(a.run_started_at || a.created_at));
    let streak = 0;
    for (const r of recent) {
        if (r.conclusion === 'failure') streak++;
        else break;
    }

    const dotColor = (conclusion) => {
        if (conclusion === 'success')   return '#34D399';
        if (conclusion === 'failure')   return '#F87171';
        if (conclusion === 'cancelled') return '#9CA3AF';
        return '#FBBF24'; // in_progress / unknown
    };

    const dotTitle = (r) => {
        const date = new Date(r.run_started_at || r.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        const dur = r.duration_seconds ? `${Math.round(r.duration_seconds / 60)}m` : '—';
        return `#${r.run_number || r.run_id?.toString().slice(-4) || '?'} · ${r.conclusion || 'unknown'} · ${date} · ${dur}`;
    };

    return (
        <div style={{ position: 'relative' }}>
            {/* Streak warning */}
            {streak >= 2 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, padding: '8px 14px', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 10 }}>
                    <AlertTriangle size={13} color="#F87171" />
                    <span style={{ fontSize: 12, color: '#F87171', fontWeight: 600 }}>
                        {streak} consecutive failures — build is currently broken
                    </span>
                </div>
            )}

            {/* Per-workflow dot strips */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {Object.entries(byWorkflow).map(([name, wRuns]) => {
                    const wSuccess = wRuns.filter(r => r.conclusion === 'success').length;
                    const wRate = Math.round((wSuccess / wRuns.length) * 100);

                    return (
                        <div key={name}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                                <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.55)', width: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>{name}</span>
                                <div style={{ display: 'flex', gap: 3, flex: 1, flexWrap: 'wrap' }}>
                                    {wRuns.map((r, i) => (
                                        <div
                                            key={i}
                                            title={dotTitle(r)}
                                            onMouseEnter={e => setTooltip({ run: r, x: e.clientX, y: e.clientY })}
                                            onMouseLeave={() => setTooltip(null)}
                                            style={{
                                                width: 10, height: 10,
                                                borderRadius: 2,
                                                background: dotColor(r.conclusion),
                                                opacity: r.conclusion === 'cancelled' ? 0.4 : 1,
                                                cursor: 'default',
                                                flexShrink: 0,
                                                transition: 'transform 0.1s',
                                            }}
                                            onMouseOver={e => e.currentTarget.style.transform = 'scale(1.4)'}
                                            onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
                                        />
                                    ))}
                                </div>
                                <span style={{ fontSize: 11, fontWeight: 700, color: wRate >= 90 ? '#34D399' : wRate >= 70 ? '#FBBF24' : '#F87171', flexShrink: 0, width: 36, textAlign: 'right' }}>{wRate}%</span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', gap: 16, marginTop: 16, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                {[['#34D399', 'Success'], ['#F87171', 'Failure'], ['#FBBF24', 'In Progress'], ['#9CA3AF', 'Cancelled']].map(([color, label]) => (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <div style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
                        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: 600 }}>{label}</span>
                    </div>
                ))}
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', marginLeft: 'auto' }}>oldest → newest · hover for details</span>
            </div>

            {/* Hover tooltip */}
            {tooltip && (
                <div style={{
                    position: 'fixed', zIndex: 9999,
                    left: tooltip.x + 12, top: tooltip.y - 10,
                    background: 'rgba(18,18,22,0.97)', border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 10, padding: '8px 12px', pointerEvents: 'none',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: dotColor(tooltip.run.conclusion), marginBottom: 4 }}>
                        #{tooltip.run.run_number || tooltip.run.run_id?.toString().slice(-4)} · {tooltip.run.conclusion || 'unknown'}
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                        {new Date(tooltip.run.run_started_at || tooltip.run.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </div>
                    {tooltip.run.duration_seconds && (
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                            Duration: {Math.round(tooltip.run.duration_seconds / 60)}m {tooltip.run.duration_seconds % 60}s
                        </div>
                    )}
                    {tooltip.run.head_branch && (
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                            Branch: {tooltip.run.head_branch}
                        </div>
                    )}
                </div>
            )}
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
                <SecuritySection repo={selectedRepo} />
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
