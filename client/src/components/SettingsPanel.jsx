import { useState, useEffect } from 'react';
import {
    X, Users, Eye, TrendingUp, Wifi, BarChart2,
    Github, LogOut, Shield, Info, Activity, Globe,
    Code, Copy, Check, MousePointer, RefreshCw
} from 'lucide-react';
import { Line } from 'react-chartjs-2';
import {
    Chart as ChartJS, CategoryScale, LinearScale,
    PointElement, LineElement, Filler, Tooltip
} from 'chart.js';
import { api } from '../services/api';
import { useAppContext } from '../contexts/AppContext';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip);

const StatTile = ({ icon: IconComp, label, value, color = '#60A5FA', sub }) => (
    <div style={{
        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 16, padding: '16px 18px',
    }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <IconComp size={14} style={{ color }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
        </div>
        <div style={{ fontSize: 28, fontWeight: 800, color: '#fff', lineHeight: 1 }}>{value}</div>
        {sub && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>{sub}</div>}
    </div>
);

// ── Visitor Analytics Tab (admin-only) ────────────────────────────────────────
function VisitorAnalyticsTab() {
    const [sites, setSites] = useState([]);
    const [selectedSite, setSelectedSite] = useState(null);
    const [stats, setStats] = useState(null);
    const [scriptData, setScriptData] = useState(null);
    const [hours, setHours] = useState(24);
    const [loading, setLoading] = useState(false);
    const [copied, setCopied] = useState(false);
    const [showScript, setShowScript] = useState(false);

    useEffect(() => {
        api.getVisitorSites()
            .then(data => {
                setSites(data || []);
                if (data?.length) setSelectedSite(data[0]);
            })
            .catch(() => setSites([]));
    }, []);

    useEffect(() => {
        if (!selectedSite) return;
        setLoading(true);
        setStats(null);
        setScriptData(null);
        setShowScript(false);
        Promise.all([
            api.getVisitorStats(selectedSite.id, hours),
            api.getVisitorScript(selectedSite.id),
        ]).then(([s, sc]) => {
            setStats(s);
            setScriptData(sc);
        }).catch(() => {}).finally(() => setLoading(false));
    }, [selectedSite, hours]);

    const copyScript = () => {
        if (!scriptData?.script) return;
        navigator.clipboard.writeText(scriptData.script).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    const hourlyChart = stats?.hourly?.length > 0 ? {
        labels: stats.hourly.map(h => {
            const d = new Date(h.hour);
            return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        }),
        datasets: [{
            label: 'Views',
            data: stats.hourly.map(h => h.views),
            borderColor: '#A78BFA',
            backgroundColor: (ctx) => {
                const g = ctx.chart.ctx.createLinearGradient(0, 0, 0, 100);
                g.addColorStop(0, 'rgba(167,139,250,0.2)');
                g.addColorStop(1, 'rgba(167,139,250,0)');
                return g;
            },
            fill: true, tension: 0.4, pointRadius: 2, borderWidth: 2,
        }]
    } : null;

    const chartOpts = {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(18,18,22,0.95)', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1, titleColor: '#fff', bodyColor: 'rgba(255,255,255,0.6)', padding: 8, cornerRadius: 8 } },
        scales: {
            x: { grid: { display: false }, ticks: { color: 'rgba(255,255,255,0.25)', font: { size: 9 }, maxTicksLimit: 6 }, border: { display: false } },
            y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: 'rgba(255,255,255,0.25)', font: { size: 9 }, padding: 4 }, border: { display: false }, beginAtZero: true },
        },
    };

    if (sites.length === 0) return (
        <div style={{ textAlign: 'center', padding: '32px 0', color: 'rgba(255,255,255,0.25)', fontSize: 13 }}>
            No monitored sites yet. Add a site in the Monitoring page first.
        </div>
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Site selector + range */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <select
                    value={selectedSite?.id || ''}
                    onChange={e => setSelectedSite(sites.find(s => s.id === parseInt(e.target.value)))}
                    style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '8px 10px', fontSize: 12, color: '#fff', outline: 'none' }}
                >
                    {sites.map(s => <option key={s.id} value={s.id} style={{ background: '#111' }}>{s.url.replace(/^https?:\/\//, '')}</option>)}
                </select>
                {[{ label: '1h', val: 1 }, { label: '24h', val: 24 }, { label: '7d', val: 168 }].map(r => (
                    <button key={r.val} onClick={() => setHours(r.val)} style={{
                        padding: '7px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                        background: hours === r.val ? 'rgba(167,139,250,0.15)' : 'rgba(255,255,255,0.04)',
                        border: hours === r.val ? '1px solid rgba(167,139,250,0.4)' : '1px solid rgba(255,255,255,0.08)',
                        color: hours === r.val ? '#A78BFA' : 'rgba(255,255,255,0.4)',
                    }}>{r.label}</button>
                ))}
                <button onClick={() => { setLoading(true); api.getVisitorStats(selectedSite.id, hours).then(setStats).finally(() => setLoading(false)); }}
                    style={{ padding: '7px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)', cursor: 'pointer' }}>
                    <RefreshCw size={12} />
                </button>
            </div>

            {loading ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                    {[1,2,3].map(i => <div key={i} style={{ height: 72, borderRadius: 14, background: 'rgba(255,255,255,0.04)' }} />)}
                </div>
            ) : stats ? (
                <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                        <StatTile icon={Eye}         label="Page Views"    value={stats.totalViews}     color="#A78BFA" />
                        <StatTile icon={Users}        label="Sessions"      value={stats.uniqueSessions} color="#60A5FA" />
                        <StatTile icon={MousePointer} label="Unique IPs"    value={stats.uniqueIPs}      color="#34D399" />
                    </div>

                    {hourlyChart && (
                        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: 14 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.35)', marginBottom: 10 }}>Views over time</div>
                            <div style={{ height: 90 }}><Line data={hourlyChart} options={chartOpts} /></div>
                        </div>
                    )}

                    {stats.topPages?.length > 0 && (
                        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: 14 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.35)', marginBottom: 10 }}>Top Pages</div>
                            {stats.topPages.map((p, i) => {
                                const max = stats.topPages[0]?.views || 1;
                                return (
                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                                        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', width: 12 }}>{i+1}</span>
                                        <span style={{ fontSize: 11, color: '#fff', flex: 1, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.path || '/'}</span>
                                        <div style={{ width: 60, height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                                            <div style={{ height: '100%', borderRadius: 2, background: '#A78BFA', width: `${(p.views/max)*100}%` }} />
                                        </div>
                                        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', width: 24, textAlign: 'right' }}>{p.views}</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {stats.topReferrers?.length > 0 && (
                        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: 14 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.35)', marginBottom: 10 }}>Top Referrers</div>
                            {stats.topReferrers.map((r, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                    <Globe size={10} style={{ color: 'rgba(255,255,255,0.2)', flexShrink: 0 }} />
                                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.referrer}</span>
                                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>{r.count}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            ) : null}

            {/* Embed snippet */}
            {scriptData && (
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.35)' }}>
                            <Code size={12} /> Embed Snippet
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={() => setShowScript(s => !s)} style={{ fontSize: 10, padding: '4px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)', cursor: 'pointer' }}>
                                {showScript ? 'Hide' : 'Show'}
                            </button>
                            <button onClick={copyScript} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, padding: '4px 10px', borderRadius: 6, background: copied ? 'rgba(52,211,153,0.1)' : 'rgba(167,139,250,0.1)', border: `1px solid ${copied ? 'rgba(52,211,153,0.3)' : 'rgba(167,139,250,0.3)'}`, color: copied ? '#34D399' : '#A78BFA', cursor: 'pointer' }}>
                                {copied ? <Check size={10} /> : <Copy size={10} />} {copied ? 'Copied' : 'Copy'}
                            </button>
                        </div>
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginBottom: 8, lineHeight: 1.5 }}>
                        Paste this snippet into the <code style={{ color: '#A78BFA' }}>&lt;head&gt;</code> of <strong style={{ color: 'rgba(255,255,255,0.6)' }}>{scriptData.url}</strong> to start tracking visitors.
                    </div>
                    {showScript && (
                        <pre style={{ fontSize: 10, color: '#34D399', background: 'rgba(0,0,0,0.4)', borderRadius: 8, padding: 12, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0, lineHeight: 1.6 }}>
                            {scriptData.script}
                        </pre>
                    )}
                </div>
            )}
        </div>
    );
}

const SettingsPanel = ({ open, onClose }) => {
    const { user, isAdmin } = useAppContext();
    const [tab, setTab] = useState(() => isAdmin ? 'analytics' : 'plans');
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!open) return;
        setLoading(true);
        api.getAnalyticsSummary()
            .then(d => setStats(d))
            .catch(() => setStats(null))
            .finally(() => setLoading(false));
    }, [open]);

    if (!open) return null;

    const dailyChart = stats?.dailyViews?.length > 0 ? {
        labels: stats.dailyViews.map(d => new Date(d.day + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
        datasets: [{
            label: 'Page Views',
            data: stats.dailyViews.map(d => d.views),
            borderColor: '#3B82F6',
            backgroundColor: (ctx) => {
                const g = ctx.chart.ctx.createLinearGradient(0, 0, 0, 120);
                g.addColorStop(0, 'rgba(59,130,246,0.25)');
                g.addColorStop(1, 'rgba(59,130,246,0)');
                return g;
            },
            fill: true, tension: 0.4,
            pointRadius: 3, pointBackgroundColor: '#3B82F6',
        }]
    } : null;

    const chartOpts = {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(18,18,22,0.95)', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1, titleColor: '#fff', bodyColor: 'rgba(255,255,255,0.6)', padding: 10, cornerRadius: 10 } },
        scales: {
            x: { grid: { display: false }, ticks: { color: 'rgba(255,255,255,0.3)', font: { size: 10 } }, border: { display: false } },
            y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: 'rgba(255,255,255,0.3)', font: { size: 10 }, padding: 6 }, border: { display: false }, beginAtZero: true },
        },
    };

    return (
        <>
            {/* Backdrop */}
            <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 200 }} />

            {/* Panel */}
            <div style={{
                position: 'fixed', top: 0, right: 0, bottom: 0, width: 480,
                background: 'rgba(12,12,16,0.98)', backdropFilter: 'blur(40px)',
                borderLeft: '1px solid rgba(255,255,255,0.08)',
                zIndex: 201, display: 'flex', flexDirection: 'column',
                animation: 'slideInRight 0.25s ease-out',
            }}>
                {/* Header */}
                <div style={{ padding: '24px 24px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>Settings</div>
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>PipelineXR workspace</div>
                    </div>
                    <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <X size={16} />
                    </button>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: 4, padding: '16px 24px 0' }}>
                    {(isAdmin ? [
                        { key: 'analytics', label: 'Analytics',  icon: BarChart2     },
                        { key: 'visitors',  label: 'Visitors',   icon: MousePointer  },
                        { key: 'account',   label: 'Account',    icon: Users         },
                        { key: 'about',     label: 'About',      icon: Info          },
                    ] : [
                        { key: 'plans',     label: 'Plans',      icon: TrendingUp    },
                        { key: 'visitors',  label: 'Visitors',   icon: MousePointer  },
                        { key: 'account',   label: 'Account',    icon: Users         },
                        { key: 'about',     label: 'About',      icon: Info          },
                    ]).map(t => (
                        <button key={t.key} onClick={() => setTab(t.key)} style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '8px 14px', borderRadius: 10, fontSize: 12, fontWeight: 600,
                            border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                            background: tab === t.key ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.03)',
                            color: tab === t.key ? '#60A5FA' : 'rgba(255,255,255,0.4)',
                        }}>
                            <t.icon size={13} /> {t.label}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 32px' }}>

                    {/* ── Analytics Tab ── */}
                    {tab === 'analytics' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Activity size={14} style={{ color: '#34D399' }} />
                                <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Site Analytics</span>
                                {stats?.liveNow > 0 && (
                                    <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#34D399', fontWeight: 700 }}>
                                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#34D399', boxShadow: '0 0 6px #34D399', display: 'inline-block' }} />
                                        {stats.liveNow} live now
                                    </span>
                                )}
                            </div>

                            {loading ? (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                    {[1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height: 80, borderRadius: 16 }} />)}
                                </div>
                            ) : stats ? (
                                <>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                        <StatTile icon={Eye}       label="Views Today"    value={stats.todayViews}    color="#60A5FA" sub="page loads" />
                                        <StatTile icon={TrendingUp} label="Views This Week" value={stats.weekViews}   color="#34D399" sub="last 7 days" />
                                        <StatTile icon={Users}     label="Sessions Today"  value={stats.todaySessions} color="#A78BFA" sub="unique visitors" />
                                        <StatTile icon={Wifi}      label="Live Now"        value={stats.liveNow}      color="#F59E0B" sub="connected users" />
                                    </div>

                                    {/* Daily chart */}
                                    {dailyChart ? (
                                        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 16 }}>
                                            <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.4)', marginBottom: 12 }}>Page Views — Last 7 Days</div>
                                            <div style={{ height: 120 }}>
                                                <Line data={dailyChart} options={chartOpts} />
                                            </div>
                                        </div>
                                    ) : (
                                        <div style={{ padding: '20px', textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontSize: 13, background: 'rgba(255,255,255,0.02)', borderRadius: 16, border: '1px dashed rgba(255,255,255,0.06)' }}>
                                            No view data yet — navigate around the app to start tracking
                                        </div>
                                    )}

                                    {/* Top pages */}
                                    {stats.topPages?.length > 0 && (
                                        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 16 }}>
                                            <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.4)', marginBottom: 12 }}>Top Pages (7d)</div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                {stats.topPages.map((p, i) => {
                                                    const max = stats.topPages[0]?.views || 1;
                                                    return (
                                                        <div key={p.path} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', width: 14, textAlign: 'right' }}>{i + 1}</span>
                                                            <span style={{ fontSize: 12, color: '#fff', fontWeight: 500, flex: 1, fontFamily: 'monospace' }}>{p.path || '/'}</span>
                                                            <div style={{ width: 80, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                                                                <div style={{ height: '100%', borderRadius: 2, background: '#3B82F6', width: `${(p.views / max) * 100}%` }} />
                                                            </div>
                                                            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', width: 28, textAlign: 'right' }}>{p.views}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)' }}>
                                        <Users size={14} style={{ color: 'rgba(255,255,255,0.3)' }} />
                                        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Total registered users</span>
                                        <span style={{ marginLeft: 'auto', fontSize: 14, fontWeight: 800, color: '#fff' }}>{stats.totalUsers}</span>
                                    </div>
                                </>
                            ) : (
                                <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, textAlign: 'center', padding: 32 }}>Failed to load analytics</div>
                            )}
                        </div>
                    )}

                    {/* ── Account Tab ── */}
                    {tab === 'account' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            {user && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 20, background: 'rgba(255,255,255,0.03)', borderRadius: 20, border: '1px solid rgba(255,255,255,0.07)' }}>
                                    {user.avatar_url
                                        ? <img src={user.avatar_url} width={56} height={56} style={{ borderRadius: '50%', border: '2px solid rgba(255,255,255,0.1)' }} alt="avatar" />
                                        : <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(59,130,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, color: '#60A5FA' }}>{user.login?.[0]?.toUpperCase()}</div>
                                    }
                                    <div>
                                        <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>{user.name || user.login}</div>
                                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <Github size={12} /> {user.login}
                                        </div>
                                        {user.email && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 2 }}>{user.email}</div>}
                                    </div>
                                </div>
                            )}
                            <div style={{ padding: '12px 16px', background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 10 }}>
                                <Shield size={14} style={{ color: '#34D399' }} />
                                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Authenticated via GitHub OAuth</span>
                                <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, color: '#34D399', background: 'rgba(52,211,153,0.1)', padding: '2px 8px', borderRadius: 6 }}>ACTIVE</span>
                            </div>
                            <button
                                onClick={() => { window.location.href = '/auth/logout'; }}
                                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.15)', borderRadius: 12, color: '#F87171', fontSize: 13, fontWeight: 600, cursor: 'pointer', width: '100%' }}
                            >
                                <LogOut size={14} /> Sign out
                            </button>
                        </div>
                    )}

                    {/* ── Visitor Analytics Tab (admin only) ── */}
                    {tab === 'visitors' && isAdmin && <VisitorAnalyticsTab />}

                    {/* ── Visitors Tab (non-admin) — public monitoring only ── */}
                    {tab === 'visitors' && !isAdmin && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div style={{ padding: '20px', background: 'rgba(167,139,250,0.05)', border: '1px solid rgba(167,139,250,0.15)', borderRadius: 16, textAlign: 'center' }}>
                                <MousePointer size={28} style={{ color: '#A78BFA', margin: '0 auto 12px' }} />
                                <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 6 }}>Visitor Analytics</div>
                                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6 }}>
                                    Visitor analytics are available to administrators only.<br />
                                    Upgrade to an admin account to access detailed visitor insights.
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── Plans Tab (non-admin) ── */}
                    {tab === 'plans' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {[
                                { name: 'Free', price: '$0', color: '#60A5FA', features: ['Up to 3 repositories', 'Pipeline monitoring', 'Basic security scans', 'Community support'], current: true },
                                { name: 'Pro', price: '$12/mo', color: '#A78BFA', features: ['Unlimited repositories', 'Advanced DORA metrics', 'Full security suite', 'Datadog integration', 'Priority support'], current: false },
                                { name: 'Team', price: '$39/mo', color: '#34D399', features: ['Everything in Pro', 'Multi-user access', 'Admin controls', 'Visitor analytics', 'SLA guarantee'], current: false },
                            ].map(plan => (
                                <div key={plan.name} style={{
                                    padding: '16px 18px',
                                    background: plan.current ? `${plan.color}10` : 'rgba(255,255,255,0.02)',
                                    border: `1px solid ${plan.current ? `${plan.color}40` : 'rgba(255,255,255,0.07)'}`,
                                    borderRadius: 16,
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span style={{ fontSize: 14, fontWeight: 800, color: plan.color }}>{plan.name}</span>
                                            {plan.current && <span style={{ fontSize: 9, fontWeight: 700, color: plan.color, background: `${plan.color}20`, padding: '2px 7px', borderRadius: 5 }}>CURRENT</span>}
                                        </div>
                                        <span style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>{plan.price}</span>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                        {plan.features.map(f => (
                                            <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
                                                <div style={{ width: 4, height: 4, borderRadius: '50%', background: plan.color, flexShrink: 0 }} />
                                                {f}
                                            </div>
                                        ))}
                                    </div>
                                    {!plan.current && (
                                        <button style={{ marginTop: 12, width: '100%', padding: '9px', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer', background: `${plan.color}15`, border: `1px solid ${plan.color}40`, color: plan.color }}>
                                            Upgrade to {plan.name}
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* ── About Tab ── */}
                    {tab === 'about' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div style={{ padding: 20, background: 'linear-gradient(135deg, rgba(59,130,246,0.08), rgba(124,58,237,0.08))', border: '1px solid rgba(59,130,246,0.15)', borderRadius: 20, textAlign: 'center' }}>
                                <div style={{ fontSize: 32, fontWeight: 900, background: 'linear-gradient(135deg, #3B82F6, #7C3AED)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>PipelineXR</div>
                                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>v2.4.0-pro · DevOps Intelligence Platform</div>
                            </div>
                            {[
                                { label: 'Version', value: 'v2.4.0-pro' },
                                { label: 'Runtime', value: 'Node.js + Express' },
                                { label: 'Database', value: 'SQLite (local)' },
                                { label: 'Frontend', value: 'React + Vite' },
                                { label: 'Security', value: 'Trivy + Gemini AI' },
                                { label: 'Metrics', value: 'Datadog RUM' },
                            ].map(r => (
                                <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(255,255,255,0.02)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.05)' }}>
                                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{r.label}</span>
                                    <span style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>{r.value}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <style>{`
                @keyframes slideInRight {
                    from { transform: translateX(100%); opacity: 0; }
                    to   { transform: translateX(0);    opacity: 1; }
                }
            `}</style>
        </>
    );
};

export default SettingsPanel;
