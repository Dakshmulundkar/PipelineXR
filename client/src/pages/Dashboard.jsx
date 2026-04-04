import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    Rocket, AlertTriangle, Clock, Zap, ShieldAlert, TrendingUp,
    RefreshCw, CheckCircle2, XCircle, Globe, Activity,
    GitBranch, AlertCircle, ArrowRight
} from 'lucide-react';
import { Bar, Line } from 'react-chartjs-2';
import {
    Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement,
    Title, Tooltip, Legend, BarElement, Filler
} from 'chart.js';
import { api } from '../services/api';
import { useAppContext } from '../contexts/AppContext';
import { cacheGet, cacheSet } from '../services/cache';
import StatCard from '../components/StatCard';
import ChartCard from '../components/ChartCard';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler);

const RANGES = ['24h', '7d', '30d'];

// ── Shared chart options ──────────────────────────────────────────────────────
const chartOpts = (unit) => ({
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    animation: { duration: 1200, easing: 'easeOutQuart' },
    scales: {
        x: { grid: { display: false }, ticks: { color: 'rgba(255,255,255,0.3)', font: { size: 10, weight: '500' }, maxTicksLimit: 8, maxRotation: 0 }, border: { display: false } },
        y: { grid: { color: 'rgba(255,255,255,0.03)', drawBorder: false }, ticks: { color: 'rgba(255,255,255,0.3)', font: { size: 10 }, padding: 8 }, border: { display: false }, beginAtZero: true },
    },
    plugins: {
        legend: { display: false },
        tooltip: { backgroundColor: 'rgba(28,28,30,0.95)', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1, titleColor: '#fff', titleFont: { size: 12, weight: 'bold' }, bodyColor: 'rgba(255,255,255,0.7)', bodyFont: { size: 11 }, padding: 12, cornerRadius: 12, displayColors: false, callbacks: { label: (ctx) => ` ${ctx.parsed.y}${unit || ''}` } },
    },
});

// ── Chart data builder ────────────────────────────────────────────────────────
function buildChartData(rawRuns, range) {
    const use24h = range === '24h';
    const days = range === '24h' ? 1 : range === '7d' ? 7 : 30;
    const now = new Date();
    let slots = [], slotKey, fmtLabel;

    if (use24h) {
        for (let i = 23; i >= 0; i--) { const d = new Date(now); d.setMinutes(0,0,0); d.setHours(d.getHours()-i); slots.push(d.toISOString().slice(0,13)); }
        slotKey = r => (r.run_started_at||'').slice(0,13);
        fmtLabel = s => { const h = parseInt(s.slice(11,13),10); return `${h%12||12}${h>=12?'PM':'AM'}`; };
    } else {
        for (let i = days-1; i >= 0; i--) { const d = new Date(now); d.setDate(d.getDate()-i); slots.push(d.toISOString().split('T')[0]); }
        slotKey = r => (r.run_started_at||'').split('T')[0];
        fmtLabel = s => new Date(s+'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    const bySlot = {};
    for (const run of rawRuns) {
        const key = slotKey(run); if (!key) continue;
        if (!bySlot[key]) bySlot[key] = { total: 0, success: 0 };
        bySlot[key].total++;
        if (run.conclusion === 'success') bySlot[key].success++;
    }

    const labels  = slots.map(fmtLabel);
    const depData = slots.map(s => bySlot[s]?.success || 0);
    const srData  = slots.map(s => { const g = bySlot[s]; return (!g||g.total===0) ? 0 : Math.round((g.success/g.total)*100); });
    const hasData = slots.map(s => !!bySlot[s]);
    const radii   = arr => arr.map((_,i) => hasData[i] ? 4 : 0);

    return {
        dep: { labels, datasets: [{ label: 'Successful Deployments', data: depData, backgroundColor: ctx => { const g = ctx.chart.ctx.createLinearGradient(0,0,0,260); g.addColorStop(0,'#3B82F6'); g.addColorStop(1,'rgba(59,130,246,0.1)'); return g; }, borderRadius: 8, borderSkipped: false, barThickness: use24h ? 8 : days<=7 ? 18 : 10 }] },
        sr:  { labels, datasets: [{ label: 'Success Rate (%)', data: srData, borderColor: '#10B981', backgroundColor: ctx => { const g = ctx.chart.ctx.createLinearGradient(0,0,0,260); g.addColorStop(0,'rgba(16,185,129,0.2)'); g.addColorStop(1,'rgba(16,185,129,0)'); return g; }, borderWidth: 2, fill: true, tension: 0.4, pointBackgroundColor: '#10B981', pointRadius: radii(srData), pointHoverRadius: radii(srData).map(r=>r?r+2:0) }] },
    };
}

function calcTrend(current, previous) {
    if (previous == null || previous === 0) return null;
    const delta = Math.round(((current - previous) / previous) * 100);
    return { trend: Math.abs(delta), trendUp: delta >= 0 };
}

// ── Needs Attention banner ────────────────────────────────────────────────────
const NeedsAttention = ({ secSummary, runs, sites }) => {
    const items = [];

    const critVulns = secSummary?.critical || 0;
    if (critVulns > 0) items.push({ color: '#F87171', icon: ShieldAlert, text: `${critVulns} critical vulnerabilit${critVulns===1?'y':'ies'} need immediate patching`, link: 'security' });

    const failedRuns = (runs||[]).filter(r => r.conclusion === 'failure').slice(0,3);
    if (failedRuns.length > 0) items.push({ color: '#FB923C', icon: XCircle, text: `${failedRuns.length} pipeline${failedRuns.length===1?'':'s'} currently failing — ${failedRuns[0]?.workflow_name || 'workflow'}`, link: 'pipelines' });

    const downSites = (sites||[]).filter(s => s.is_up === 0 || s.is_up === false);
    if (downSites.length > 0) items.push({ color: '#F87171', icon: Globe, text: `${downSites.length} monitored site${downSites.length===1?'':'s'} down — ${downSites[0]?.url}`, link: 'monitoring' });

    if (items.length === 0) return null;

    return (
        <div style={{ marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {items.map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', background: `${item.color}0d`, border: `1px solid ${item.color}30`, borderRadius: 14 }}>
                    <item.icon size={15} style={{ color: item.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', flex: 1, fontWeight: 500 }}>{item.text}</span>
                    <ArrowRight size={13} style={{ color: 'rgba(255,255,255,0.3)', flexShrink: 0 }} />
                </div>
            ))}
        </div>
    );
};

// ── Activity Feed ─────────────────────────────────────────────────────────────
const NOW = () => Date.now(); // stable reference for lint

const timeAgo = (ts) => {
    if (!ts) return '—';
    const diff = (NOW() - new Date(ts)) / 1000;
    if (diff < 60)    return `${Math.round(diff)}s ago`;
    if (diff < 3600)  return `${Math.round(diff/60)}m ago`;
    if (diff < 86400) return `${Math.round(diff/3600)}h ago`;
    return `${Math.round(diff/86400)}d ago`;
};

const ActivityFeed = ({ runs, loading }) => {

    const recent = (runs||[]).slice(0, 20);

    return (
        <div style={{ background: 'rgba(28,28,30,0.4)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 24, overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                <Activity size={15} style={{ color: 'rgba(255,255,255,0.4)' }} />
                <span style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>Recent Activity</span>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#34D399', animation: 'pulse 2s infinite' }} />
                    <span style={{ fontSize: 10, color: '#34D399', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Live</span>
                </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0', scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                className="hide-scrollbar">
                {loading ? (
                    Array.from({length: 5}).map((_,i) => (
                        <div key={i} style={{ padding: '12px 24px', display: 'flex', gap: 12, alignItems: 'center' }}>
                            <div className="skeleton" style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0 }} />
                            <div style={{ flex: 1 }}><div className="skeleton" style={{ height: 12, width: '70%', borderRadius: 4, marginBottom: 4 }} /><div className="skeleton" style={{ height: 10, width: '40%', borderRadius: 4 }} /></div>
                        </div>
                    ))
                ) : recent.length === 0 ? (
                    <div style={{ padding: '32px 24px', textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontSize: 13 }}>No recent activity</div>
                ) : recent.map((run, i) => {
                    const isSuccess = run.conclusion === 'success';
                    const isFail    = run.conclusion === 'failure';
                    const dotColor  = isSuccess ? '#34D399' : isFail ? '#F87171' : '#FBBF24';
                    const dur = run.duration_seconds ? `${Math.round(run.duration_seconds/60)}m` : null;

                    return (
                        <div key={i} style={{ padding: '11px 24px', display: 'flex', gap: 12, alignItems: 'flex-start', borderBottom: i < recent.length-1 ? '1px solid rgba(255,255,255,0.03)' : 'none', transition: 'background 0.15s' }} className="hover:bg-white/[0.02]">
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0, marginTop: 4 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {run.head_commit_message
                                        ? run.head_commit_message.split('\n')[0].slice(0, 60)
                                        : run.workflow_name || 'Workflow'}
                                </div>
                                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2, display: 'flex', gap: 8, alignItems: 'center' }}>
                                    <GitBranch size={9} />
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 80 }}>{run.head_branch || 'main'}</span>
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 80, color: 'rgba(255,255,255,0.2)' }}>{run.workflow_name}</span>
                                    {dur && <><span>·</span><span>{dur}</span></>}
                                </div>
                            </div>
                            <div style={{ flexShrink: 0, textAlign: 'right' }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: dotColor, textTransform: 'uppercase' }}>{run.conclusion || 'running'}</div>
                                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 2 }}>{timeAgo(run.run_started_at || run.created_at)}</div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

// ── Security Posture card ─────────────────────────────────────────────────────
const SecurityCard = ({ secSummary, loading }) => {
    const critical = secSummary?.critical || 0;
    const high     = secSummary?.high     || 0;
    const medium   = secSummary?.medium   || 0;
    const low      = secSummary?.low      || 0;
    // Compute total from individual counts — don't trust API total (may be stale)
    const total    = critical + high + medium + low;

    const posture      = critical > 0 ? 'Critical' : high > 0 ? 'At Risk' : total > 0 ? 'Monitor' : 'Secure';
    const postureColor = critical > 0 ? '#F87171' : high > 0 ? '#FB923C' : total > 0 ? '#FBBF24' : '#34D399';

    const bars = [
        { label: 'Critical', desc: 'Needs immediate fix', count: critical, color: '#F87171' },
        { label: 'High',     desc: 'Fix within 24h',      count: high,     color: '#FB923C' },
        { label: 'Medium',   desc: 'Fix this sprint',     count: medium,   color: '#FBBF24' },
        { label: 'Low',      desc: 'Low priority',        count: low,      color: '#60A5FA' },
    ];
    const maxCount = Math.max(critical, high, medium, low, 1);

    return (
        <div style={{ background: 'rgba(28,28,30,0.4)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 24, padding: 24, height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <ShieldAlert size={15} style={{ color: '#60A5FA' }} />
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>Security Posture</span>
                </div>
                <div style={{ padding: '3px 10px', borderRadius: 8, background: `${postureColor}18`, border: `1px solid ${postureColor}40`, fontSize: 10, fontWeight: 800, color: postureColor, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {posture}
                </div>
            </div>

            {loading ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {[1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height: 32, borderRadius: 8 }} />)}
                </div>
            ) : (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {bars.map(b => (
                        <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 52, flexShrink: 0 }}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: b.count > 0 ? b.color : 'rgba(255,255,255,0.3)' }}>{b.label}</div>
                            </div>
                            <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3 }}>
                                <div style={{ height: '100%', borderRadius: 3, width: `${(b.count / maxCount) * 100}%`, background: b.color, transition: 'width 0.8s ease', minWidth: b.count > 0 ? 6 : 0 }} />
                            </div>
                            <span style={{ fontSize: 13, fontWeight: 800, color: b.count > 0 ? b.color : 'rgba(255,255,255,0.2)', width: 28, textAlign: 'right', flexShrink: 0 }}>{b.count}</span>
                        </div>
                    ))}
                    <div style={{ marginTop: 8, padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Total open issues</span>
                        <span style={{ fontSize: 18, fontWeight: 800, color: total > 0 ? postureColor : '#34D399' }}>{total}</span>
                    </div>
                </div>
            )}
        </div>
    );
};

// ── Sites Status card ─────────────────────────────────────────────────────────
const SitesCard = ({ sites, loading }) => (
    <div style={{ background: 'rgba(28,28,30,0.4)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 24, padding: 24, height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <Globe size={15} style={{ color: 'rgba(255,255,255,0.4)' }} />
            <span style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>Uptime Monitor</span>
            {!loading && sites && (
                <span style={{ marginLeft: 'auto', fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: 600 }}>{sites.length} site{sites.length !== 1 ? 's' : ''}</span>
            )}
        </div>

        {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 44, borderRadius: 12 }} />)}
            </div>
        ) : !sites || sites.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.2)', fontSize: 13, flexDirection: 'column', gap: 8 }}>
                <Globe size={24} style={{ opacity: 0.2 }} />
                <span>No sites monitored yet</span>
            </div>
        ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {sites.slice(0, 5).map((site, i) => {
                    const isUp = site.is_up === 1 || site.is_up === true;
                    const statusColor = isUp ? '#34D399' : '#F87171';
                    const hostname = (() => { try { return new URL(site.url).hostname; } catch { return site.url; } })();

                    return (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: `1px solid ${isUp ? 'rgba(255,255,255,0.05)' : 'rgba(248,113,113,0.2)'}` }}>
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor, flexShrink: 0, boxShadow: isUp ? `0 0 6px ${statusColor}60` : 'none' }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{hostname}</div>
                                {site.last_checked && (
                                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 1 }}>
                                        checked {Math.round((NOW() - new Date(site.last_checked)) / 60000)}m ago
                                    </div>
                                )}
                            </div>
                            <div style={{ flexShrink: 0, textAlign: 'right' }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: statusColor, textTransform: 'uppercase' }}>{isUp ? 'UP' : 'DOWN'}</div>
                                {site.consecutive_failures > 0 && (
                                    <div style={{ fontSize: 9, color: '#F87171', marginTop: 1 }}>{site.consecutive_failures} fail{site.consecutive_failures !== 1 ? 's' : ''}</div>
                                )}
                            </div>
                        </div>
                    );
                })}
                {sites.length > 5 && (
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', textAlign: 'center', paddingTop: 4 }}>+{sites.length - 5} more</div>
                )}
            </div>
        )}
    </div>
);

// ── Main Dashboard ────────────────────────────────────────────────────────────
const Dashboard = () => {
    const { selectedRepo } = useAppContext();
    const { secSummary: ctxSecSummary, monitorSites: ctxSites, monitorSitesLoaded } = useAppContext();
    const [range, setRange]           = useState('7d');
    const [metrics, setMetrics]       = useState(null);
    const [prevMetrics, setPrevMetrics] = useState(null);
    const [loading, setLoading]       = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [lastSync, setLastSync]     = useState(new Date());
    // Use shared context data — no redundant fetches
    const secSummary = ctxSecSummary;
    const sites      = ctxSites;
    const sitesLoading = !monitorSitesLoaded;
    const [chartData, setChartData]   = useState({ dep: null, sr: null });
    const [runs, setRuns]             = useState([]);
    const mounted = useRef(true);

    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

    const applyData = useCallback((curr, full, days) => {
        setMetrics(curr);
        setLastSync(new Date());
        if (full?.rawRuns) {
            const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days);
            const prevRuns = full.rawRuns.filter(r => new Date(r.run_started_at) < cutoff);
            const prevTotal = prevRuns.length;
            const prevSuccess = prevRuns.filter(r => r.conclusion === 'success').length;
            const prevSuccessRate = prevTotal > 0 ? Math.round((prevSuccess/prevTotal)*100) : 0;
            const prevDurations = prevRuns.map(r => (new Date(r.updated_at)-new Date(r.run_started_at))/60000).filter(v=>v>0);
            const prevAvgDuration = prevDurations.length ? Math.round((prevDurations.reduce((a,b)=>a+b,0)/prevDurations.length)*10)/10 : 0;
            const prevDeployFreq = days > 0 ? Math.round((prevSuccess/days)*10)/10 : 0;
            const prevWaits = prevRuns.map(r => (new Date(r.run_started_at)-new Date(r.created_at))/3600000).filter(v=>v>=0);
            const prevAvgWait = prevWaits.length ? Math.round((prevWaits.reduce((a,b)=>a+b,0)/prevWaits.length)*100)/100 : 0;
            setPrevMetrics({ deploymentFrequency: prevDeployFreq, successRate: prevSuccessRate, avgBuildDuration: prevAvgDuration, avgWaitTime: prevAvgWait });
        } else { setPrevMetrics(null); }
        if (curr?.rawRuns) { setChartData(buildChartData(curr.rawRuns, range)); setRuns(curr.rawRuns.slice(0,20)); }
        else { setChartData({ dep: null, sr: null }); setRuns([]); }
    }, [range]);

    const fetchData = useCallback(async (isManual = false) => {
        if (!selectedRepo) { setLoading(false); return; }
        const days = range === '24h' ? 1 : range === '7d' ? 7 : 30;
        if (isManual) setRefreshing(true);
        try {
            const [curr, full] = await Promise.all([
                api.getDoraMetrics(selectedRepo, range),
                api.getDoraMetrics(selectedRepo, days * 2),
            ]);
            if (!mounted.current) return;
            cacheSet('dashboard', selectedRepo, { curr, full }, range);
            applyData(curr, full, days);
        } catch {
            if (mounted.current) { setMetrics(null); setPrevMetrics(null); setChartData({ dep: null, sr: null }); setRuns([]); }
        } finally {
            if (mounted.current) { setLoading(false); setRefreshing(false); }
        }
    }, [selectedRepo, range, applyData]);

    useEffect(() => {
        if (!selectedRepo) { setLoading(false); return; }
        const days = range === '24h' ? 1 : range === '7d' ? 7 : 30;
        const cached = cacheGet('dashboard', selectedRepo, range);
        if (cached) {
            applyData(cached.data.curr, cached.data.full, days);
            setLoading(false);
            if (cached.stale) fetchData(false);
            return;
        }
        setLoading(true);
        fetchData(false);
    }, [selectedRepo, range]); // eslint-disable-line react-hooks/exhaustive-deps

    const depTrend  = prevMetrics ? calcTrend(metrics?.deploymentFrequency ?? 0, prevMetrics.deploymentFrequency) : null;
    const srTrend   = prevMetrics ? calcTrend(metrics?.successRate ?? 0, prevMetrics.successRate) : null;
    const durTrend  = prevMetrics ? calcTrend(metrics?.avgBuildDuration ?? 0, prevMetrics.avgBuildDuration) : null;
    const waitTrend = prevMetrics ? calcTrend(metrics?.avgWaitTime ?? 0, prevMetrics.avgWaitTime) : null;

    const grade = metrics?.performanceGrade || metrics?.performance_grade;
    const gradeColor = { Elite: '#34D399', High: '#60A5FA', Medium: '#FBBF24', Low: '#F87171' }[grade];

    const kpis = [
        { title: 'Deployment Frequency', value: metrics ? `${metrics.deploymentFrequency ?? 0}/day` : '…', subtitle: `Last ${range}`, icon: Rocket, color: 'blue', ...(depTrend||{}) },
        { title: 'Success Rate', value: metrics ? `${metrics.successRate ?? 0}%` : '…', subtitle: 'Pipeline stability', icon: AlertTriangle, color: 'orange', ...(srTrend||{}) },
        { title: 'Mean Build Duration', value: metrics ? `${metrics.avgBuildDuration ?? 0}m` : '…', subtitle: 'Execution speed', icon: Clock, color: 'purple', ...(durTrend ? { trend: durTrend.trend, trendUp: !durTrend.trendUp } : {}) },
        { title: 'Avg Wait Time', value: metrics ? `${metrics.avgWaitTime ?? 0}h` : '…', subtitle: 'Queue efficiency', icon: Zap, color: 'indigo', ...(waitTrend ? { trend: waitTrend.trend, trendUp: !waitTrend.trendUp } : {}) },
    ];

    return (
        <div style={{ padding: '32px', maxWidth: 1400, margin: '0 auto', animation: 'fadeIn 0.5s ease-out' }}>

            {/* ── Header ── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 28 }}>
                <div>
                    <h1 style={{ fontSize: 32, fontWeight: 800, color: '#fff', letterSpacing: '-0.04em', margin: 0 }}>Dashboard</h1>
                    <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#34D399', display: 'inline-block' }} />
                        {selectedRepo || 'All projects'}
                        {grade && <span style={{ padding: '1px 8px', borderRadius: 6, background: `${gradeColor}18`, border: `1px solid ${gradeColor}40`, fontSize: 10, fontWeight: 800, color: gradeColor, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{grade}</span>}
                    </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ display: 'flex', background: 'rgba(255,255,255,0.03)', padding: 4, borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
                        {RANGES.map(r => (
                            <button key={r} onClick={() => setRange(r)} style={{ padding: '6px 14px', borderRadius: 9, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer', transition: 'all 0.2s', background: range === r ? 'rgba(255,255,255,0.1)' : 'transparent', color: range === r ? '#fff' : 'rgba(255,255,255,0.4)' }}>{r}</button>
                        ))}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'rgba(255,255,255,0.3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', cursor: refreshing ? 'not-allowed' : 'pointer' }}
                        onClick={() => !refreshing && fetchData(true)}>
                        <RefreshCw size={12} className={(loading||refreshing) ? 'animate-spin' : ''} />
                        {lastSync.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                </div>
            </div>

            {/* ── Needs Attention ── */}
            {!loading && <NeedsAttention secSummary={secSummary} runs={runs} sites={sites} />}

            {/* ── KPI Row ── */}
            <div className="kpi-grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20, marginBottom: 24 }}>
                {kpis.map((k, i) => (
                    <div key={k.title} style={{ animation: `slideUp 0.5s ease-out ${i*0.08}s both` }}>
                        <StatCard {...k} loading={loading} />
                    </div>
                ))}
            </div>

            {/* ── Charts + Activity Feed ── */}
            <div className="chart-activity-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 340px', gap: 20, marginBottom: 24, height: 340 }}>
                <ChartCard title="Deployment Volume" icon={Rocket} badge={{ label: range, className: 'badge-muted' }}>
                    {loading ? <div className="h-full skeleton rounded-xl" /> : chartData.dep ? <Bar key={`dep-${range}`} data={chartData.dep} options={chartOpts()} /> : <div className="flex h-full w-full items-center justify-center text-slate-500 text-sm">No data</div>}
                </ChartCard>
                <ChartCard title="Pipeline Success Rate" icon={TrendingUp} badge={{ label: 'Stability', className: 'badge-green' }}>
                    {loading ? <div className="h-full skeleton rounded-xl" /> : chartData.sr ? <Line key={`sr-${range}`} data={chartData.sr} options={chartOpts('%')} /> : <div className="flex h-full w-full items-center justify-center text-slate-500 text-sm">No data</div>}
                </ChartCard>
                <ActivityFeed runs={runs} loading={loading} />
            </div>

            {/* ── Security + Sites ── */}
            <div className="security-sites-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                <SecurityCard secSummary={secSummary} loading={loading} />
                <SitesCard sites={sites} loading={sitesLoading} />
            </div>

        </div>
    );
};

export default Dashboard;
