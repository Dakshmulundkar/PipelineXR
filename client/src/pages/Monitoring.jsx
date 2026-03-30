import { useState, useEffect, useCallback, useRef } from 'react';
import { Activity, Plus, Trash2, RefreshCw, CheckCircle2, XCircle, Clock, Zap, AlertTriangle, Globe, Shield, Ban, TrendingUp, Eye } from 'lucide-react';
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
    const [addStatus, setAddStatus] = useState(''); // 'sending' | 'awaiting_code' | 'verifying' | 'ok' | 'down' | ''
    const [addCode, setAddCode] = useState('');
    const [pendingUrl, setPendingUrl] = useState('');
    const [pendingEmail, setPendingEmail] = useState('');
    const [lastRefresh, setLastRefresh] = useState(null);
    const intervalRef = useRef(null);

    // IDS state (admin only)
    const [idsEvents, setIdsEvents] = useState([]);
    const [idsBlocked, setIdsBlocked] = useState([]);
    const [idsTraffic, setIdsTraffic] = useState([]);
    const [idsLoading, setIdsLoading] = useState(false);

    // Load sites — also sync the selected site object so is_up stays current
    const loadSites = useCallback(async () => {
        try {
            const data = await api.getMonitorSites();
            setSites(data || []);
            setLastRefresh(new Date());
            // Keep selected in sync with latest server state (is_up, last_checked, etc.)
            setSelected(prev => {
                if (!prev) return prev;
                const updated = (data || []).find(s => s.id === prev.id);
                return updated || prev;
            });
        } catch (e) {
            console.error('Failed to load sites', e);
        } finally {
            setLoading(false);
        }
    }, []);

    // Load IDS data (admin only)
    const loadIds = useCallback(async () => {
        if (!isAdmin) return;
        setIdsLoading(true);
        try {
            const [events, blocked, traffic] = await Promise.all([
                api.getIdsEvents(50),
                api.getIdsBlocked(),
                api.getIdsTraffic(),
            ]);
            setIdsEvents(events || []);
            setIdsBlocked(blocked || []);
            setIdsTraffic(traffic || []);
        } catch (e) {
            console.error('IDS load failed', e);
        } finally {
            setIdsLoading(false);
        }
    }, [isAdmin]);

    // Load detail for selected site
    const loadDetail = useCallback(async (siteId, hours) => {
        if (!siteId) return;
        // Clear stale data immediately so we never show another site's stats
        setChecks([]);
        setStats(null);
        setIncidents([]);
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
        loadIds();
    }, [loadSites, loadIds]);

    // Auto-select first site — only if nothing is selected yet
    useEffect(() => {
        if (sites.length && !selected) setSelected(sites[0]);
    }, [sites, selected]);

    // Load detail when selection or range changes — always clear first
    useEffect(() => {
        if (selected) {
            loadDetail(selected.id, range.hours);
        } else {
            setChecks([]);
            setStats(null);
            setIncidents([]);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selected?.id, range.hours, loadDetail]); // use selected.id not selected object to avoid re-runs on is_up refresh

    // Auto-refresh every 60s — use a ref for selected so the interval always has the latest value
    const selectedRef = useRef(null);
    useEffect(() => { selectedRef.current = selected; }, [selected]);
    const rangeRef = useRef(range);
    useEffect(() => { rangeRef.current = range; }, [range]);

    useEffect(() => {
        intervalRef.current = setInterval(() => {
            loadSites();
            loadIds();
            const cur = selectedRef.current;
            if (cur) loadDetail(cur.id, rangeRef.current.hours);
        }, 60000);
        return () => clearInterval(intervalRef.current);
    }, [loadSites, loadIds, loadDetail]);

    // Step 1 — validate inputs, send verification code
    const handleSendCode = async (e) => {
        e.preventDefault();
        if (!addUrl.trim()) return;
        if (!addEmail.trim()) { setAddError('Alert email is required'); return; }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addEmail.trim())) { setAddError('Enter a valid email address'); return; }
        setAdding(true);
        setAddError('');
        setAddStatus('sending');
        try {
            await api.sendMonitorVerification(addUrl.trim(), addEmail.trim());
            setPendingUrl(addUrl.trim());
            setPendingEmail(addEmail.trim());
            setAddStatus('awaiting_code');
            setAddCode('');
        } catch (err) {
            setAddStatus('');
            setAddError(err?.response?.data?.error || err.message || 'Failed to send code');
        } finally {
            setAdding(false);
        }
    };

    // Step 2 — submit the verification code, add the site
    const handleVerifyAndAdd = async (e) => {
        e.preventDefault();
        if (!addCode.trim()) return;
        setAdding(true);
        setAddError('');
        setAddStatus('verifying');
        try {
            const newSite = await api.confirmMonitorVerification(pendingUrl, pendingEmail, addCode.trim());
            setAddStatus(newSite.is_up ? 'ok' : 'down');
            setAddUrl('');
            setAddEmail('');
            setAddCode('');
            setPendingUrl('');
            setPendingEmail('');
            await loadSites();
            if (newSite.id) setSelected(newSite);
            setTimeout(() => setAddStatus(''), 3000);
        } catch (err) {
            setAddStatus('awaiting_code'); // stay on code step so they can retry
            setAddError(err?.response?.data?.error || err.message || 'Verification failed');
        } finally {
            setAdding(false);
        }
    };

    const handleCancelVerification = () => {
        setAddStatus('');
        setAddCode('');
        setPendingUrl('');
        setPendingEmail('');
        setAddError('');
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
                    onClick={() => { loadSites(); loadIds(); if (selected) loadDetail(selected.id, range.hours); }}
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
                        ) : isAdmin ? (
                            /* ── Admin: direct add, no verification needed ── */
                            <form onSubmit={async (e) => {
                                e.preventDefault();
                                setAdding(true); setAddError(''); setAddStatus('sending');
                                try {
                                    const newSite = await api.addMonitorSite(addUrl.trim(), addEmail.trim() || null);
                                    setAddStatus(newSite.is_up ? 'ok' : 'down');
                                    setAddUrl(''); setAddEmail('');
                                    await loadSites();
                                    if (newSite.id) setSelected(newSite);
                                    setTimeout(() => setAddStatus(''), 3000);
                                } catch (err) {
                                    setAddStatus('');
                                    setAddError(err?.response?.data?.error || err.message || 'Failed to add site');
                                } finally { setAdding(false); }
                            }} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                <div style={{ position: 'relative' }}>
                                    <Globe size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)' }} />
                                    <input value={addUrl} onChange={e => setAddUrl(e.target.value)} placeholder="https://yoursite.com" required
                                        style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '9px 10px 9px 30px', fontSize: 13, color: '#fff', outline: 'none', boxSizing: 'border-box' }} />
                                </div>
                                <input value={addEmail} onChange={e => setAddEmail(e.target.value)} placeholder="Alert email (optional)" type="email"
                                    style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '9px 10px', fontSize: 13, color: '#fff', outline: 'none', boxSizing: 'border-box' }} />
                                {addError && <div style={{ fontSize: 11, color: '#F87171', lineHeight: 1.5 }}>{addError}</div>}
                                {addStatus === 'ok' && <div style={{ fontSize: 11, color: '#34D399' }}>✓ Site is reachable — monitoring started</div>}
                                {addStatus === 'down' && <div style={{ fontSize: 11, color: '#FBBF24' }}>⚠ Site added but currently unreachable — monitoring active</div>}
                                <button type="submit" disabled={adding}
                                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 10, padding: '9px', color: '#60A5FA', fontSize: 13, fontWeight: 600, cursor: adding ? 'not-allowed' : 'pointer', opacity: adding ? 0.6 : 1 }}>
                                    <Plus size={14} /> {adding ? 'Adding...' : 'Start Monitoring'}
                                </button>
                            </form>
                        ) : addStatus === 'awaiting_code' || addStatus === 'verifying' ? (
                            /* ── Step 2: Enter verification code ── */
                            <form onSubmit={handleVerifyAndAdd} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>
                                    A 6-digit code was sent to <span style={{ color: '#60A5FA', fontWeight: 600 }}>{pendingEmail}</span>. Enter it below to confirm.
                                </div>
                                <input
                                    value={addCode}
                                    onChange={e => setAddCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    placeholder="Enter 6-digit code"
                                    required
                                    maxLength={6}
                                    autoFocus
                                    style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(59,130,246,0.4)', borderRadius: 10, padding: '10px 12px', fontSize: 20, fontWeight: 700, color: '#fff', outline: 'none', boxSizing: 'border-box', letterSpacing: 8, textAlign: 'center' }}
                                />
                                {addError && <div style={{ fontSize: 11, color: '#F87171', lineHeight: 1.5 }}>{addError}</div>}
                                <button
                                    type="submit"
                                    disabled={adding || addCode.length !== 6}
                                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'rgba(52,211,153,0.15)', border: '1px solid rgba(52,211,153,0.3)', borderRadius: 10, padding: '9px', color: '#34D399', fontSize: 13, fontWeight: 600, cursor: (adding || addCode.length !== 6) ? 'not-allowed' : 'pointer', opacity: (adding || addCode.length !== 6) ? 0.6 : 1 }}
                                >
                                    {adding ? 'Verifying...' : '✓ Verify & Add Site'}
                                </button>
                                <button
                                    type="button"
                                    onClick={handleCancelVerification}
                                    style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', fontSize: 12, cursor: 'pointer', padding: '4px 0' }}
                                >
                                    ← Back
                                </button>
                            </form>
                        ) : (
                            /* ── Step 1: Enter URL + email ── */
                            <form onSubmit={handleSendCode} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
                                    placeholder="Alert email (required)"
                                    type="email"
                                    required
                                    style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '9px 10px', fontSize: 13, color: '#fff', outline: 'none', boxSizing: 'border-box' }}
                                />
                                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', lineHeight: 1.5 }}>
                                    A verification code will be sent to this email before the site is added.
                                </div>
                                {addError && <div style={{ fontSize: 11, color: '#F87171', lineHeight: 1.5 }}>{addError}</div>}
                                {addStatus === 'ok' && <div style={{ fontSize: 11, color: '#34D399' }}>✓ Site is reachable — monitoring started</div>}
                                {addStatus === 'down' && <div style={{ fontSize: 11, color: '#FBBF24' }}>⚠ Site added but currently unreachable — monitoring active</div>}
                                <button
                                    type="submit"
                                    disabled={adding}
                                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 10, padding: '9px', color: '#60A5FA', fontSize: 13, fontWeight: 600, cursor: adding ? 'not-allowed' : 'pointer', opacity: adding ? 0.6 : 1 }}
                                >
                                    <Plus size={14} /> {adding ? 'Sending code...' : 'Send Verification Code'}
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
                    ) : detailLoading ? (
                        /* Skeleton while fetching per-site data */
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div style={{ ...card, height: 64, background: 'rgba(255,255,255,0.04)' }} />
                            <div style={{ display: 'flex', gap: 12 }}>
                                {[1,2,3,4,5].map(i => <div key={i} style={{ flex: 1, height: 72, borderRadius: 16, background: 'rgba(255,255,255,0.04)' }} />)}
                            </div>
                            <div style={{ ...card, height: 80, background: 'rgba(255,255,255,0.04)' }} />
                            <div style={{ ...card, height: 200, background: 'rgba(255,255,255,0.04)' }} />
                            <div style={{ ...card, height: 120, background: 'rgba(255,255,255,0.04)' }} />
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

            {/* ── IDS / Security Panel (admin only) ── */}
            {isAdmin && (
                <div style={{ marginTop: 32 }}>
                    {/* Section header */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 32, height: 32, borderRadius: 9, background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Shield size={15} style={{ color: '#F87171' }} />
                            </div>
                            <div>
                                <div style={{ fontSize: 16, fontWeight: 700 }}>Intrusion Detection</div>
                                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 1 }}>Real-time traffic anomaly monitoring · Cloudflare-backed</div>
                            </div>
                        </div>
                        <button onClick={loadIds} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '7px 12px', color: 'rgba(255,255,255,0.5)', fontSize: 12, cursor: 'pointer' }}>
                            <RefreshCw size={12} className={idsLoading ? 'animate-spin' : ''} /> Refresh
                        </button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
                        {/* Blocked IPs */}
                        <div style={{ ...card, gridColumn: '1' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                                <Ban size={13} style={{ color: '#F87171' }} />
                                <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.05em' }}>BLOCKED IPs</span>
                                <span style={{ marginLeft: 'auto', fontSize: 18, fontWeight: 800, color: idsBlocked.length > 0 ? '#F87171' : '#34D399' }}>{idsBlocked.length}</span>
                            </div>
                            {idsBlocked.length === 0 ? (
                                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)', textAlign: 'center', padding: '8px 0' }}>No blocked IPs</div>
                            ) : idsBlocked.map((b, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: i < idsBlocked.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 12, fontFamily: 'monospace', color: '#F87171', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.ip}</div>
                                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 2 }}>Expires {new Date(b.expiresAt).toLocaleTimeString()}</div>
                                    </div>
                                    <button
                                        onClick={async () => { await api.unblockIp(b.ip); loadIds(); }}
                                        style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6, background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.2)', color: '#34D399', cursor: 'pointer' }}
                                    >Unblock</button>
                                </div>
                            ))}
                        </div>

                        {/* Top traffic */}
                        <div style={{ ...card }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                                <TrendingUp size={13} style={{ color: '#60A5FA' }} />
                                <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.05em' }}>TOP IPs (req/min)</span>
                            </div>
                            {idsTraffic.length === 0 ? (
                                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)', textAlign: 'center', padding: '8px 0' }}>No traffic data yet</div>
                            ) : idsTraffic.slice(0, 6).map((t, i) => {
                                const max = idsTraffic[0]?.count || 1;
                                return (
                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                                        <span style={{ fontSize: 11, fontFamily: 'monospace', color: t.blocked ? '#F87171' : '#fff', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.ip}</span>
                                        <div style={{ width: 60, height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                                            <div style={{ height: '100%', borderRadius: 2, background: t.blocked ? '#F87171' : '#60A5FA', width: `${(t.count / max) * 100}%` }} />
                                        </div>
                                        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', width: 28, textAlign: 'right' }}>{t.count}</span>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Security posture — dynamic from backend */}
                        <div style={{ ...card }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                                <Shield size={13} style={{ color: '#F97316' }} />
                                <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.05em' }}>SECURITY POSTURE</span>
                            </div>
                            {idsLoading ? (
                                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)' }}>Loading...</div>
                            ) : (
                                <>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: idsBlocked.length > 0 ? '#FBBF24' : '#34D399' }} />
                                        <span style={{ fontSize: 12, color: '#fff', fontWeight: 600 }}>
                                            {idsBlocked.length > 0 ? `${idsBlocked.length} IP(s) currently blocked` : 'No active threats'}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                                            <span style={{ color: 'rgba(255,255,255,0.4)' }}>Anomalies (last 50)</span>
                                            <span style={{ color: idsEvents.length > 10 ? '#FBBF24' : '#34D399', fontWeight: 700 }}>{idsEvents.length}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                                            <span style={{ color: 'rgba(255,255,255,0.4)' }}>Blocked IPs</span>
                                            <span style={{ color: idsBlocked.length > 0 ? '#F87171' : '#34D399', fontWeight: 700 }}>{idsBlocked.length}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                                            <span style={{ color: 'rgba(255,255,255,0.4)' }}>Active IPs tracked</span>
                                            <span style={{ color: '#60A5FA', fontWeight: 700 }}>{idsTraffic.length}</span>
                                        </div>
                                        {idsEvents.filter(e => e.type === 'BLOCK').length > 0 && (
                                            <div style={{ marginTop: 6, padding: '6px 10px', background: 'rgba(248,113,113,0.08)', borderRadius: 8, border: '1px solid rgba(248,113,113,0.15)', fontSize: 11, color: '#F87171' }}>
                                                {idsEvents.filter(e => e.type === 'BLOCK').length} block event(s) detected
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Recent anomaly events */}
                    <div style={card}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
                            <Eye size={13} style={{ color: '#A78BFA' }} />
                            <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.05em' }}>ANOMALY LOG</span>
                            <span style={{ marginLeft: 'auto', fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>Last 50 events</span>
                        </div>
                        {idsEvents.length === 0 ? (
                            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.2)', textAlign: 'center', padding: '16px 0' }}>No anomalies detected — traffic looks clean</div>
                        ) : (
                            <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                                {idsEvents.map((e, i) => {
                                    const typeColor = e.type === 'BLOCK' ? '#F87171' : e.type === 'WARN' ? '#FBBF24' : e.type === 'SCANNER' ? '#F97316' : e.type === 'PATH_TRAVERSAL' ? '#EF4444' : '#A78BFA';
                                    return (
                                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', borderBottom: i < idsEvents.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                                            <span style={{ fontSize: 9, fontWeight: 800, color: typeColor, background: `${typeColor}15`, padding: '2px 6px', borderRadius: 5, flexShrink: 0, marginTop: 1 }}>{e.type}</span>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.7)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.ip}</div>
                                                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>{e.detail}</div>
                                            </div>
                                            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', flexShrink: 0 }}>
                                                {new Date(e.timestamp).toLocaleTimeString()}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
