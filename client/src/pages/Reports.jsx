import { useState, useEffect, useCallback } from 'react';
import {
    FileText, Download, Search, CheckCircle2,
    XCircle, Clock, RefreshCw, ChevronRight,
    Filter, PieChart, TrendingUp
} from 'lucide-react';
import { Line, Bar } from 'react-chartjs-2';
import {
    Chart as ChartJS, CategoryScale, LinearScale, PointElement,
    LineElement, BarElement, Title, Tooltip, Legend, Filler
} from 'chart.js';
import { api } from '../services/api';
import { useAppContext } from '../contexts/AppContext';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler);

const Reports = () => {
    const { selectedRepo } = useAppContext();
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState('all');
    const [downloading, setDownloading] = useState(false);

    const load = useCallback(async (repo) => {
        setLoading(true);
        try {
            const raw = await api.getTestReports(repo || null);
            const enriched = Array.isArray(raw) ? raw.map(r => ({
                ...r,
                pass_rate: r.total_tests > 0 ? Math.round((r.passed / r.total_tests) * 100) : 0
            })) : [];
            setData(enriched);
        } catch {
            setData([]);
        } finally {
            setLoading(false);
        }
    }, []);

    const syncAndLoad = useCallback(async (repo) => {
        if (!repo) { setLoading(false); return; }
        setSyncing(true);
        try {
            await api.syncReports(repo);
        } catch (e) {
            console.warn('Reports sync failed (continuing with cached):', e.message);
        } finally {
            setSyncing(false);
        }
        await load(repo);
    }, [load]);

    useEffect(() => { syncAndLoad(selectedRepo); }, [selectedRepo, syncAndLoad]);

    const handleDownloadPdf = async () => {
        setDownloading(true);
        try {
            const blob = await api.generateReportPdf(selectedRepo || null);
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `pipelinexr-report-${selectedRepo?.replace('/', '-') || 'all'}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Failed to download PDF:', error);
            const msg = error?.response?.data?.error || error?.message || 'Unknown error';
            alert(`Failed to generate PDF: ${msg}`);
        } finally {
            setDownloading(false);
        }
    };

    if (!selectedRepo) {
        return (
            <div style={{ padding: 40, color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>
                Select a repository to view audit reports.
            </div>
        );
    }

    const filtered = data.filter(r => {
        const m = !search || (r.suite_name?.toLowerCase().includes(search.toLowerCase()) || String(r.run_id).includes(search));
        if (filter === 'failed') return m && r.failed > 0;
        if (filter === 'perfect') return m && r.failed === 0;
        return m;
    });

    const tot = data.reduce((a, r) => a + (r.total_tests || 0), 0);
    const pass = data.reduce((a, r) => a + (r.passed || 0), 0);
    const fail = data.reduce((a, r) => a + (r.failed || 0), 0);
    const avgRate = data.length > 0
        ? Math.round(data.reduce((a, r) => a + (r.pass_rate || 0), 0) / data.length)
        : 0;

    // Build trend charts from report data (sorted by date)
    const sorted = [...data].sort((a, b) => new Date(a.latest_run || 0) - new Date(b.latest_run || 0));
    const trendLabels = sorted.map(r => r.latest_run
        ? new Date(r.latest_run).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : `#${r.run_id}`
    );
    const passRateTrend = sorted.map(r => r.pass_rate || 0);
    const stepsTrend    = sorted.map(r => r.total_tests || 0);
    const hasChartData  = sorted.length > 1;

    const trendOpts = (unit = '') => ({
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        animation: { duration: 1200, easing: 'easeOutQuart' },
        scales: {
            x: { grid: { display: false }, ticks: { color: 'rgba(255,255,255,0.3)', font: { size: 10 }, maxTicksLimit: 10, maxRotation: 0 }, border: { display: false } },
            y: { grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { color: 'rgba(255,255,255,0.3)', font: { size: 10 }, padding: 8 }, border: { display: false }, beginAtZero: true },
        },
        plugins: {
            legend: { display: false },
            tooltip: { backgroundColor: 'rgba(28,28,30,0.95)', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1, titleColor: '#fff', bodyColor: 'rgba(255,255,255,0.7)', padding: 12, cornerRadius: 12, displayColors: false, callbacks: { label: ctx => ` ${ctx.parsed.y}${unit}` } },
        },
    });

    return (
        <div style={{ padding: '32px', maxWidth: 1400, margin: '0 auto', animation: 'fadeIn 0.5s ease-out' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 32 }}>
                <div>
                    <h1 style={{ fontSize: 32, fontWeight: 800, color: '#fff', letterSpacing: '-0.04em', margin: 0 }}>
                        Audit Reports
                    </h1>
                    <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
                        Workflow job archives and step-level compliance scoring · {selectedRepo}
                    </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button onClick={() => syncAndLoad(selectedRepo)} disabled={syncing || loading}
                        style={{
                            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                            color: 'rgba(255,255,255,0.6)', padding: '10px 16px', borderRadius: 12,
                            fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8,
                            cursor: syncing || loading ? 'not-allowed' : 'pointer',
                            opacity: syncing || loading ? 0.6 : 1
                        }}>
                        <RefreshCw size={14} className={(syncing || loading) ? 'animate-spin' : ''} />
                        {syncing ? 'Syncing...' : 'Refresh'}
                    </button>
                    <button onClick={handleDownloadPdf} disabled={downloading || data.length === 0}
                        style={{
                            background: 'rgba(255,255,255,0.05)', color: '#fff', padding: '10px 16px',
                            borderRadius: 12, fontSize: 13, fontWeight: 700, display: 'flex',
                            alignItems: 'center', gap: 8, border: '1px solid rgba(255,255,255,0.1)',
                            cursor: (downloading || data.length === 0) ? 'not-allowed' : 'pointer',
                            opacity: (downloading || data.length === 0) ? 0.5 : 1
                        }}>
                        {downloading ? <RefreshCw size={16} className="animate-spin" /> : <Download size={16} />}
                        {downloading ? 'Generating...' : 'Export PDF'}
                    </button>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20, marginBottom: 32 }}>
                {[
                    { label: 'Total Steps', val: tot, icon: FileText, color: '#fff' },
                    { label: 'Green Pass', val: pass, icon: CheckCircle2, color: '#34D399' },
                    { label: 'Failures', val: fail, icon: XCircle, color: '#F87171' },
                    { label: 'Quality Index', val: `${avgRate}%`, icon: PieChart, color: avgRate >= 90 ? '#34D399' : '#FBBF24' },
                ].map((s, i) => (
                    <div key={s.label} style={{
                        background: 'rgba(28,28,30,0.4)', backdropFilter: 'blur(10px)',
                        border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: '20px',
                        animation: `slideUp 0.4s ease-out ${i * 0.05}s both`
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                                <div style={{ fontSize: 24, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.val}</div>
                                <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.3)', marginTop: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</div>
                            </div>
                            <s.icon size={20} style={{ color: 'rgba(255,255,255,0.1)' }} />
                        </div>
                    </div>
                ))}
            </div>

            {/* Trend Charts */}
            {hasChartData && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
                    <div style={{ background: 'rgba(28,28,30,0.4)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: 24 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                            <TrendingUp size={14} style={{ color: '#34D399' }} />
                            <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Pass Rate Trend</span>
                        </div>
                        <div style={{ height: 140 }}>
                            <Line
                                data={{
                                    labels: trendLabels,
                                    datasets: [{
                                        label: 'Pass Rate',
                                        data: passRateTrend,
                                        borderColor: '#34D399',
                                        backgroundColor: (ctx) => {
                                            const g = ctx.chart.ctx.createLinearGradient(0, 0, 0, 140);
                                            g.addColorStop(0, 'rgba(52,211,153,0.2)');
                                            g.addColorStop(1, 'rgba(52,211,153,0)');
                                            return g;
                                        },
                                        fill: true, tension: 0.4,
                                        pointRadius: passRateTrend.map(v => v > 0 ? 4 : 0),
                                        pointHoverRadius: 6,
                                        pointBackgroundColor: '#34D399',
                                    }]
                                }}
                                options={trendOpts('%')}
                            />
                        </div>
                    </div>
                    <div style={{ background: 'rgba(28,28,30,0.4)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: 24 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                            <FileText size={14} style={{ color: '#60A5FA' }} />
                            <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Steps per Run</span>
                        </div>
                        <div style={{ height: 140 }}>
                            <Bar
                                data={{
                                    labels: trendLabels,
                                    datasets: [{
                                        label: 'Steps',
                                        data: stepsTrend,
                                        backgroundColor: (ctx) => {
                                            const g = ctx.chart.ctx.createLinearGradient(0, 0, 0, 140);
                                            g.addColorStop(0, '#3B82F6');
                                            g.addColorStop(1, 'rgba(59,130,246,0.1)');
                                            return g;
                                        },
                                        borderRadius: 6,
                                        borderSkipped: false,
                                        barThickness: Math.max(4, Math.min(20, Math.floor(300 / sorted.length))),
                                    }]
                                }}
                                options={trendOpts()}
                            />
                        </div>
                    </div>
                </div>
            )}

            <div style={{
                background: 'rgba(255,255,255,0.02)', borderRadius: 20, padding: '16px 24px',
                marginBottom: 24, border: '1px solid rgba(255,255,255,0.05)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 20, flex: 1 }}>
                    <div style={{ position: 'relative', width: 300 }}>
                        <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)' }} />
                        <input value={search} onChange={e => setSearch(e.target.value)}
                            placeholder="Find suite or run ID..."
                            style={{
                                width: '100%', background: 'rgba(255,255,255,0.03)',
                                border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12,
                                padding: '8px 12px 8px 36px', fontSize: 13, color: '#fff', outline: 'none'
                            }} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Filter size={14} style={{ color: 'rgba(255,255,255,0.2)' }} />
                        {[{ key: 'all', label: 'All' }, { key: 'failed', label: 'Failures' }, { key: 'perfect', label: 'Perfect' }].map(f => (
                            <button key={f.key} onClick={() => setFilter(f.key)}
                                style={{
                                    padding: '6px 14px', borderRadius: 10, fontSize: 12, fontWeight: 600,
                                    border: 'none', cursor: 'pointer', transition: 'all 0.2s',
                                    background: filter === f.key ? 'rgba(255,255,255,0.08)' : 'transparent',
                                    color: filter === f.key ? '#fff' : 'rgba(255,255,255,0.3)',
                                }}>{f.label}</button>
                        ))}
                    </div>
                </div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)', fontWeight: 500 }}>{filtered.length} records</div>
            </div>

            <div style={{
                background: 'rgba(28,28,30,0.4)', backdropFilter: 'blur(20px)',
                border: '1px solid rgba(255,255,255,0.08)', borderRadius: 24, overflow: 'hidden'
            }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.02)' }}>
                            {['Audit ID', 'Suite Name', 'Steps', 'Status', 'Integrity', 'Timestamp', ''].map(h => (
                                <th key={h} style={{ padding: '16px 24px', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            Array.from({ length: 5 }).map((_, i) => (
                                <tr key={i}><td colSpan="7" style={{ padding: '20px 24px' }}><div className="skeleton rounded-lg h-6 w-full" /></td></tr>
                            ))
                        ) : filtered.length === 0 ? (
                            <tr>
                                <td colSpan="7" style={{ padding: '60px', textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontSize: 14 }}>
                                    {data.length === 0
                                        ? 'No job data yet — trigger a workflow run on GitHub to populate reports'
                                        : 'No records match your filter'}
                                </td>
                            </tr>
                        ) : filtered.map(r => (
                            <tr key={`${r.run_id}-${r.suite_name}`}
                                style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', transition: 'all 0.2s' }}
                                className="hover:bg-white/[0.02] group">
                                <td style={{ padding: '16px 24px', fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }}>#{r.run_id}</td>
                                <td style={{ padding: '16px 24px', fontSize: 14, fontWeight: 700, color: '#fff' }}>{r.suite_name}</td>
                                <td style={{ padding: '16px 24px', fontSize: 13, color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>{r.total_tests} steps</td>
                                <td style={{ padding: '16px 24px' }}>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        <div style={{ padding: '2px 8px', borderRadius: 6, background: 'rgba(52,211,153,0.1)', color: '#34D399', fontSize: 10, fontWeight: 800 }}>{r.passed}✓</div>
                                        {r.failed > 0 && <div style={{ padding: '2px 8px', borderRadius: 6, background: 'rgba(248,113,113,0.1)', color: '#F87171', fontSize: 10, fontWeight: 800 }}>{r.failed}✗</div>}
                                    </div>
                                </td>
                                <td style={{ padding: '16px 24px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <div style={{ flex: 1, minWidth: 60, height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2 }}>
                                            <div style={{ height: '100%', borderRadius: 2, background: r.pass_rate >= 90 ? '#34D399' : '#FBBF24', width: `${r.pass_rate}%` }} />
                                        </div>
                                        <span style={{ fontSize: 12, fontWeight: 700, color: r.pass_rate >= 90 ? '#34D399' : '#FBBF24' }}>{r.pass_rate}%</span>
                                    </div>
                                </td>
                                <td style={{ padding: '16px 24px', fontSize: 12, color: 'rgba(255,255,255,0.3)', fontWeight: 500 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <Clock size={12} />
                                        {r.latest_run ? new Date(r.latest_run).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Pending'}
                                    </div>
                                </td>
                                <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                                    <button style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.2)', padding: 8, cursor: 'pointer' }}
                                        className="group-hover:text-white group-hover:translate-x-1 transition-all">
                                        <ChevronRight size={16} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default Reports;
