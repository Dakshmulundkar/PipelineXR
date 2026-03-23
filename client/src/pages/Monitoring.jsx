import { useState, useEffect, useCallback, useRef } from 'react';
import { Activity, Plus, Trash2, RefreshCw, CheckCircle2, XCircle, Clock, Zap, AlertTriangle, Globe } from 'lucide-react';
import { Line } from 'react-chartjs-2';
import {
    Chart as ChartJS, CategoryScale, LinearScale, PointElement,
    LineElement, Title, Tooltip, Legend, Filler
} from 'chart.js';
import { api } from '../services/api';
import { useAppContext } from '../contexts/AppContext';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const RANGES = [
    { label: '1h',  hours: 1  },
    { label: '6h',  hours: 6  },
    { label: '24h', hours: 24 },
    { label: '7d',  hours: 168 },
];

// Uptime bar — 90 mini blocks showing up/down history
function UptimeBar({ checks }) {
    if (!checks?.length) return (
        <div style={{ display: 'flex', gap: 2 }}>
            {Array.from({ length: 90 }).map((_, i) => (
                <div key={i} style={{ flex: 1, height: 28, borderRadius: 3, background: 'rgba(255,255,255,0.06)' }} />
            ))}
        </div>
    );
    // Bucket into 90 slots
    const buckets = 90;
    const perBucket = Math.max(1, Math.floor(checks.length / buckets));
    const slots = [];
    for (let i = 0; i < buckets; i++) {
        const slice = checks.slice(i * perBucket, (i + 1) * perBucket);
        if (!slice.length) { slots.push(null); continue; }
        const upCount = slice.filter(c => c.is_up).length;
        slots.push(upCount / slice.length);
    }
    return (
        <div style={{ display: 'flex', gap: 2 }}>
            {slots.map((ratio, i) => (
                <div key={i} title={ratio === null ? 'No data' : `${Math.round(ratio * 100)}% up`} style={{
                    flex: 1, height: 28, borderRadius: 3,
                    background: ratio === null
                        ? 'rgba(255,255,255,0.06)'
                        : ratio === 1 ? '#34D399'
                        : ratio >= 0.8 ? '#FBBF24'
                        : '#F87171',
                    transition: 'opacity 0.2s',
                    cursor: 'default',
                }} />
            ))}
        </div>
    );
}

// Response time line chart
function ResponseChart({ checks, color = '#60A5FA' }) {
    if (!checks?.length) return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'rgba(255,255,255,0.2)', fontSize: 13 }}>
            No data yet — first check pending
        </div>
    );
    const labels = checks.map(c => {
        const d = new Date(c.checked_at);
        return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    });
    const data = checks.map(c => c.response_time_ms || 0);
    return (
        <Line
            data={{
                labels,
                datasets: [{
                    label: 'Response Time (ms)',
                    data,
                    borderColor: color,
                    backgroundColor: (ctx) => {
                        const g = ctx.chart.ctx.createLinearGradient(0, 0, 0, 180);
                        g.addColorStop(0, `${color}33`);
                        g.addColorStop(1, `${color}00`);
                        return g;
                    },
                    fill: true, tension: 0.4,
                    pointRadius: data.map((_, i) => i === data.length - 1 ? 4 : 0),
                    pointBackgroundColor: color,
                    borderWidth: 2,
                }]
            }}
            options={{
                responsive: true, maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                animation: { duration: 800 },
                scales: {
                    x: { grid: { display: false }, ticks: { color: 'rgba(255,255,255,0.25)', font: { size: 10 }, maxTicksLimit: 8, maxRotation: 0 }, border: { display: false } },
                    y: { grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { color: 'rgba(255,255,255,0.25)', font: { size: 10 }, padding: 6 }, border: { display: false }, beginAtZero: true },
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(18,18,22,0.95)', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1,
                        titleColor: '#fff', bodyColor: 'rgba(255,255,255,0.6)', padding: 10, cornerRadius: 10,
                        callbacks: { label: ctx => ` ${ctx.parsed.y}ms` }
                    }
                }
            }}
        />
    );
}

const card = {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 16,
    padding: 24,
};

function StatPill({ label, value, color = '#60A5FA' }) {
    return (
        <div style={{ ...card, padding: '16px 20px', flex: 1, minWidth: 120 }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 6, fontWeight: 600, letterSpacing: '0.04em' }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color }}>{value ?? '—'}</div>
        </div>
    );
}

export default function Monitoring() {
    const { isAdmin } = useAppContext();

    const [sites, setSites] = useState([]);
    const [selected, setSelected] = useState(null);
    const [checks, setChecks] = useState([]);
    const [stats, setStats] = useState(null);
    const [incidents, setIncidents] = useState([]);
    const [range, setRange] = useState(RANGES[2]); // 24h default
    const [loading, setLoading] = useState(true);
    const [detailLoading, setDetailLoading] = useState(false);
    const [addUrl, setAddUrl] = useState('');
    const [addEmail, setAddEmail] = useState('');
    const [adding, setAdding] = useState(false);
    const [addError, setAddError] = useState('');
    const [lastRefresh, setLastRefresh] = useState(null);
    const intervalRef = useRef(null);

    // Load sites
    const loadSites = useCallback(async () => {
        try {
            const data = await api.getMonitorSites();
            setSites(data || []);
            setLastRefresh(new Date());
        } catch (e) {
            console.error('Failed to load sites', e);
        } finally {
            setLoading(false);
        }
    }, []);

    // Load detail for selected site
    const loadDetail = useCallback(async (siteId, hours) => {
        if (!siteId) return;
        setDetailLoading(true);
        try {
            const [c, s, inc] = await Promise.all([
                api.getMonitorChecks(siteId, hours),
                api.getMonitorStats(siteId, hours),
                api.getMonitorIncidents(siteId),
            ]);
            setChecks(c || []);
            setStats(s || null);
            setIncidents(inc || []);
        } catch (e) {
            console.error('Failed to load detail', e);
        } finally {
            setDetailLoading(false);
        }
    }, []);

    useEffect(() => {
        loadSites();
    }, [loadSites]);

    // Auto-select first site
    useEffect(() => {
        if (sites.length && !selected) setSelected(sites[0]);
    }, [sites, selected]);

    // Load detail when selection or range changes
    useEffect(() => {
        if (selected) loadDetail(selected.id, range.hours);
    }, [selected, range, loadDetail]);

    // Auto-refresh every 60s
    useEffect(() => {
        intervalRef.current = setInterval(() => {
            loadSites();
            if (selected) loadDetail(selected.id, range.hours);
        }, 60000);
        return () => clearInterval(intervalRef.current);
    }, [loadSites, loadDetail, selected, range]);

    const handleAdd = async (e) => {
        e.preventDefault();
        if (!addUrl.trim()) return;
        setAdding(true);
        setAddError('');
        try {
            await api.addMonitorSite(addUrl.trim(), addEmail.trim() || null);
            setAddUrl('');
            setAddEmail('');
            await loadSites();
        } catch (err) {
            setAddError(err?.response?.data?.error || err.message || 'Failed to add site');
        } finally {
            setAdding(false);
        }
    };

    const handleRemove = async (id) => {
        try {
            await api.removeMonitorSite(id);
            if (selected?.id === id) setSelected(null);
            await loadSites();
        } catch (e) {
            console.error('Remove failed', e);
        }
    };

    const statusColor = (site) => site?.is_up ? '#34D399' : '#F87171';
    const statusLabel = (site) => site?.is_up ? 'UP' : 'DOWN';

    return (
        <div style={{ padding: '32px', maxWidth: 1200, margin: '0 auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(52,211,153,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Activity size={18} style={{ color: '#34D399' }} />
                    </div>
                    <div>
                        <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}>Uptime Monitoring</div>
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>
                            {lastRefresh ? `Last checked ${lastRefresh.toLocaleTimeString()}` : 'Loading...'}
                        </div>
                    </div>
                </div>
                <button
                    onClick={() => { loadSites(); if (selected) loadDetail(selected.id, range.hours); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '8px 14px', color: 'rgba(255,255,255,0.6)', fontSize: 13, cursor: 'pointer' }}
                >
                    <RefreshCw size={13} /> Refresh
                </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 20 }}>
                {/* ── Left: Site List + Add Form ── */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {/* Add site form */}
                    <div style={card}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.4)', marginBottom: 14, letterSpacing: '0.04em' }}>
                            ADD SITE {!isAdmin && sites.length >= 1 ? <span style={{ color: '#FBBF24' }}>(limit reached)</span> : ''}
                        </div>
                        {!isAdmin && sites.length >= 1 ? (
                            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', lineHeight: 1.6 }}>
                                Free plan allows 1 monitored site. Remove the existing site to add a new one.
                            </div>
                        ) : (
                            <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                <div style={{ position: 'relative' }}>
                                    <Globe size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)' }} />
                                    <input
                                        value={addUrl}
                                        onChange={e => setAddUrl(e.target.value)}
                                        placeholder="https://yoursite.com"
                                        required
                                        style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '9px 10px 9px 30px', fontSize: 13, color: '#fff', outline: 'none', boxSizing: 'border-box' }}
                                    />
                                </div>
                                <input
                                    value={addEmail}
                                    onChange={e => setAddEmail(e.target.value)}
                                    placeholder="Alert email (optional)"
                                    type="email"
                                    style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '9px 10px', fontSize: 13, color: '#fff', outline: 'none', boxSizing: 'border-box' }}
                                />
                                {addError && <div style={{ fontSize: 11, color: '#F87171' }}>{addError}</div>}
                                <button
                                    type="submit"
                                    disabled={adding}
                                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 10, padding: '9px', color: '#60A5FA', fontSize: 13, fontWeight: 600, cursor: adding ? 'not-allowed' : 'pointer', opacity: adding ? 0.6 : 1 }}
                                >
                                    <Plus size={14} /> {adding ? 'Adding...' : 'Start Monitoring'}
                                </button>
                            </form>
                        )}
                    </div>

                    {/* Site list */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {loading ? (
                            <div style={{ ...card, textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontSize: 13 }}>Loading...</div>
                        ) : sites.length === 0 ? (
                            <div style={{ ...card, textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontSize: 13 }}>No sites monitored yet</div>
                        ) : sites.map(site => (
                            <div
                                key={site.id}
                                onClick={() => setSelected(site)}
                                style={{
                                    ...card,
                                    padding: '14px 16px',
                                    cursor: 'pointer',
                                    border: selected?.id === site.id ? '1px solid rgba(59,130,246,0.4)' : '1px solid rgba(255,255,255,0.07)',
                                    background: selected?.id === site.id ? 'rgba(59,130,246,0.06)' : 'rgba(255,255,255,0.03)',
                                    transition: 'all 0.15s',
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                            <div style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor(site), boxShadow: `0 0 6px ${statusColor(site)}`, flexShrink: 0 }} />
                                            <span style={{ fontSize: 11, fontWeight: 700, color: statusColor(site) }}>{statusLabel(site)}</span>
                                        </div>
                                        <div style={{ fontSize: 12, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {site.url.replace(/^https?:\/\//, '')}
                                        </div>
                                        {site.last_checked && (
                                            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 3 }}>
                                                {new Date(site.last_checked).toLocaleTimeString()}
                                            </div>
                                        )}
                                    </div>
                                    <button
                                        onClick={e => { e.stopPropagation(); handleRemove(site.id); }}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(248,113,113,0.4)', padding: 4, borderRadius: 6, flexShrink: 0 }}
                                        title="Remove"
                                    >
                                        <Trash2 size={13} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* ── Right: Detail Panel ── */}
                <div>
                    {!selected ? (
                        <div style={{ ...card, display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: 'rgba(255,255,255,0.2)', fontSize: 14 }}>
                            Select a site to view details
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            {/* Site header */}
                            <div style={{ ...card, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                        {selected.is_up
                                            ? <CheckCircle2 size={16} style={{ color: '#34D399' }} />
                                            : <XCircle size={16} style={{ color: '#F87171' }} />}
                                        <span style={{ fontSize: 16, fontWeight: 700 }}>{selected.url}</span>
                                    </div>
                                    {selected.alert_email && (
                                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
                                            Alerts → {selected.alert_email}
                                        </div>
                                    )}
                                </div>
                                {/* Range selector */}
                                <div style={{ display: 'flex', gap: 6 }}>
                                    {RANGES.map(r => (
                                        <button
                                            key={r.label}
                                            onClick={() => setRange(r)}
                                            style={{
                                                padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                                background: range.label === r.label ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.05)',
                                                border: range.label === r.label ? '1px solid rgba(59,130,246,0.4)' : '1px solid rgba(255,255,255,0.08)',
                                                color: range.label === r.label ? '#60A5FA' : 'rgba(255,255,255,0.4)',
                                            }}
                                        >{r.label}</button>
                                    ))}
                                </div>
                            </div>

                            {/* Stats row */}
                            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                                <StatPill label="UPTIME" value={stats?.uptime_pct != null ? `${stats.uptime_pct}%` : '—'} color={stats?.uptime_pct >= 99 ? '#34D399' : stats?.uptime_pct >= 90 ? '#FBBF24' : '#F87171'} />
                                <StatPill label="AVG RESPONSE" value={stats?.avg_response ? `${Math.round(stats.avg_response)}ms` : '—'} color="#60A5FA" />
                                <StatPill label="MIN RESPONSE" value={stats?.min_response ? `${stats.min_response}ms` : '—'} color="#A78BFA" />
                                <StatPill label="MAX RESPONSE" value={stats?.max_response ? `${stats.max_response}ms` : '—'} color="#FBBF24" />
                                <StatPill label="CHECKS" value={stats?.total ?? '—'} color="rgba(255,255,255,0.5)" />
                            </div>

                            {/* Uptime bar */}
                            <div style={card}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.3)', marginBottom: 12, letterSpacing: '0.04em' }}>
                                    UPTIME HISTORY — LAST {range.label.toUpperCase()}
                                </div>
                                <UptimeBar checks={checks} />
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>
                                    <span>{range.label} ago</span><span>now</span>
                                </div>
                            </div>

                            {/* Response time chart */}
                            <div style={{ ...card, height: 200 }}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.3)', marginBottom: 12, letterSpacing: '0.04em' }}>RESPONSE TIME (ms)</div>
                                {detailLoading ? (
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 140, color: 'rgba(255,255,255,0.2)', fontSize: 13 }}>Loading...</div>
                                ) : (
                                    <div style={{ height: 140 }}>
                                        <ResponseChart checks={checks} />
                                    </div>
                                )}
                            </div>

                            {/* Incidents */}
                            <div style={card}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.3)', marginBottom: 14, letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <AlertTriangle size={12} /> INCIDENT LOG
                                </div>
                                {incidents.length === 0 ? (
                                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.2)', textAlign: 'center', padding: '12px 0' }}>No incidents recorded</div>
                                ) : incidents.map((inc, i) => (
                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i < incidents.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: inc.resolved_at ? '#34D399' : '#F87171', flexShrink: 0 }} />
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: 12, color: '#fff', fontWeight: 600 }}>
                                                {inc.resolved_at ? 'Resolved' : 'Ongoing outage'}
                                            </div>
                                            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>
                                                Started: {new Date(inc.started_at).toLocaleString()}
                                                {inc.resolved_at && ` · Resolved: ${new Date(inc.resolved_at).toLocaleString()}`}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
                                            <Clock size={11} />
                                            {inc.resolved_at
                                                ? `${Math.round((new Date(inc.resolved_at) - new Date(inc.started_at)) / 60000)}m`
                                                : 'ongoing'}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Admin badge */}
            {isAdmin && (
                <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>
                    <Zap size={11} style={{ color: '#FBBF24' }} /> Admin mode — unlimited sites
                </div>
            )}
        </div>
    );
}
