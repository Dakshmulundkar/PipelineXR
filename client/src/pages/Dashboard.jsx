import React, { useState, useEffect, useRef } from 'react';
import { Rocket, AlertTriangle, Clock, Zap, ShieldAlert, TrendingUp, RefreshCw } from 'lucide-react';
import { Bar, Line } from 'react-chartjs-2';
import {
    Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement,
    Title, Tooltip, Legend, BarElement, Filler
} from 'chart.js';
import { api } from '../services/api';
import { useAppContext } from '../contexts/AppContext';
import StatCard from '../components/StatCard';
import ChartCard from '../components/ChartCard';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler);

const RANGES = ['24h', '7d', '30d'];

const chartOpts = (unit) => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    animation: { duration: 1200, easing: 'easeOutQuart' },
    scales: {
        x: {
            grid: { display: false },
            ticks: { color: 'rgba(255,255,255,0.3)', font: { size: 10, weight: '500' }, maxTicksLimit: 8, maxRotation: 0 },
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
            backgroundColor: 'rgba(28, 28, 30, 0.95)',
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

// Build time-slotted chart data from rawRuns
function buildChartData(rawRuns, range) {
    const use24h = range === '24h';
    const days = range === '24h' ? 1 : range === '7d' ? 7 : 30;
    const now = new Date();

    let slots = [];
    let slotKey;
    let fmtLabel;

    if (use24h) {
        for (let i = 23; i >= 0; i--) {
            const d = new Date(now);
            d.setMinutes(0, 0, 0);
            d.setHours(d.getHours() - i);
            slots.push(d.toISOString().slice(0, 13));
        }
        slotKey = (run) => (run.run_started_at || '').slice(0, 13);
        fmtLabel = (s) => {
            const h = parseInt(s.slice(11, 13), 10);
            return `${h % 12 || 12}${h >= 12 ? 'PM' : 'AM'}`;
        };
    } else {
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            slots.push(d.toISOString().split('T')[0]);
        }
        slotKey = (run) => (run.run_started_at || '').split('T')[0];
        fmtLabel = (s) => new Date(s + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    const bySlot = {};
    for (const run of rawRuns) {
        const key = slotKey(run);
        if (!key) continue;
        if (!bySlot[key]) bySlot[key] = { total: 0, success: 0 };
        bySlot[key].total++;
        if (run.conclusion === 'success') bySlot[key].success++;
    }

    const labels = slots.map(fmtLabel);
    const depData = slots.map(s => bySlot[s]?.success || 0);
    const srData  = slots.map(s => {
        const g = bySlot[s];
        if (!g || g.total === 0) return 0;
        return Math.round((g.success / g.total) * 100);
    });
    const hasData = slots.map(s => !!bySlot[s]);
    const radii   = (arr) => arr.map((_, i) => hasData[i] ? 4 : 0);

    return {
        dep: {
            labels,
            datasets: [{
                label: 'Successful Deployments',
                data: depData,
                backgroundColor: (ctx) => {
                    const g = ctx.chart.ctx.createLinearGradient(0, 0, 0, 260);
                    g.addColorStop(0, '#3B82F6');
                    g.addColorStop(1, 'rgba(59,130,246,0.1)');
                    return g;
                },
                borderRadius: 8,
                borderSkipped: false,
                barThickness: use24h ? 8 : days <= 7 ? 18 : 10,
            }]
        },
        sr: {
            labels,
            datasets: [{
                label: 'Success Rate (%)',
                data: srData,
                borderColor: '#10B981',
                backgroundColor: (ctx) => {
                    const g = ctx.chart.ctx.createLinearGradient(0, 0, 0, 260);
                    g.addColorStop(0, 'rgba(16,185,129,0.2)');
                    g.addColorStop(1, 'rgba(16,185,129,0)');
                    return g;
                },
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#10B981',
                pointRadius: radii(srData),
                pointHoverRadius: radii(srData).map(r => r ? r + 2 : 0),
            }]
        }
    };
}

// Compute % change between two values. Returns { trend, trendUp } or null if no prior data.
function calcTrend(current, previous) {
    if (previous == null || previous === 0) return null;
    const delta = Math.round(((current - previous) / previous) * 100);
    return { trend: Math.abs(delta), trendUp: delta >= 0 };
}

const Dashboard = () => {
    const { selectedRepo } = useAppContext();
    const [range, setRange] = useState('7d');
    const [metrics, setMetrics] = useState(null);
    const [prevMetrics, setPrevMetrics] = useState(null);
    const [loading, setLoading] = useState(true);
    const [lastSync, setLastSync] = useState(new Date());
    const [secSummary, setSecSummary] = useState(null);
    const [chartData, setChartData] = useState({ dep: null, sr: null });
    const mounted = useRef(true);

    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; };
    }, []);

    useEffect(() => {
        if (!selectedRepo) { setLoading(false); return; }
        setLoading(true);

        const days = range === '24h' ? 1 : range === '7d' ? 7 : 30;

        // Fetch current period + double window (for previous period comparison) in parallel
        Promise.all([
            api.getDoraMetrics(selectedRepo, range),
            api.getDoraMetrics(selectedRepo, days * 2),
        ])
            .then(([curr, full]) => {
                if (!mounted.current) return;
                setMetrics(curr);
                setLastSync(new Date());

                // Split the double window: runs older than `days` ago = previous period
                if (full?.rawRuns) {
                    const cutoff = new Date();
                    cutoff.setDate(cutoff.getDate() - days);
                    const prevRuns = full.rawRuns.filter(r => new Date(r.run_started_at) < cutoff);
                    const prevTotal = prevRuns.length;
                    const prevSuccess = prevRuns.filter(r => r.conclusion === 'success').length;
                    const prevSuccessRate = prevTotal > 0 ? Math.round((prevSuccess / prevTotal) * 100) : 0;
                    const prevDurations = prevRuns
                        .map(r => (new Date(r.updated_at) - new Date(r.run_started_at)) / 60000)
                        .filter(v => v > 0);
                    const prevAvgDuration = prevDurations.length
                        ? Math.round((prevDurations.reduce((a, b) => a + b, 0) / prevDurations.length) * 10) / 10
                        : 0;
                    const prevDeployFreq = days > 0
                        ? Math.round((prevSuccess / days) * 10) / 10
                        : 0;
                    const prevWaits = prevRuns
                        .map(r => (new Date(r.run_started_at) - new Date(r.created_at)) / 3600000)
                        .filter(v => v >= 0);
                    const prevAvgWait = prevWaits.length
                        ? Math.round((prevWaits.reduce((a, b) => a + b, 0) / prevWaits.length) * 100) / 100
                        : 0;
                    setPrevMetrics({ deploymentFrequency: prevDeployFreq, successRate: prevSuccessRate, avgBuildDuration: prevAvgDuration, avgWaitTime: prevAvgWait });
                } else {
                    setPrevMetrics(null);
                }

                if (curr?.rawRuns) {
                    setChartData(buildChartData(curr.rawRuns, range));
                } else {
                    setChartData({ dep: null, sr: null });
                }
            })
            .catch(() => {
                if (mounted.current) { setMetrics(null); setPrevMetrics(null); setChartData({ dep: null, sr: null }); }
            })
            .finally(() => { if (mounted.current) setLoading(false); });

        api.getSecuritySummary(selectedRepo)
            .then(d => { if (mounted.current) setSecSummary(d); })
            .catch(() => {});
    }, [selectedRepo, range]);

    const depTrend  = prevMetrics ? calcTrend(metrics?.deploymentFrequency ?? 0, prevMetrics.deploymentFrequency) : null;
    const srTrend   = prevMetrics ? calcTrend(metrics?.successRate ?? 0, prevMetrics.successRate) : null;
    // For duration and wait time, lower is better — so trendUp is inverted
    const durTrend  = prevMetrics ? calcTrend(metrics?.avgBuildDuration ?? 0, prevMetrics.avgBuildDuration) : null;
    const waitTrend = prevMetrics ? calcTrend(metrics?.avgWaitTime ?? 0, prevMetrics.avgWaitTime) : null;

    const kpis = [
        { title: 'Deployment Frequency', value: metrics ? `${metrics.deploymentFrequency ?? 0}/day` : '…', subtitle: `Last ${range}`, icon: Rocket, color: 'blue', ...(depTrend || {}) },
        { title: 'Success Rate', value: metrics ? `${metrics.successRate ?? 0}%` : '…', subtitle: 'Pipeline stability', icon: AlertTriangle, color: 'orange', ...(srTrend || {}) },
        { title: 'Mean Build Duration', value: metrics ? `${metrics.avgBuildDuration ?? 0}m` : '…', subtitle: 'Execution speed', icon: Clock, color: 'purple', ...(durTrend ? { trend: durTrend.trend, trendUp: !durTrend.trendUp } : {}) },
        { title: 'Average Wait Time', value: metrics ? `${metrics.avgWaitTime ?? 0}h` : '…', subtitle: 'Queue efficiency', icon: Zap, color: 'indigo', ...(waitTrend ? { trend: waitTrend.trend, trendUp: !waitTrend.trendUp } : {}) },
    ];

    return (
        <div style={{ padding: '32px', maxWidth: 1400, margin: '0 auto', animation: 'fadeIn 0.5s ease-out' }}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 32 }}>
                <div>
                    <h1 style={{ fontSize: 32, fontWeight: 800, color: '#fff', letterSpacing: '-0.04em', margin: 0 }}>Dashboard</h1>
                    <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#34D399' }} />
                        Operational status of {selectedRepo || 'all projects'}
                    </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {/* Range selector */}
                    <div style={{ display: 'flex', background: 'rgba(255,255,255,0.03)', padding: 4, borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
                        {RANGES.map(r => (
                            <button key={r} onClick={() => setRange(r)} style={{
                                padding: '6px 14px', borderRadius: 9, fontSize: 12, fontWeight: 600,
                                border: 'none', cursor: 'pointer', transition: 'all 0.2s',
                                background: range === r ? 'rgba(255,255,255,0.1)' : 'transparent',
                                color: range === r ? '#fff' : 'rgba(255,255,255,0.4)',
                            }}>{r}</button>
                        ))}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'rgba(255,255,255,0.3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                        {lastSync.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                </div>
            </div>

            {/* KPI Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20, marginBottom: 32 }}>
                {kpis.map((k, i) => (
                    <div key={k.title} style={{ animation: `slideUp 0.5s ease-out ${i * 0.1}s both` }}>
                        <StatCard {...k} loading={loading} />
                    </div>
                ))}
            </div>

            {/* Security + Charts */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 20, marginBottom: 32 }}>

                {/* Security Posture */}
                <div style={{ background: 'rgba(28,28,30,0.4)', backdropFilter: 'blur(20px) saturate(180%)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 24, padding: 24, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                        <h3 style={{ fontSize: 14, fontWeight: 600, color: '#fff', display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
                            <ShieldAlert size={16} style={{ color: '#60A5FA' }} /> Security Posture
                        </h3>
                        <div className={`badge ${(secSummary?.critical || 0) > 0 ? 'badge-red' : (secSummary?.total || 0) > 0 ? 'badge-orange' : 'badge-green'}`} style={{ fontSize: 10 }}>
                            {(secSummary?.critical || 0) > 0 ? 'At Risk' : (secSummary?.total || 0) > 0 ? 'Monitor' : 'Secure'}
                        </div>
                    </div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {[
                            { name: 'GitHub Dependabot', status: (secSummary?.high || 0) > 0 ? 'Action Needed' : 'Passed', color: (secSummary?.high || 0) > 0 ? '#F87171' : '#34D399', findings: secSummary?.high || 0 },
                            { name: 'Trivy Scan', status: (secSummary?.critical || 0) > 0 ? 'Critical Found' : (secSummary?.total || 0) > 0 ? 'Issues Found' : 'Passed', color: (secSummary?.critical || 0) > 0 ? '#EF4444' : (secSummary?.total || 0) > 0 ? '#F97316' : '#34D399', findings: (secSummary?.critical || 0) + (secSummary?.high || 0) },
                            { name: 'Overall Posture', status: (secSummary?.critical || 0) > 0 ? 'At Risk' : (secSummary?.total || 0) > 0 ? 'Monitor' : 'Healthy', color: (secSummary?.critical || 0) > 0 ? '#EF4444' : (secSummary?.total || 0) > 0 ? '#FBBF24' : '#34D399', findings: secSummary?.total || 0 },
                        ].map(s => (
                            <div key={s.name} style={{ background: 'rgba(255,255,255,0.03)', padding: '12px 16px', borderRadius: 16, border: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <div style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>{s.name}</div>
                                    <div style={{ fontSize: 10, color: s.color }}>{s.status}</div>
                                </div>
                                {s.findings > 0 && <div style={{ fontSize: 10, fontWeight: 800, background: s.color, color: '#000', padding: '2px 6px', borderRadius: 4 }}>{s.findings}</div>}
                            </div>
                        ))}
                    </div>
                    <div style={{ marginTop: 24, padding: 12, background: 'rgba(59,130,246,0.1)', borderRadius: 12, border: '1px solid rgba(59,130,246,0.2)' }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#60A5FA' }}>Compliance Health</div>
                        <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                            {[1,1,1,1,1,1,1,1,1,0.5].map((v, i) => (
                                <div key={i} style={{ flex: 1, height: 4, background: v === 1 ? '#34D399' : 'rgba(255,255,255,0.1)', borderRadius: 2 }} />
                            ))}
                        </div>
                    </div>
                </div>

                {/* Charts */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                    <ChartCard title="Deployment Volume" icon={Rocket} badge={{ label: range, className: 'badge-muted' }}>
                        {loading
                            ? <div className="h-full skeleton rounded-xl" />
                            : chartData.dep
                                ? <Bar key={`dep-${range}`} data={chartData.dep} options={chartOpts()} />
                                : <div className="flex h-full w-full items-center justify-center text-slate-500 text-sm">No data</div>
                        }
                    </ChartCard>
                    <ChartCard title="Pipeline Success Rate" icon={TrendingUp} badge={{ label: 'Stability', className: 'badge-green' }}>
                        {loading
                            ? <div className="h-full skeleton rounded-xl" />
                            : chartData.sr
                                ? <Line key={`sr-${range}`} data={chartData.sr} options={chartOpts('%')} />
                                : <div className="flex h-full w-full items-center justify-center text-slate-500 text-sm">No data</div>
                        }
                    </ChartCard>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
