import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext';
import {
    LayoutDashboard, GitBranch, ShieldCheck,
    BarChart2, FileText, Bell, Search, Settings,
    ChevronRight, LogOut, Command, Activity,
    CheckCircle2, XCircle, AlertTriangle, Shield
} from 'lucide-react';
import SettingsPanel from './SettingsPanel';
import { api } from '../services/api';

const NAV = [
    { label: 'Dashboard', to: '/', icon: LayoutDashboard },
    { label: 'Pipelines', to: '/pipelines', icon: GitBranch },
    { label: 'Security', to: '/security', icon: ShieldCheck },
    { label: 'Metrics', to: '/metrics', icon: BarChart2 },
    { label: 'Monitoring', to: '/monitoring', icon: Activity },
    { label: 'Reports', to: '/reports', icon: FileText },
];

// Generate stable session ID once per tab (outside component to avoid render-time side effects)
const getSessionId = () => {
    let sid = sessionStorage.getItem('pxr_sid');
    if (!sid) {
        sid = Date.now().toString(36) + Math.random().toString(36).slice(2);
        sessionStorage.setItem('pxr_sid', sid);
    }
    return sid;
};

const Layout = ({ children }) => {
    const { pathname } = useLocation();
    const navigate = useNavigate();
    const [searchVal, setSearchVal] = useState('');
    const [searchOpen, setSearchOpen] = useState(false);
    const [searchIdx, setSearchIdx] = useState(0);
    const [repoOpen, setRepoOpen] = useState(false);
    const repoRef = useRef(null);
    const searchRef = useRef(null);
    const { user, repos, selectedRepo, setSelectedRepo, isAdmin, socket } = useAppContext();
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [notifOpen, setNotifOpen] = useState(false);
    const [notifications, setNotifications] = useState([]);
    const [nowTick, setNowTick] = useState(() => Date.now());
    const notifRef = useRef(null);

    // Tick every 30s to refresh "X ago" timestamps
    useEffect(() => {
        const id = setInterval(() => setNowTick(Date.now()), 30000);
        return () => clearInterval(id);
    }, []);

    const addNotif = (notif) => {
        setNotifications(prev => [{ ...notif, id: Date.now(), ts: Date.now() }, ...prev].slice(0, 30));
    };

    // Listen for real-time pipeline events
    useEffect(() => {
        if (!socket) return;

        const handlePipeline = (data) => {
            if (!data.conclusion) return; // only completed runs
            const isSuccess = data.conclusion === 'success';
            addNotif({
                type: isSuccess ? 'success' : 'failure',
                icon: isSuccess ? 'check' : 'x',
                title: isSuccess ? 'Pipeline passed' : 'Pipeline failed',
                body: `${data.workflow_name || 'Workflow'} on ${data.head_branch || 'main'}`,
                repo: data.repository,
                link: '/pipelines',
            });
        };

        const handleSecurity = (data) => {
            if (data?.type === 'SCAN_COMPLETED') {
                addNotif({
                    type: 'security',
                    icon: 'shield',
                    title: 'Security scan completed',
                    body: data.repository || 'Repository scanned',
                    link: '/security',
                });
            }
        };

        socket.on('pipeline_run_update', handlePipeline);
        socket.on('security_update', handleSecurity);
        return () => {
            socket.off('pipeline_run_update', handlePipeline);
            socket.off('security_update', handleSecurity);
        };
    }, [socket]);

    const unreadCount = notifications.length;

    // Close notif dropdown on outside click
    useEffect(() => {
        const handler = (e) => {
            if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Stable session ID for this browser tab
    const sessionId = useRef(getSessionId());

    // Track page views on every route change
    useEffect(() => {
        api.trackPageView(pathname, sessionId.current);
    }, [pathname]);

    // Close repo dropdown on outside click
    useEffect(() => {
        const handler = (e) => {
            if (repoRef.current && !repoRef.current.contains(e.target)) setRepoOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Close search on outside click
    useEffect(() => {
        const handler = (e) => {
            if (searchRef.current && !searchRef.current.contains(e.target)) setSearchOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Cmd/Ctrl+K to focus search
    useEffect(() => {
        const handler = (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                searchRef.current?.querySelector('input')?.focus();
                setSearchOpen(true);
            }
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, []);

    // Build search results from nav pages + repos + recent runs
    const searchResults = useMemo(() => {
        if (!searchVal.trim()) return [];
        const q = searchVal.toLowerCase();
        const pageResults = NAV
            .filter(n => n.label.toLowerCase().includes(q))
            .map(n => ({ type: 'page', label: n.label, sub: n.to, to: n.to, icon: n.icon }));
        const repoResults = repos
            .filter(r => r.name.toLowerCase().includes(q) || r.full_name.toLowerCase().includes(q))
            .map(r => ({ type: 'repo', label: r.name, sub: r.full_name, full_name: r.full_name, icon: GitBranch }));
        return [...pageResults, ...repoResults];
    }, [searchVal, repos]);

    // Reset index when results change
    useEffect(() => {
        const t = setTimeout(() => setSearchIdx(0), 0);
        return () => clearTimeout(t);
    }, [searchResults]);

    const handleSearchKey = (e) => {
        if (!searchOpen || searchResults.length === 0) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); setSearchIdx(i => Math.min(i + 1, searchResults.length - 1)); }
        if (e.key === 'ArrowUp')   { e.preventDefault(); setSearchIdx(i => Math.max(i - 1, 0)); }
        if (e.key === 'Enter') {
            e.preventDefault();
            const item = searchResults[searchIdx];
            if (item) selectSearchResult(item);
        }
        if (e.key === 'Escape') { setSearchOpen(false); setSearchVal(''); }
    };

    const selectSearchResult = (item) => {
        if (item.type === 'page') navigate(item.to);
        if (item.type === 'repo') setSelectedRepo(item.full_name);
        setSearchVal('');
        setSearchOpen(false);
    };

    return (
        <div style={{
            display: 'flex',
            height: '100vh',
            width: '100%',
            overflow: 'hidden',
            background: '#000',
            color: '#fff',
            fontFamily: "'-apple-system', 'BlinkMacSystemFont', 'SF Pro Text', 'SF Pro Display', 'Helvetica Neue', sans-serif"
        }}>

            {/* ── Sidebar ─────────────────────────────────────────────────────── */}
            <aside style={{
                width: 240,
                minWidth: 240,
                display: 'flex',
                flexDirection: 'column',
                background: 'rgba(28, 28, 30, 0.4)',
                backdropFilter: 'blur(40px) saturate(160%)',
                WebkitBackdropFilter: 'blur(40px) saturate(160%)',
                borderRight: '1px solid rgba(255, 255, 255, 0.08)',
                position: 'relative',
                zIndex: 20,
            }}>
                {/* Brand */}
                <div style={{ padding: '24px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                        height: 36, width: 36, borderRadius: 10,
                        background: 'linear-gradient(135deg, #3B82F6 0%, #7C3AED 100%)',
                        boxShadow: '0 0 20px rgba(59,130,246,0.3)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 13, fontWeight: 900, color: '#fff'
                    }}>PX</div>
                    <div>
                        <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em' }}>PipelineXR</div>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: 500 }}>v2.4.0-pro</div>
                    </div>
                </div>

                {/* Nav */}
                <nav style={{ flex: 1, padding: '12px 12px', overflowY: 'auto' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.2)', paddingLeft: 12, marginBottom: 12, letterSpacing: '0.05em' }}>MAIN MENU</div>
                    {NAV.map(({ label, to, icon: NavIcon }) => {
                        const active = pathname === to;
                        return (
                            <Link key={to} to={to} style={{ textDecoration: 'none' }}>
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                                    borderRadius: 12, transition: 'all 0.2s',
                                    background: active ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                                    color: active ? '#fff' : 'rgba(255,255,255,0.4)',
                                    marginBottom: 4
                                }} className="hover:bg-white/5 group">
                                    <NavIcon size={16} style={{ color: active ? '#3B82F6' : 'inherit' }} />
                                    <span style={{ fontSize: 13, fontWeight: active ? 600 : 500 }}>{label}</span>
                                    {active && <ChevronRight size={12} style={{ marginLeft: 'auto', opacity: 0.5 }} />}
                                </div>
                            </Link>
                        );
                    })}
                </nav>

                {/* User Info Segment */}
                <div style={{ padding: '20px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        background: 'rgba(255,255,255,0.03)', padding: '10px',
                        borderRadius: 16, border: '1px solid rgba(255,255,255,0.05)'
                    }}>
                        <div style={{
                            width: 32, height: 32, borderRadius: '50%',
                            background: '#222', overflow: 'hidden',
                            border: '1px solid rgba(255,255,255,0.1)'
                        }}>
                            {user?.avatar_url ? <img src={user.avatar_url} width="32" height="32" alt="Avatar" /> :
                                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>{user?.login?.[0].toUpperCase() || 'U'}</div>}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {user?.name || user?.login || 'Connecting...'}
                            </div>
                            {isAdmin && (
                                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 1 }}>Administrator</div>
                            )}
                        </div>
                        <Settings size={14} className="text-white/20 hover:text-white cursor-pointer" onClick={() => setSettingsOpen(true)} />                    </div>
                </div>
            </aside>

            {/* ── Main Content ────────────────────────────────────────────────── */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

                {/* Header / Top Bar */}
                <header style={{
                    height: 64, borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '0 32px', background: 'rgba(0, 0, 0, 0.2)',
                    backdropFilter: 'blur(20px)',
                    zIndex: 10
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                        {/* Search */}
                        <div ref={searchRef} style={{ position: 'relative', width: 280 }}>
                            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)', zIndex: 1 }} />
                            <input
                                value={searchVal}
                                onChange={e => { setSearchVal(e.target.value); setSearchOpen(true); }}
                                onFocus={() => setSearchOpen(true)}
                                onKeyDown={handleSearchKey}
                                placeholder="Search pages, repos..."
                                style={{
                                    width: '100%', background: 'rgba(255,255,255,0.05)',
                                    border: `1px solid ${searchOpen && searchVal ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.08)'}`,
                                    borderRadius: 12, padding: '8px 48px 8px 36px',
                                    fontSize: 13, color: '#fff', outline: 'none',
                                    transition: 'border-color 0.15s',
                                    boxSizing: 'border-box',
                                }}
                            />
                            {!searchVal && (
                                <div style={{
                                    position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                                    background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)',
                                    fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                                    display: 'flex', alignItems: 'center', gap: 2, pointerEvents: 'none',
                                }}>
                                    <Command size={10} /> K
                                </div>
                            )}
                            {searchVal && (
                                <div
                                    onClick={() => { setSearchVal(''); setSearchOpen(false); }}
                                    style={{
                                        position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                                        color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: 16, lineHeight: 1,
                                    }}
                                >×</div>
                            )}

                            {/* Results dropdown */}
                            {searchOpen && searchVal && (
                                <div style={{
                                    position: 'absolute', top: 'calc(100% + 8px)', left: 0, right: 0,
                                    background: 'rgba(18,18,22,0.97)',
                                    backdropFilter: 'blur(24px)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: 14,
                                    boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
                                    zIndex: 200,
                                    overflow: 'hidden',
                                }}>
                                    {searchResults.length === 0 ? (
                                        <div style={{ padding: '14px 16px', fontSize: 13, color: 'rgba(255,255,255,0.3)', textAlign: 'center' }}>
                                            No results for "{searchVal}"
                                        </div>
                                    ) : (
                                        <>
                                            {/* Group: Pages */}
                                            {searchResults.some(r => r.type === 'page') && (
                                                <div style={{ padding: '8px 12px 4px', fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.06em' }}>PAGES</div>
                                            )}
                                            {searchResults.filter(r => r.type === 'page').map((item) => {
                                                const globalIdx = searchResults.indexOf(item);
                                                const Icon = item.icon;
                                                return (
                                                    <div
                                                        key={item.to}
                                                        onMouseEnter={() => setSearchIdx(globalIdx)}
                                                        onClick={() => selectSearchResult(item)}
                                                        style={{
                                                            display: 'flex', alignItems: 'center', gap: 10,
                                                            padding: '9px 12px', cursor: 'pointer',
                                                            background: globalIdx === searchIdx ? 'rgba(59,130,246,0.15)' : 'transparent',
                                                            color: globalIdx === searchIdx ? '#60A5FA' : 'rgba(255,255,255,0.8)',
                                                            fontSize: 13,
                                                        }}
                                                    >
                                                        <Icon size={14} style={{ opacity: 0.7, flexShrink: 0 }} />
                                                        <span style={{ flex: 1 }}>{item.label}</span>
                                                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>{item.sub}</span>
                                                    </div>
                                                );
                                            })}

                                            {/* Group: Repos */}
                                            {searchResults.some(r => r.type === 'repo') && (
                                                <div style={{ padding: '8px 12px 4px', fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.06em', borderTop: searchResults.some(r => r.type === 'page') ? '1px solid rgba(255,255,255,0.06)' : 'none', marginTop: 4 }}>REPOSITORIES</div>
                                            )}
                                            {searchResults.filter(r => r.type === 'repo').map((item) => {
                                                const globalIdx = searchResults.indexOf(item);
                                                return (
                                                    <div
                                                        key={item.full_name}
                                                        onMouseEnter={() => setSearchIdx(globalIdx)}
                                                        onClick={() => selectSearchResult(item)}
                                                        style={{
                                                            display: 'flex', alignItems: 'center', gap: 10,
                                                            padding: '9px 12px', cursor: 'pointer',
                                                            background: globalIdx === searchIdx ? 'rgba(59,130,246,0.15)' : 'transparent',
                                                            color: globalIdx === searchIdx ? '#60A5FA' : 'rgba(255,255,255,0.8)',
                                                            fontSize: 13,
                                                        }}
                                                    >
                                                        <GitBranch size={14} style={{ opacity: 0.7, flexShrink: 0 }} />
                                                        <span style={{ flex: 1 }}>{item.label}</span>
                                                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>{item.sub}</span>
                                                    </div>
                                                );
                                            })}
                                            <div style={{ padding: '6px 12px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 12, fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>
                                                <span>↑↓ navigate</span><span>↵ select</span><span>esc close</span>
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>

                        <div style={{ height: 20, width: 1, background: 'rgba(255,255,255,0.1)' }} />

                        {/* Repo Selector */}
                        <div ref={repoRef} style={{ position: 'relative' }}>
                            <div
                                onClick={() => setRepoOpen(o => !o)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    cursor: 'pointer', padding: '6px 10px', borderRadius: 10,
                                    background: repoOpen ? 'rgba(255,255,255,0.08)' : 'transparent',
                                    transition: 'background 0.15s',
                                    userSelect: 'none',
                                }}
                            >
                                <GitBranch size={14} style={{ color: 'rgba(255,255,255,0.4)' }} />
                                <span style={{ fontSize: 13, fontWeight: 600, color: '#fff', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {selectedRepo
                                        ? repos.find(r => r.full_name === selectedRepo)?.name || selectedRepo
                                        : 'All Repositories'}
                                </span>
                                <ChevronRight size={14} style={{ color: 'rgba(255,255,255,0.3)', transform: repoOpen ? 'rotate(270deg)' : 'rotate(90deg)', transition: 'transform 0.2s' }} />
                            </div>

                            {repoOpen && (
                                <div style={{
                                    position: 'absolute', top: 'calc(100% + 8px)', left: 0,
                                    minWidth: 220, maxHeight: 280, overflowY: 'auto',
                                    background: 'rgba(18, 18, 22, 0.97)',
                                    backdropFilter: 'blur(24px)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: 14,
                                    boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
                                    zIndex: 100,
                                    padding: '6px',
                                }}>
                                    {[{ id: '__all__', full_name: '', name: 'All Repositories' }, ...repos].map(r => {
                                        const active = r.full_name === selectedRepo;
                                        return (
                                            <div
                                                key={r.id}
                                                onClick={() => { setSelectedRepo(r.full_name); setRepoOpen(false); }}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: 10,
                                                    padding: '9px 12px', borderRadius: 10, cursor: 'pointer',
                                                    background: active ? 'rgba(59,130,246,0.15)' : 'transparent',
                                                    color: active ? '#60A5FA' : 'rgba(255,255,255,0.75)',
                                                    fontSize: 13, fontWeight: active ? 600 : 400,
                                                    transition: 'background 0.15s',
                                                }}
                                                onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
                                                onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                                            >
                                                <GitBranch size={13} style={{ opacity: 0.6, flexShrink: 0 }} />
                                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                                                {active && <div style={{ marginLeft: 'auto', width: 6, height: 6, borderRadius: '50%', background: '#3B82F6', flexShrink: 0 }} />}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        <div style={{
                            background: 'rgba(52, 211, 153, 0.1)', color: '#34D399',
                            fontSize: 10, fontWeight: 700, padding: '4px 8px', borderRadius: 6,
                            display: 'flex', alignItems: 'center', gap: 6
                        }}>
                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#34D399', boxShadow: '0 0 6px #34D399' }} />
                            SYSTEMS OPERATIONAL
                        </div>
                        {/* Notification bell */}
                        <div ref={notifRef} style={{ position: 'relative' }}>
                            <div
                                onClick={() => setNotifOpen(o => !o)}
                                style={{ width: 32, height: 32, borderRadius: 10, background: notifOpen ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', position: 'relative' }}
                                className="hover:bg-white/10"
                            >
                                <Bell size={16} style={{ color: unreadCount > 0 ? '#60A5FA' : 'rgba(255,255,255,0.4)' }} />
                                {unreadCount > 0 && (
                                    <div style={{ position: 'absolute', top: 4, right: 4, minWidth: 8, height: 8, borderRadius: 4, background: '#F87171', border: '1.5px solid #000', fontSize: 8, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 2px', color: '#fff' }}>
                                        {unreadCount > 9 ? '9+' : unreadCount}
                                    </div>
                                )}
                            </div>

                            {notifOpen && (
                                <div style={{ position: 'absolute', top: 'calc(100% + 10px)', right: 0, width: 340, background: 'rgba(14,14,18,0.98)', backdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.7)', zIndex: 200, overflow: 'hidden' }}>
                                    {/* Header */}
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <Bell size={14} style={{ color: '#60A5FA' }} />
                                            <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Notifications</span>
                                            {unreadCount > 0 && (
                                                <span style={{ fontSize: 10, fontWeight: 700, background: 'rgba(96,165,250,0.15)', color: '#60A5FA', padding: '1px 6px', borderRadius: 6 }}>{unreadCount}</span>
                                            )}
                                        </div>
                                        <button onClick={() => setNotifications([])} style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', borderRadius: 6 }}>
                                            Clear all
                                        </button>
                                    </div>

                                    {/* List */}
                                    <div style={{ maxHeight: 360, overflowY: 'auto', scrollbarWidth: 'none' }}>
                                        {notifications.length === 0 ? (
                                            <div style={{ padding: '32px 16px', textAlign: 'center' }}>
                                                <Bell size={28} style={{ color: 'rgba(255,255,255,0.1)', margin: '0 auto 10px', display: 'block' }} />
                                                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>No notifications yet</div>
                                                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.15)', marginTop: 4 }}>Pipeline events will appear here in real-time</div>
                                            </div>
                                        ) : (
                                            notifications.map((n) => {
                                                const iconColor = n.type === 'success' ? '#34D399' : n.type === 'failure' ? '#F87171' : n.type === 'security' ? '#A78BFA' : '#FBBF24';
                                                const IconComp = n.type === 'success' ? CheckCircle2 : n.type === 'failure' ? XCircle : n.type === 'security' ? Shield : AlertTriangle;
                                                const diff = (nowTick - n.ts) / 1000;
                                                const timeAgo = diff < 60 ? `${Math.round(diff)}s ago` : diff < 3600 ? `${Math.round(diff / 60)}m ago` : `${Math.round(diff / 3600)}h ago`;
                                                return (
                                                    <div key={n.id} onClick={() => { navigate(n.link || '/'); setNotifOpen(false); }}
                                                        style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.04)', transition: 'background 0.15s' }}
                                                        className="hover:bg-white/[0.04]"
                                                    >
                                                        <div style={{ width: 30, height: 30, borderRadius: 8, background: `${iconColor}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                                                            <IconComp size={14} style={{ color: iconColor }} />
                                                        </div>
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <div style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>{n.title}</div>
                                                            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.body}</div>
                                                            {n.repo && <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', marginTop: 2 }}>{n.repo}</div>}
                                                        </div>
                                                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', flexShrink: 0, marginTop: 2 }}>{timeAgo}</div>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>

                                    {/* Footer */}
                                    {notifications.length > 0 && (
                                        <div style={{ padding: '10px 16px', borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', justifyContent: 'center' }}>
                                            <button onClick={() => { navigate('/pipelines'); setNotifOpen(false); }} style={{ fontSize: 12, color: '#60A5FA', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                                                View all pipeline runs →
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                        <div
                            onClick={() => {
                                localStorage.removeItem('sf_auth');
                                localStorage.removeItem('pxr_user');
                                localStorage.removeItem('gh_token');
                                fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/auth/logout`, { credentials: 'include' }).catch(() => {});
                                window.location.href = '/';
                            }}
                            style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(248, 113, 113, 0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                            className="hover:bg-rose-500/10 group"
                        >
                            <LogOut size={16} className="text-rose-500/40 group-hover:text-rose-500" />
                        </div>
                    </div>
                </header>

                {/* Content Area */}
                <main style={{ flex: 1, overflowY: 'auto', background: 'radial-gradient(circle at 50% 0%, rgba(59, 130, 246, 0.03) 0%, transparent 50%)' }}>
                    {children}
                </main>
            </div>

            <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
        </div>
    );
};

export default Layout;
