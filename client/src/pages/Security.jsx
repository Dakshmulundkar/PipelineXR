import React, { useState, useEffect } from 'react';
import {
    Shield, Box, Flame, CheckCircle2, AlertCircle, Activity,
    GitBranch, RefreshCw, TrendingUp, ShieldAlert, Zap,
    ChevronDown, ChevronUp, ExternalLink
} from 'lucide-react';
import { Doughnut, Line } from 'react-chartjs-2';
import {
    Chart as ChartJS, ArcElement, Tooltip, Legend,
    CategoryScale, LinearScale, PointElement, LineElement, Filler
} from 'chart.js';
import { api } from '../services/api';
import { useAppContext } from '../contexts/AppContext';
import AiInsightPanel from '../components/AiInsightPanel';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement, Filler);

const PIPELINE_STEPS = [
    { name: 'Source',    sublabel: 'GitHub Event',  color: '#3B82F6' },
    { name: 'Inspect',   sublabel: 'Snyk Analysis', color: '#A855F7' },
    { name: 'Container', sublabel: 'Trivy Shield',  color: '#06B6D4' },
    { name: 'Dynamic',   sublabel: 'OWASP ZAP',     color: '#F59E0B' },
    { name: 'Release',   sublabel: 'PROD Push',     color: '#34D399' },
];

const SEV_COLOR = {
    critical: '#F87171',
    high:     '#FB923C',
    medium:   '#FBBF24',
    low:      '#60A5FA',
    unknown:  '#9CA3AF',
};

// ── Expanded vulnerability detail — exact Trivy Docker extension format ───────
const VulnDetail = ({ v }) => {
    const isVuln    = v.type === 'vulnerability';
    const isMisconf = v.type === 'misconfiguration';
    const isSecret  = v.type === 'secret';

    // Determine the "More Info" URL
    const moreInfoUrl = v.primary_url
        || (v.id && v.id.startsWith('CVE-') ? `https://avd.aquasec.com/nvd/${v.id.toLowerCase()}` : null);

    return (
        <div style={{
            padding: '0 24px 28px 24px',
            borderTop: '1px solid rgba(255,255,255,0.05)',
            background: 'rgba(255,255,255,0.01)',
        }}>
            {/* Title — e.g. "openssl: OpenSSL: Remote code execution..." */}
            <h4 style={{
                fontSize: 15,
                fontWeight: 700,
                color: '#fff',
                margin: '20px 0 10px 0',
                lineHeight: 1.45,
            }}>
                {v.title && v.title !== v.id ? v.title : v.id}
            </h4>

            {/* Full description paragraph */}
            {(v.description || v.message) ? (
                <p style={{
                    fontSize: 13,
                    color: 'rgba(255,255,255,0.55)',
                    lineHeight: 1.75,
                    margin: '0 0 20px 0',
                    whiteSpace: 'pre-wrap',
                }}>
                    {v.description || v.message}
                </p>
            ) : (
                <p style={{
                    fontSize: 13,
                    color: 'rgba(255,255,255,0.2)',
                    fontStyle: 'italic',
                    margin: '0 0 20px 0',
                }}>
                    No description available from Trivy database.
                </p>
            )}

            {/* Secret match block */}
            {isSecret && v.match && (
                <div style={{
                    marginBottom: 20,
                    background: 'rgba(168,85,247,0.08)',
                    border: '1px solid rgba(168,85,247,0.2)',
                    borderRadius: 8,
                    padding: '10px 14px',
                }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#A855F7', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Match</div>
                    <pre style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.7)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontFamily: 'monospace' }}>{v.match}</pre>
                </div>
            )}

            {/* Metadata rows — exact Trivy extension layout */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

                {/* Package Name */}
                {isVuln && v.package_name && (
                    <MetaRow label="Package Name:" value={v.package_name} />
                )}
                {isMisconf && (
                    <MetaRow label="Type:" value={v.package_name || v.target} />
                )}
                {isSecret && (
                    <MetaRow label="Category:" value={v.category || v.package_name} />
                )}

                {/* Package Path (if present) */}
                {v.pkg_path && <MetaRow label="Package Path:" value={v.pkg_path} mono />}

                {/* Installed Version */}
                {v.installed_version && (
                    <MetaRow label="Installed Version:" value={v.installed_version} />
                )}

                {/* Fixed Version */}
                {isVuln && (
                    <MetaRow
                        label="Fixed Version:"
                        value={v.fixed_version || 'No fix available'}
                        valueColor={v.fixed_version ? '#34D399' : 'rgba(255,255,255,0.3)'}
                        valueBold={!!v.fixed_version}
                    />
                )}
                {isMisconf && v.resolution && (
                    <MetaRow label="Resolution:" value={v.resolution} />
                )}

                {/* Target file */}
                {v.target && <MetaRow label="Target:" value={v.target} mono />}

                {/* Secret file + line */}
                {isSecret && v.start_line && (
                    <MetaRow
                        label="Line:"
                        value={v.end_line && v.end_line !== v.start_line
                            ? `${v.start_line}–${v.end_line}`
                            : String(v.start_line)}
                    />
                )}

                {/* More Info — always last */}
                {moreInfoUrl && (
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: '160px 1fr',
                        paddingTop: 14,
                        marginTop: 4,
                    }}>
                        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>More Info:</span>
                        <a
                            href={moreInfoUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={{ fontSize: 13, color: '#3B82F6', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5, wordBreak: 'break-all' }}
                        >
                            <ExternalLink size={12} style={{ flexShrink: 0 }} />
                            {moreInfoUrl}
                        </a>
                    </div>
                )}
            </div>
        </div>
    );
};

// ── Single metadata row ───────────────────────────────────────────────────────
const MetaRow = ({ label, value, mono, valueColor, valueBold }) => {
    if (!value && value !== 0) return null;
    return (
        <div style={{
            display: 'grid',
            gridTemplateColumns: '160px 1fr',
            gap: 8,
            paddingBottom: 12,
            paddingTop: 2,
            borderBottom: '1px solid rgba(255,255,255,0.04)',
        }}>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', fontWeight: 600, paddingTop: 1 }}>
                {label}
            </span>
            <span style={{
                fontSize: 13,
                color: valueColor || (mono ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.75)'),
                fontWeight: valueBold ? 700 : 400,
                fontFamily: mono ? 'monospace' : 'inherit',
                wordBreak: 'break-all',
            }}>
                {value}
            </span>
        </div>
    );
};

// ── Main component ────────────────────────────────────────────────────────────
const Security = () => {
    const { selectedRepo, scanState, startScan } = useAppContext();
    const [expandedVuln, setExpandedVuln] = useState(null);
    const [activeTab, setActiveTab] = useState('ALL');
    const [trendData, setTrendData] = useState(null);

    const { isScanning, repoScanned, results, security_metrics, risk_score, risk_level, engine, error } = scanState;

    useEffect(() => {
        if (!selectedRepo) return;
        if (repoScanned !== selectedRepo && !isScanning) startScan(selectedRepo);
    }, [selectedRepo]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleRefresh = () => startScan(selectedRepo);

    const handleDownloadSBOM = async () => {
        if (!selectedRepo?.includes('/')) return;
        const [owner, repo] = selectedRepo.split('/');
        try {
            const res = await api.getSBOM(owner, repo);
            const url = window.URL.createObjectURL(new Blob([JSON.stringify(res, null, 2)]));
            const a = document.createElement('a');
            a.href = url; a.download = `sbom-${repo}.json`;
            document.body.appendChild(a); a.click(); a.remove();
        } catch (e) { console.error('SBOM failed', e); }
    };

    const vulns = results || [];
    const summary = security_metrics || {
        critical: vulns.filter(v => v.severity?.toLowerCase() === 'critical').length,
        high:     vulns.filter(v => v.severity?.toLowerCase() === 'high').length,
        medium:   vulns.filter(v => v.severity?.toLowerCase() === 'medium').length,
        low:      vulns.filter(v => v.severity?.toLowerCase() === 'low').length,
    };
    const total = (summary.critical || 0) + (summary.high || 0) + (summary.medium || 0) + (summary.low || 0);

    // Build a severity breakdown trend from vulns that have a timestamp
    useEffect(() => {
        if (!vulns.length) {
            setTimeout(() => setTrendData(null), 0);
            return;
        }
        // Group by day (last 14 days)
        const days = 14;
        const now = new Date();
        const slots = [];
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            slots.push(d.toISOString().split('T')[0]);
        }
        const byCritDay = {}, byHighDay = {};
        for (const v of vulns) {
            const day = (v.timestamp || v.created_at || '').split('T')[0];
            if (!day || !slots.includes(day)) continue;
            const sev = (v.severity || '').toLowerCase();
            if (sev === 'critical') byCritDay[day] = (byCritDay[day] || 0) + 1;
            if (sev === 'high')     byHighDay[day] = (byHighDay[day] || 0) + 1;
        }
        const labels = slots.map(s => new Date(s + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
        const critData = slots.map(s => byCritDay[s] || 0);
        const highData = slots.map(s => byHighDay[s] || 0);
        const hasCrit = critData.some(v => v > 0);
        const hasHigh = highData.some(v => v > 0);
        if (!hasCrit && !hasHigh) { setTrendData(null); return; }
        setTrendData({
            labels,
            datasets: [
                hasCrit && {
                    label: 'Critical',
                    data: critData,
                    borderColor: '#F87171',
                    backgroundColor: 'rgba(248,113,113,0.1)',
                    fill: true, tension: 0.4,
                    pointRadius: critData.map(v => v > 0 ? 4 : 0),
                    pointHoverRadius: critData.map(v => v > 0 ? 6 : 0),
                    pointBackgroundColor: '#F87171',
                },
                hasHigh && {
                    label: 'High',
                    data: highData,
                    borderColor: '#FB923C',
                    backgroundColor: 'rgba(251,146,60,0.08)',
                    fill: true, tension: 0.4,
                    pointRadius: highData.map(v => v > 0 ? 4 : 0),
                    pointHoverRadius: highData.map(v => v > 0 ? 6 : 0),
                    pointBackgroundColor: '#FB923C',
                },
            ].filter(Boolean),
        });
    }, [results]); // eslint-disable-line react-hooks/exhaustive-deps

    const counts = {
        ALL:      vulns.length,
        CRITICAL: vulns.filter(v => v.severity?.toLowerCase() === 'critical').length,
        HIGH:     vulns.filter(v => v.severity?.toLowerCase() === 'high').length,
        MEDIUM:   vulns.filter(v => v.severity?.toLowerCase() === 'medium').length,
        LOW:      vulns.filter(v => v.severity?.toLowerCase() === 'low').length,
        UNKNOWN:  vulns.filter(v => !['critical','high','medium','low'].includes(v.severity?.toLowerCase())).length,
    };

    const doughnutData = {
        labels: ['Critical', 'High', 'Medium', 'Low'],
        datasets: [{
            data: [summary.critical || 0, summary.high || 0, summary.medium || 0, summary.low || 0],
            backgroundColor: ['#F87171', '#FB923C', '#FBBF24', '#60A5FA'],
            borderColor: 'rgba(28,28,30,0.9)', borderWidth: 8, borderRadius: 8, hoverOffset: 12,
        }],
    };

    const doughnutOpts = {
        cutout: '80%',
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: 'rgba(28,28,30,0.9)', borderColor: 'rgba(255,255,255,0.1)',
                borderWidth: 1, titleColor: '#fff', bodyColor: 'rgba(255,255,255,0.7)',
                padding: 12, cornerRadius: 12,
            },
        },
        animation: { animateRotate: true, duration: 1500, easing: 'easeOutQuart' },
    };

    const scanners = [
        { name: 'Trivy Scan',  status: total > 0 ? 'failed' : 'passed', findings: total,            icon: Box,        color: '#06B6D4' },
        { name: 'Snyk SAST',   status: (summary.high || 0) > 0 ? 'failed' : 'passed', findings: summary.high || 0, icon: ShieldAlert, color: '#A855F7' },
        { name: 'OWASP ZAP',   status: 'passed', findings: 0, icon: Flame,     color: '#F59E0B' },
        { name: 'GitHub Adv',  status: 'passed', findings: 0, icon: GitBranch, color: '#34D399' },
    ];

    const filteredVulns = vulns.filter(v => {
        if (activeTab === 'ALL') return true;
        if (activeTab === 'UNKNOWN') return !['CRITICAL','HIGH','MEDIUM','LOW'].includes(v.severity?.toUpperCase());
        return v.severity?.toUpperCase() === activeTab;
    });

    return (
        <div style={{ padding: '32px', maxWidth: 1400, margin: '0 auto', animation: 'fadeIn 0.5s ease-out' }}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 32 }}>
                <div>
                    <h1 style={{ fontSize: 32, fontWeight: 800, color: '#fff', letterSpacing: '-0.04em', margin: 0 }}>Security Center</h1>
                    <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
                        Real-time threat detection for {selectedRepo || 'all repositories'}
                        {engine && <span style={{ marginLeft: 8, color: 'rgba(255,255,255,0.2)', fontSize: 12 }}>· {engine}</span>}
                    </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {isScanning && (
                        <div style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', color: '#3B82F6', fontSize: 12, fontWeight: 600, padding: '8px 14px', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <RefreshCw size={13} className="animate-spin" /> Scanning in background...
                        </div>
                    )}
                    <button onClick={handleRefresh} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)', padding: '10px 16px', borderRadius: 12, fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                        <RefreshCw size={14} className={isScanning ? 'animate-spin' : ''} /> Re-scan
                    </button>
                    <div style={{ background: risk_level === 'Risky' ? 'rgba(248,113,113,0.1)' : risk_level === 'Suspect' ? 'rgba(251,191,36,0.1)' : 'rgba(52,211,153,0.1)', color: risk_level === 'Risky' ? '#F87171' : risk_level === 'Suspect' ? '#FBBF24' : '#34D399', fontSize: 11, fontWeight: 700, padding: '10px 16px', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 8, border: `1px solid ${risk_level === 'Risky' ? 'rgba(248,113,113,0.2)' : risk_level === 'Suspect' ? 'rgba(251,191,36,0.2)' : 'rgba(52,211,153,0.2)'}` }}>
                        <Shield size={14} /> {risk_level ? `${risk_level.toUpperCase()} · ${Math.round(risk_score || 0)}` : 'GATES CLEAR'}
                    </div>
                </div>
            </div>

            {error && (
                <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 12, padding: '12px 20px', marginBottom: 24, color: '#F87171', fontSize: 13, fontWeight: 600 }}>
                    Scan error: {error}
                </div>
            )}

            {/* Top grid: Threat Profile + Scanners */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 24, marginBottom: 32 }}>

                {/* Threat Profile donut */}
                <div style={{ background: 'rgba(28,28,30,0.4)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 24, padding: 32, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <h3 style={{ fontSize: 15, fontWeight: 700, color: '#fff', alignSelf: 'flex-start', margin: 0 }}>Threat Profile</h3>
                    <div style={{ position: 'relative', width: 220, height: 220, margin: '32px 0' }}>
                        {isScanning && !results
                            ? <div className="skeleton rounded-full w-full h-full" />
                            : <Doughnut data={doughnutData} options={doughnutOpts} />
                        }
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                            <div style={{ fontSize: 44, fontWeight: 800, color: '#fff' }}>{total}</div>
                            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Findings</div>
                        </div>
                    </div>
                    <div style={{ width: '100%', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        {[
                            { label: 'Critical', count: summary.critical, color: '#F87171' },
                            { label: 'High',     count: summary.high,     color: '#FB923C' },
                            { label: 'Medium',   count: summary.medium,   color: '#FBBF24' },
                            { label: 'Low',      count: summary.low,      color: '#60A5FA' },
                        ].map(m => (
                            <div key={m.label} style={{ background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: 16, border: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: m.color }} />
                                    <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)' }}>{m.label}</span>
                                </div>
                                <span style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>{m.count ?? 0}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Scanner cards + AI */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {scanners.map((s, i) => (
                        <div key={s.name} style={{ background: 'rgba(28,28,30,0.4)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 24, padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 20, animation: `slideUp 0.5s ease-out ${i * 0.1}s both` }} className="hover:border-white/20 transition-all">
                            <div style={{ width: 48, height: 48, borderRadius: 16, background: `${s.color}15`, color: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><s.icon size={22} /></div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{s.name}</div>
                                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{s.findings} vulnerabilities detected</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 8, background: s.status === 'passed' ? 'rgba(52,211,153,0.1)' : 'rgba(248,113,113,0.1)', color: s.status === 'passed' ? '#34D399' : '#F87171', display: 'flex', alignItems: 'center', gap: 6 }}>
                                    {s.status === 'passed' ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />} {s.status.toUpperCase()}
                                </div>
                                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', marginTop: 6, fontWeight: 600 }}>{isScanning ? 'Scanning...' : 'Just now'}</div>
                            </div>
                        </div>
                    ))}
                    <div style={{ flex: 1, background: 'linear-gradient(135deg, rgba(59,130,246,0.1) 0%, rgba(124,58,237,0.1) 100%)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 24, padding: 24 }}>
                        <AiInsightPanel
                            title="AI Security Review"
                            onFetch={() => api.getSecurityReview(selectedRepo)}
                        />
                    </div>
                </div>
            </div>

            {/* Vulnerability Trend — only shown when we have timestamped data */}
            {trendData && (
                <div style={{ background: 'rgba(28,28,30,0.4)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 24, padding: 28, marginBottom: 32 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                        <TrendingUp size={16} style={{ color: '#F87171' }} />
                        <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>Vulnerability Trend</span>
                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>Last 14 days</span>
                        <div style={{ marginLeft: 'auto', display: 'flex', gap: 16 }}>
                            {trendData.datasets.map(ds => (
                                <div key={ds.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: ds.borderColor }} />
                                    {ds.label}
                                </div>
                            ))}
                        </div>
                    </div>
                    <div style={{ height: 180 }}>
                        <Line data={trendData} options={{
                            responsive: true, maintainAspectRatio: false,
                            interaction: { mode: 'index', intersect: false },
                            animation: { duration: 1200, easing: 'easeOutQuart' },
                            scales: {
                                x: { grid: { display: false }, ticks: { color: 'rgba(255,255,255,0.3)', font: { size: 10 }, maxTicksLimit: 10, maxRotation: 0 }, border: { display: false } },
                                y: { grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { color: 'rgba(255,255,255,0.3)', font: { size: 10 }, padding: 8, stepSize: 1 }, border: { display: false }, beginAtZero: true },
                            },
                            plugins: {
                                legend: { display: false },
                                tooltip: { backgroundColor: 'rgba(28,28,30,0.95)', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1, titleColor: '#fff', bodyColor: 'rgba(255,255,255,0.7)', padding: 12, cornerRadius: 12 },
                            },
                        }} />
                    </div>
                </div>
            )}

            {/* Pipeline Steps */}
            <div style={{ background: 'rgba(28,28,30,0.4)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 28, padding: '32px', marginBottom: 32 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
                    <Activity size={18} className="text-blue-400" />
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>Automated Security Rails</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    {PIPELINE_STEPS.map((step, i) => (
                        <React.Fragment key={step.name}>
                            <div style={{ flex: 1, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 16, padding: '16px', textAlign: 'center', transition: 'all 0.3s' }} className="hover:bg-white/5">
                                <div style={{ fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{step.name}</div>
                                <div style={{ fontSize: 13, fontWeight: 700, color: step.color, marginTop: 4 }}>{step.sublabel}</div>
                            </div>
                            {i < PIPELINE_STEPS.length - 1 && (
                                <div style={{ padding: '0 12px', color: 'rgba(255,255,255,0.1)' }}>
                                    <TrendingUp size={16} style={{ transform: 'rotate(90deg)' }} />
                                </div>
                            )}
                        </React.Fragment>
                    ))}
                </div>
            </div>

            {/* Vulnerability List */}
            <div style={{ marginBottom: 64 }}>
                {/* Tabs + SBOM button */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                        {['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'].map(tab => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                style={{
                                    padding: '8px 16px',
                                    background: activeTab === tab ? 'rgba(255,255,255,0.05)' : 'transparent',
                                    border: 'none',
                                    borderRadius: 6,
                                    color: activeTab === tab ? '#fff' : 'rgba(255,255,255,0.4)',
                                    fontSize: 12,
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    gap: 6,
                                    borderBottom: activeTab === tab ? `2px solid ${SEV_COLOR[tab.toLowerCase()] || '#3B82F6'}` : 'none',
                                }}
                            >
                                {tab} ({counts[tab] || 0})
                            </button>
                        ))}
                    </div>
                    <button
                        onClick={handleDownloadSBOM}
                        style={{ background: '#3B82F6', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 12, fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 12px rgba(59,130,246,0.3)' }}
                    >
                        Generate SBOM Output
                    </button>
                </div>

                {/* Vuln rows */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {filteredVulns.map((v, idx) => {
                        const sev      = (v.severity || 'unknown').toLowerCase();
                        const sevColor = SEV_COLOR[sev] || '#9CA3AF';
                        const key      = `${v.id}-${v.package_name}-${idx}`;
                        const isOpen   = expandedVuln === key;

                        // Third column: package name, or title if it differs from id, or id
                        const displayName = (v.package_name && !['unknown','secret','misconfiguration'].includes(v.package_name))
                            ? v.package_name
                            : (v.title && v.title !== v.id ? v.title : v.id);

                        return (
                            <div
                                key={key}
                                style={{ background: 'rgba(28,28,30,0.4)', border: `1px solid ${isOpen ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.08)'}`, borderRadius: 16, overflow: 'hidden', transition: 'border-color 0.2s' }}
                            >
                                {/* Collapsed row */}
                                <div
                                    onClick={() => setExpandedVuln(isOpen ? null : key)}
                                    style={{ padding: '18px 24px', display: 'flex', alignItems: 'center', cursor: 'pointer', gap: 20 }}
                                >
                                    {/* Severity badge */}
                                    <div style={{ background: sevColor, color: '#000', fontSize: 9, fontWeight: 900, padding: '4px 10px', borderRadius: 4, minWidth: 68, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>
                                        {sev}
                                    </div>
                                    {/* CVE / Rule ID */}
                                    <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', width: 150, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {v.id}
                                    </div>
                                    {/* Package / title */}
                                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', flex: 1, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {displayName}
                                    </div>
                                    {isOpen
                                        ? <ChevronUp   size={16} style={{ color: 'rgba(255,255,255,0.4)', flexShrink: 0 }} />
                                        : <ChevronDown size={16} style={{ color: 'rgba(255,255,255,0.4)', flexShrink: 0 }} />
                                    }
                                </div>

                                {/* Expanded detail */}
                                {isOpen && <VulnDetail v={v} />}
                            </div>
                        );
                    })}

                    {filteredVulns.length === 0 && !isScanning && (
                        <div style={{ textAlign: 'center', padding: '64px', color: 'rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: 32, fontSize: 14, fontWeight: 500 }}>
                            {repoScanned === selectedRepo ? 'No security findings for this repository.' : 'Select a repository to start scanning.'}
                        </div>
                    )}

                    {isScanning && filteredVulns.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '64px', color: 'rgba(59,130,246,0.6)', background: 'rgba(59,130,246,0.03)', border: '1px dashed rgba(59,130,246,0.2)', borderRadius: 32, fontSize: 14, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                            <RefreshCw size={16} className="animate-spin" /> Scanning repository... you can navigate away and come back.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Security;
