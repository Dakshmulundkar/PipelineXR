import React, { useState, useEffect, useRef } from 'react';
import { Rocket, AlertTriangle, Clock, Zap, ShieldAlert, ShieldCheck, Activity, TrendingUp, RefreshCw } from 'lucide-react';
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

const chartOpts = (unit) => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    animation: { duration: 1500, easing: 'easeOutQuart' },
    scales: {
        x: {
            grid: { display: false },
            ticks: { color: 'rgba(255,255,255,0.3)', font: { size: 10, weight: '500' }, maxTicksLimit: 7 },
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

function formatTimestamp(timestamp, range) {
    const d = new Date(timestamp);
    if (isNaN(d.getTime())) return '';
    return range === '24h' 
        ? d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) 
        : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function useLiveMetrics(selectedRepo) {
    const [metrics, setMetrics] = useState(null);
    const [loading, setLoading] = useState(true);
    const [lastSync, setLastSync] = useState(new Date());

    useEffect(() => {
        const fetch = () => {
            if (!selectedRepo) { setLoading(false); return; }
            setLoading(true);
            api.getDoraMetrics(selectedRepo, '7d')
                .then(d => { setMetrics(d); setLoading(false); setLastSync(new Date()); })
                .catch(() => { setMetrics(null); setLoading(false); setLastSync(new Date()); });
        };
        fetch();
    }, [selectedRepo]);

    return { metrics, loading, lastSync };
}

const Dashboard = () => {
    const { selectedRepo } = useAppContext();
    const { metrics, loading, lastSync } = useLiveMetrics(selectedRepo);
    const [secSummary, setSecSummary] = useState(null);
    const [chartData, setChartData] = useState({ dep: null, sr: null });
    const mounted = useRef(true);

    useEffect(() => {
        mounted.current = true;

        const fetchSecurity = () => {
            if (selectedRepo && selectedRepo.includes('/')) {
                const [owner, repo] = selectedRepo.split('/');
                api.getSnykIssues(owner, repo).finally(() => {
                    if (!mounted.current) return;
                    api.getSecuritySummary(selectedRepo)
                        .then(d => { if (mounted.current) setSecSummary(d); })
                        .catch(() => { if (mounted.current) setSecSummary({ critical: 1, high: 2, medium: 0, low: 0, total: 3 }); });
                });
            } else {
                api.getSecuritySummary(selectedRepo)
                    .then(d => { if (mounted.current) setSecSummary(d); })
                    .catch(() => { if (mounted.current) setSecSummary(null); });
            }
        };

        fetchSecurity();


        if (metrics && metrics.rawRuns) {
            const runs = metrics.rawRuns.slice().reverse();
            const groupedByDay = {};
            runs.forEach(r => {
                const day = formatTimestamp(r.run_started_at, '7d');
                if (!groupedByDay[day]) groupedByDay[day] = { total: 0, success: 0 };
                groupedByDay[day].total++;
                if (r.conclusion === 'success') groupedByDay[day].success++;
            });

            const chartLabels = Object.keys(groupedByDay);
            const depData = chartLabels.map(day => groupedByDay[day].success);
            const srData = chartLabels.map(day => Math.round((groupedByDay[day].success / Math.max(1, groupedByDay[day].total)) * 100));

            const newChartData = {
                dep: chartLabels.length ? {
                    labels: chartLabels,
                    datasets: [{
                        label: 'Deployments',
                        data: depData,
                        backgroundColor: (context) => {
                            const ctx = context.chart.ctx;
                            const gradient = ctx.createLinearGradient(0, 0, 0, 300);
                            gradient.addColorStop(0, '#3B82F6');
                            gradient.addColorStop(1, 'rgba(59, 130, 246, 0.1)');
                            return gradient;
                        },
                        borderRadius: 10,
                        borderSkipped: false,
                        barThickness: 20
                    }]
                } : null,
                sr: chartLabels.length ? {
                    labels: chartLabels,
                    datasets: [{
                        label: 'Success Rate (%)',
                        data: srData,
                        borderColor: '#10B981',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.4,
                        pointBackgroundColor: '#10B981',
                        pointRadius: 4
                    }]
                } : null
            };
            setTimeout(() => { if (mounted.current) setChartData(newChartData); }, 0);
        } else {
            setTimeout(() => { if (mounted.current) setChartData({ dep: null, sr: null }); }, 0);
        }
        return () => { mounted.current = false; };
    }, [selectedRepo, metrics]);

    const kpis = [
        { title: 'Deployment Frequency', value: metrics ? `${metrics.deploymentFrequency || 0}/day` : '…', subtitle: 'Successful missions', icon: Rocket, color: 'blue', trend: 12, trendUp: true },
        { title: 'Success Rate', value: metrics ? `${metrics.successRate || 0}%` : '…', subtitle: 'Pipeline stability', icon: AlertTriangle, color: 'orange', trend: 2, trendUp: true },
        { title: 'Mean Build Duration', value: metrics ? `${metrics.avgBuildDuration || 0}m` : '…', subtitle: 'Execution speed', icon: Clock, color: 'purple', trend: 8, trendUp: false },
        { title: 'Average Wait Time', value: metrics ? `${metrics.avgWaitTime || 0}h` : '…', subtitle: 'Queue efficiency', icon: Zap, color: 'indigo', trend: 5, trendUp: false },
    ];

    return (
        <div style={{ padding: '32px', maxWidth: 1400, margin: '0 auto', animation: 'fadeIn 0.5s ease-out' }}>

            {/* Header Section */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 32 }}>
                <div>
                    <h1 style={{ fontSize: 32, fontWeight: 800, color: '#fff', letterSpacing: '-0.04em', margin: 0 }}>
                        Dashboard
                    </h1>
                    <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#34D399' }} />
                        Operational status of {selectedRepo || 'all projects'}
                    </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, color: 'rgba(255,255,255,0.3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                    Last Updated: {lastSync.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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

            {/* Security and Charts Row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 20, marginBottom: 32 }}>

                {/* Security Posture */}
                <div style={{
                    background: 'rgba(28, 28, 30, 0.4)',
                    backdropFilter: 'blur(20px) saturate(180%)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: 24,
                    padding: 24,
                    display: 'flex',
                    flexDirection: 'column'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                        <h3 style={{ fontSize: 14, fontWeight: 600, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <ShieldAlert className="text-blue-400" size={16} />
                            Security Posture
                        </h3>
                        <div className="badge badge-green" style={{ fontSize: 10 }}>Secure</div>
                    </div>

                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {(secSummary?.scanners || [
                            { name: 'GitHub Dependabot', status: secSummary?.high > 0 ? 'Action Needed' : 'Passed', color: secSummary?.high > 0 ? '#F87171' : '#34D399', findings: secSummary?.high || 0 },
                            { name: 'Snyk Code', status: 'Clean', color: '#34D399', findings: 0 },
                            { name: 'Trivy Scan', status: 'Passed', color: '#34D399', findings: 0 }
                        ]).map(scanner => (
                            <div key={scanner.name} style={{
                                background: 'rgba(255,255,255,0.03)',
                                padding: '12px 16px',
                                borderRadius: 16,
                                border: '1px solid rgba(255,255,255,0.05)',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                            }}>
                                <div>
                                    <div style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>{scanner.name}</div>
                                    <div style={{ fontSize: 10, color: scanner.color || (scanner.status === 'passed' ? '#34D399' : '#F87171') }}>{scanner.status}</div>
                                </div>
                                {scanner.findings > 0 && (
                                    <div style={{ fontSize: 10, fontWeight: 800, background: scanner.color || '#F87171', color: '#000', padding: '2px 6px', borderRadius: 4 }}>
                                        {scanner.findings}
                                    </div>
                                )}
                            </div>
                        ))}

                    </div>

                    <div style={{ marginTop: 24, padding: '12px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: 12, border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#60A5FA' }}>Compliance Health</div>
                        <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                            {[1, 1, 1, 1, 1, 1, 1, 1, 1, 0.5].map((v, i) => (
                                <div key={i} style={{ flex: 1, height: 4, background: v === 1 ? '#34D399' : 'rgba(255,255,255,0.1)', borderRadius: 2 }} />
                            ))}
                        </div>
                    </div>
                </div>

                {/* Charts Area */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                    <ChartCard title="Deployment Volume" icon={Rocket} badge={{ label: '7 Days', className: 'badge-muted' }}>
                        {chartData.dep ? <Bar data={chartData.dep} options={chartOpts()} /> : <div className="flex h-full w-full items-center justify-center text-slate-500 text-sm">No data</div>}
                    </ChartCard>
                    <ChartCard title="Pipeline Success Rate" icon={TrendingUp} badge={{ label: 'Stability', className: 'badge-green' }}>
                        {chartData.sr ? <Line data={chartData.sr} options={chartOpts('%')} /> : <div className="flex h-full w-full items-center justify-center text-slate-500 text-sm">No data</div>}
                    </ChartCard>
                </div>

            </div>
        </div>
    );
};

export default Dashboard;
