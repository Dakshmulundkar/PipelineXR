import React, { useState, useEffect } from 'react';
import {
    FileText, Download, Search, CheckCircle2,
    XCircle, Clock, RefreshCw, ChevronRight,
    Filter, PieChart, Activity
} from 'lucide-react';
import { api } from '../services/api';
import { useAppContext } from '../contexts/AppContext';

const Reports = () => {
    const { selectedRepo } = useAppContext();
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState('all');
    const [downloading, setDownloading] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const raw = await api.getTestReports();
            // Data is currently global, but we can filter on client for demonstration
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
    };

    const handleDownloadPdf = async () => {
        setDownloading(true);
        try {
            const blob = await api.generateReportPdf();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'pipelinexr-audit-report.pdf';
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Failed to download PDF:', error);
            alert('Failed to generate PDF report.');
        } finally {
            setDownloading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const filtered = data.filter(r => {
        const m = !search || (r.suite_name?.toLowerCase().includes(search.toLowerCase()) || String(r.run_id).includes(search));
        if (filter === 'failed') return m && r.failed > 0;
        if (filter === 'perfect') return m && r.failed === 0;
        return m;
    });

    const tot = data.reduce((a, r) => a + (r.total_tests || 0), 0);
    const pass = data.reduce((a, r) => a + (r.passed || 0), 0);
    const fail = data.reduce((a, r) => a + (r.failed || 0), 0);
    const avgRate = data.length > 0 ? Math.round(data.reduce((a, r) => a + (r.pass_rate || 0), 0) / data.length) : 0;

    return (
        <div style={{ padding: '32px', maxWidth: 1400, margin: '0 auto', animation: 'fadeIn 0.5s ease-out' }}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 32 }}>
                <div>
                    <h1 style={{ fontSize: 32, fontWeight: 800, color: '#fff', letterSpacing: '-0.04em', margin: 0 }}>
                        Audit Reports
                    </h1>
                    <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
                        System-wide test archives and compliance scoring
                    </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button onClick={load}
                        style={{
                            background: 'rgba(255,255,255,0.04)',
                            border: '1px solid rgba(255,255,255,0.08)',
                            color: 'rgba(255,255,255,0.6)',
                            padding: '10px 16px',
                            borderRadius: 12,
                            fontSize: 13,
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            cursor: 'pointer'
                        }}
                    >
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                        Refresh
                    </button>
                    <button
                        onClick={handleDownloadPdf}
                        disabled={downloading}
                        style={{
                            background: 'rgba(255,255,255,0.05)',
                            color: '#fff',
                            padding: '10px 16px',
                            borderRadius: 12,
                            fontSize: 13,
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            border: '1px solid rgba(255,255,255,0.1)',
                            cursor: downloading ? 'not-allowed' : 'pointer',
                            opacity: downloading ? 0.7 : 1
                        }}
                    >
                        {downloading ? <RefreshCw size={16} className="animate-spin" /> : <Download size={16} />}
                        {downloading ? 'Generating...' : 'Export PDF'}
                    </button>
                </div>
            </div>

            {/* Aggregated Stats Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20, marginBottom: 32 }}>
                {[
                    { label: 'Total Assertions', val: tot, icon: FileText, color: '#fff' },
                    { label: 'Green Pass', val: pass, icon: CheckCircle2, color: '#34D399' },
                    { label: 'Failures', val: fail, icon: XCircle, color: '#F87171' },
                    { label: 'Quality Index', val: `${avgRate}%`, icon: PieChart, color: avgRate >= 90 ? '#34D399' : '#FBBF24' },
                ].map((s, i) => (
                    <div key={s.label} style={{
                        background: 'rgba(28, 28, 30, 0.4)',
                        backdropFilter: 'blur(10px)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: 20,
                        padding: '20px',
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

            {/* Filter & Search Bar */}
            <div style={{
                background: 'rgba(255,255,255,0.02)',
                borderRadius: 20,
                padding: '16px 24px',
                marginBottom: 24,
                border: '1px solid rgba(255,255,255,0.05)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 20, flex: 1 }}>
                    <div style={{ position: 'relative', width: 300 }}>
                        <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)' }} />
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Find suite or run ID..."
                            style={{
                                width: '100%', background: 'rgba(255,255,255,0.03)',
                                border: '1px solid rgba(255,255,255,0.08)',
                                borderRadius: 12, padding: '8px 12px 8px 36px',
                                fontSize: 13, color: '#fff', outline: 'none'
                            }}
                        />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Filter size={14} style={{ color: 'rgba(255,255,255,0.2)' }} />
                        {[
                            { key: 'all', label: 'All Reports' },
                            { key: 'failed', label: 'Failures' },
                            { key: 'perfect', label: 'Perfect' }
                        ].map(f => (
                            <button key={f.key} onClick={() => setFilter(f.key)}
                                style={{
                                    padding: '6px 14px',
                                    borderRadius: 10,
                                    fontSize: 12,
                                    fontWeight: 600,
                                    transition: 'all 0.2s',
                                    border: 'none',
                                    cursor: 'pointer',
                                    background: filter === f.key ? 'rgba(255,255,255,0.08)' : 'transparent',
                                    color: filter === f.key ? '#fff' : 'rgba(255,255,255,0.3)',
                                }}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>
                </div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)', fontWeight: 500 }}>
                    Showing {filtered.length} matching archives
                </div>
            </div>

            {/* Results Table */}
            <div style={{
                background: 'rgba(28, 28, 30, 0.4)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: 24,
                overflow: 'hidden'
            }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.02)' }}>
                            <th style={{ padding: '16px 24px', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Audit ID</th>
                            <th style={{ padding: '16px 24px', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Suite Name</th>
                            <th style={{ padding: '16px 24px', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Assertions</th>
                            <th style={{ padding: '16px 24px', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</th>
                            <th style={{ padding: '16px 24px', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Integrity</th>
                            <th style={{ padding: '16px 24px', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Timestamp</th>
                            <th style={{ padding: '16px 24px', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            Array.from({ length: 6 }).map((_, i) => (
                                <tr key={i}><td colSpan="7" style={{ padding: '20px 24px' }}><div className="skeleton rounded-lg h-6 w-full" /></td></tr>
                            ))
                        ) : filtered.length === 0 ? (
                            <tr><td colSpan="7" style={{ padding: '60px', textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontSize: 14 }}>No audit records found</td></tr>
                        ) : (
                            filtered.map((r, i) => (
                                <tr key={r.run_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', transition: 'all 0.2s' }} className="hover:bg-white/[0.02] group">
                                    <td style={{ padding: '16px 24px', fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }}>#{r.run_id}</td>
                                    <td style={{ padding: '16px 24px', fontSize: 14, fontWeight: 700, color: '#fff' }}>{r.suite_name}</td>
                                    <td style={{ padding: '16px 24px', fontSize: 13, color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>{r.total_tests} tests</td>
                                    <td style={{ padding: '16px 24px' }}>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            <div style={{ padding: '2px 8px', borderRadius: 6, background: 'rgba(52, 211, 153, 0.1)', color: '#34D399', fontSize: 10, fontWeight: 800 }}>{r.passed}✓</div>
                                            {r.failed > 0 && <div style={{ padding: '2px 8px', borderRadius: 6, background: 'rgba(248, 113, 113, 0.1)', color: '#F87171', fontSize: 10, fontWeight: 800 }}>{r.failed}✗</div>}
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
                                        <button style={{
                                            background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.2)',
                                            padding: 8, cursor: 'pointer'
                                        }} className="group-hover:text-white group-hover:translate-x-1 transition-all">
                                            <ChevronRight size={16} />
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default Reports;
