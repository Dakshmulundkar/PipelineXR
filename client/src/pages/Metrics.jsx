import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BarChart2, TrendingUp, Clock, Package, RefreshCw, ChevronDown, Activity, Zap, Target } from 'lucide-react';
import { Line, Bar } from 'react-chartjs-2';
import {
    Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement,
    Title, Tooltip, Legend, BarElement, Filler
} from 'chart.js';
import StatCard from '../components/StatCard';
import ChartCard from '../components/ChartCard';
import { api } from '../services/api';
import { useAppContext } from '../contexts/AppContext';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler);

const LINE_OPTS = (label, unit = '') => ({
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

const RANGES = ['24h', '7d', '30d', '90d'];

function formatTimestamp(timestamp, range) {
    const d = new Date(timestamp);
    if (isNaN(d.getTime())) return '';
    return range === '24h' 
        ? d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) 
        : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const Metrics = () => {
    const { selectedRepo, socket } = useAppContext();
    const [range, setRange] = useState('7d');
    const [loading, setLoading] = useState(true);
    const [charts, setCharts] = useState({});
    const [lastSync, setLastSync] = useState(new Date());
    const [metricsData, setMetricsData] = useState(null);
    const [secSummary, setSecSummary] = useState(null);
    const controller = useRef(null);

    const load = useCallback(async (r) => {
        setLoading(true);
        if (controller.current) controller.current.abort();
        controller.current = new AbortController();

        try {
            const data = await api.getDoraMetrics(selectedRepo || 'Dakshmulundkar/Sentinal-Pay', r);
            setMetricsData(data);
            
            if (data && data.rawRuns) {
                // Ensure runs are sorted chronologically
                const runs = data.rawRuns.reverse();
    
                setCharts({
                    buildDuration: runs.length ? {
                        labels: runs.map(run => formatTimestamp(run.run_started_at, r)),
                        datasets: [{
                            label: 'Build Duration (m)',
                            data: runs.map(run => {
                                const start = new Date(run.run_started_at);
                                const end = new Date(run.updated_at);
                                return ((end - start) / 60000).toFixed(1);
                            }),
                            borderColor: '#60A5FA',
                            backgroundColor: (context) => {
                                const ctx = context.chart.ctx;
                                const gradient = ctx.createLinearGradient(0, 0, 0, 300);
                                gradient.addColorStop(0, 'rgba(96, 165, 250, 0.2)');
                                gradient.addColorStop(1, 'rgba(96, 165, 250, 0)');
                                return gradient;
                            },
                            fill: true, tension: 0.4, pointRadius: 4, pointBackgroundColor: '#60A5FA', pointBorderColor: '#fff'
                        }]
                    } : null,
                    successRate: runs.length ? {
                        labels: runs.map(run => formatTimestamp(run.run_started_at, r)),
                        datasets: [{
                            label: 'SuccessRate',
                            data: runs.map(run => run.conclusion === 'success' ? 100 : 0),
                            borderColor: '#34D399',
                            backgroundColor: (context) => {
                                const ctx = context.chart.ctx;
                                const gradient = ctx.createLinearGradient(0, 0, 0, 300);
                                gradient.addColorStop(0, 'rgba(52, 211, 153, 0.2)');
                                gradient.addColorStop(1, 'rgba(52, 211, 153, 0)');
                                return gradient;
                            },
                            fill: true, tension: 0.4, pointRadius: 4, pointBackgroundColor: '#34D399', pointBorderColor: '#fff'
                        }]
                    } : null,
                    deployFreq: runs.length ? {
                        labels: runs.map(run => formatTimestamp(run.run_started_at, r)),
                        datasets: [{
                            label: 'Deployments',
                            data: runs.map(() => 1), 
                            backgroundColor: (context) => {
                                const ctx = context.chart.ctx;
                                const gradient = ctx.createLinearGradient(0, 0, 0, 300);
                                gradient.addColorStop(0, '#8B5CF6');
                                gradient.addColorStop(1, 'rgba(139, 92, 246, 0.2)');
                                return gradient;
                            },
                            borderRadius: 8, borderSkipped: false, barThickness: 20
                        }]
                    } : null,
                    leadTime: runs.length ? {
                        labels: runs.map(run => formatTimestamp(run.run_started_at, r)), 
                        datasets: [{
                            label: 'Wait Time (h)',
                            data: runs.map(run => {
                                 const start = new Date(run.run_started_at);
                                 const created = new Date(run.created_at);
                                 return ((start - created) / 3600000).toFixed(2);
                            }),
                            borderColor: '#A855F7',
                            backgroundColor: (context) => {
                                const ctx = context.chart.ctx;
                                const gradient = ctx.createLinearGradient(0, 0, 0, 300);
                                gradient.addColorStop(0, 'rgba(168, 85, 247, 0.2)');
                                gradient.addColorStop(1, 'rgba(168, 85, 247, 0)');
                                return gradient;
                            },
                            fill: true, tension: 0.4, pointRadius: 4, pointBackgroundColor: '#A855F7', pointBorderColor: '#fff'
                        }]
                    } : null,
                });
            }

            api.getSecuritySummary(selectedRepo || 'Dakshmulundkar/Sentinal-Pay')
                .then(d => setSecSummary(d))
                .catch(() => setSecSummary({ critical: 0, high: 0, medium: 0, low: 0, total: 0 }));

            setLastSync(new Date());
        } catch (e) {
            if (e.name !== 'AbortError') console.error(e);
        } finally { setLoading(false); }
    }, [selectedRepo]);

    useEffect(() => { load(range); }, [range, load]);

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

    const calculateIntegrityScore = () => {
        if (!secSummary) return 100;
        const deductions = (secSummary.critical || 0) * 10 + (secSummary.high || 0) * 5 + (secSummary.medium || 0) * 2 + (secSummary.low || 0) * 0.5;
        return Math.max(0, 100 - deductions).toFixed(1);
    };

    const kpis = [
        { title: 'Avg Build Duration', value: metricsData ? `${metricsData.avgBuildDuration}m` : '…', subtitle: `Last ${range}`, icon: Clock, color: 'blue', trend: 15, trendUp: false },
        { title: 'Total Deployments', value: metricsData ? metricsData.totalDeployments : '…', subtitle: `Last ${range}`, icon: BarChart2, color: 'purple', trend: 8, trendUp: true },
        { title: 'Success Rate', value: metricsData ? `${metricsData.successRate}%` : '…', subtitle: 'Pipeline Average', icon: Activity, color: 'emerald', trend: 4, trendUp: true },
        { title: 'Code Integrity', value: secSummary ? `${calculateIntegrityScore()}%` : '...', subtitle: 'Security Scan Based', icon: Zap, color: 'indigo' },
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
                        DORA metrics and build efficiency benchmarks for {selectedRepo || 'all repositories'}
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
                    <button onClick={() => load(range)}
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

            {/* Charts Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                <ChartCard title="Build Efficiency" icon={Clock} badge={{ label: 'Mins', className: 'badge-blue' }}>
                    {loading ? <div className="h-full skeleton rounded-xl" /> : charts.buildDuration ? <Line data={charts.buildDuration} options={LINE_OPTS('Duration', 'm')} /> : <div className="flex h-full w-full items-center justify-center text-slate-500 text-sm">No data available</div>}
                </ChartCard>
                <ChartCard title="Mission Success" icon={Target} badge={{ label: 'Percentage', className: 'badge-green' }}>
                    {loading ? <div className="h-full skeleton rounded-xl" /> : charts.successRate ? <Line data={charts.successRate} options={LINE_OPTS('Rate', '%')} /> : <div className="flex h-full w-full items-center justify-center text-slate-500 text-sm">No data available</div>}
                </ChartCard>
                <ChartCard title="Deployment Frequency" icon={BarChart2} badge={{ label: 'Volume', className: 'badge-muted' }}>
                    {loading ? <div className="h-full skeleton rounded-xl" /> : charts.deployFreq ? <Bar data={charts.deployFreq} options={LINE_OPTS('Deploys')} /> : <div className="flex h-full w-full items-center justify-center text-slate-500 text-sm">No data available</div>}
                </ChartCard>
                <ChartCard title="Wait Time Metrics" icon={Zap} badge={{ label: 'Hours', className: 'badge-muted' }}>
                    {loading ? <div className="h-full skeleton rounded-xl" /> : charts.leadTime ? <Line data={charts.leadTime} options={LINE_OPTS('Hours', 'h')} /> : <div className="flex h-full w-full items-center justify-center text-slate-500 text-sm">No data available</div>}
                </ChartCard>
            </div>
        </div>
    );
};

export default Metrics;
