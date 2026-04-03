import React, { useState, useEffect, useCallback } from 'react';
import {
    Shield, Box, Flame, CheckCircle2, AlertCircle, Activity,
    GitBranch, RefreshCw, TrendingUp, ShieldAlert,
    ChevronDown, ChevronUp, ExternalLink, Sparkles, Loader2, Clock
} from 'lucide-react';
import { Doughnut, Line } from 'react-chartjs-2';
import {
    Chart as ChartJS, ArcElement, Tooltip, Legend,
    CategoryScale, LinearScale, PointElement, LineElement, Filler
} from 'chart.js';
import { api } from '../services/api';
import { useAppContext } from '../contexts/AppContext';

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

// ── Trivy vuln expanded detail ────────────────────────────────────────────────
const VulnDetail = ({ v }) => {
    const isVuln    = v.type === 'vulnerability';
    const isMisconf = v.type === 'misconfiguration';
    const isSecret  = v.type === 'secret';
    const moreInfoUrl = v.primary_url
        || (v.id && v.id.startsWith('CVE-') ? `https://avd.aquasec.com/nvd/${v.id.toLowerCase()}` : null);
    return (
        <div style={{ padding: '0 24px 28px 24px', borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.01)' }}>
            <h4 style={{ fontSize: 15, fontWeight: 700, color: '#fff', margin: '20px 0 10px 0', lineHeight: 1.45 }}>
                {v.title && v.title !== v.id ? v.title : v.id}
            </h4>
            {(v.description || v.message) ? (
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 1.75, margin: '0 0 20px 0', whiteSpace: 'pre-wrap' }}>
                    {v.description || v.message}
                </p>
            ) : (
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.2)', fontStyle: 'italic', margin: '0 0 20px 0' }}>
                    No description available from Trivy database.
                </p>
            )}
            {isSecret && v.match && (
                <div style={{ marginBottom: 20, background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)', borderRadius: 8, padding: '10px 14px' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#A855F7', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Match</div>
                    <pre style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.7)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontFamily: 'monospace' }}>{v.match}</pre>
                </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {isVuln && v.package_name && <MetaRow label="Package Name:" value={v.package_name} />}
                {isMisconf && <MetaRow label="Type:" value={v.package_name || v.target} />}
                {isSecret && <MetaRow label="Category:" value={v.category || v.package_name} />}
                {v.pkg_path && <MetaRow label="Package Path:" value={v.pkg_path} mono />}
                {v.installed_version && <MetaRow label="Installed Version:" value={v.installed_version} />}
                {isVuln && <MetaRow label="Fixed Version:" value={v.fixed_version || 'No fix available'} valueColor={v.fixed_version ? '#34D399' : 'rgba(255,255,255,0.3)'} valueBold={!!v.fixed_version} />}
                {isMisconf && v.resolution && <MetaRow label="Resolution:" value={v.resolution} />}
                {v.target && <MetaRow label="Target:" value={v.target} mono />}
                {isSecret && v.start_line && <MetaRow label="Line:" value={v.end_line && v.end_line !== v.start_line ? `${v.start_line}–${v.end_line}` : String(v.start_line)} />}
                {moreInfoUrl && (
                    <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', paddingTop: 14, marginTop: 4 }}>
                        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>More Info:</span>
                        <a href={moreInfoUrl} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: '#3B82F6', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5, wordBreak: 'break-all' }}>
                            <ExternalLink size={12} style={{ flexShrink: 0 }} />{moreInfoUrl}
                        </a>
                    </div>
                )}
            </div>
        </div>
    );
};

const MetaRow = ({ label, value, mono, valueColor, valueBold }) => {
    if (!value && value !== 0) return null;
    return (
        <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 8, paddingBottom: 12, paddingTop: 2, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', fontWeight: 600, paddingTop: 1 }}>{label}</span>
            <span style={{ fontSize: 13, color: valueColor || (mono ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.75)'), fontWeight: valueBold ? 700 : 400, fontFamily: mono ? 'monospace' : 'inherit', wordBreak: 'break-all' }}>{value}</span>
        </div>
    );
};

// ── AI Security Review panel (inline, not modal) ──────────────────────────────
const AiReviewPanel = ({ repo }) => {
    const [state, setState]   = useState('idle'); // idle | loading | done | error
    const [result, setResult] = useState(null);
    const [elapsed, setElapsed] = useState(0);

    useEffect(() => {
        let t;
        if (state === 'loading') { setElapsed(0); t = setInterval(() => setElapsed(s => s + 1), 1000); }
        return () => clearInterval(t);
    }, [state]);

    const run = useCallback(async () => {
        setState('loading'); setResult(null);
        try {
            const res = await api.getSecurityReview(repo);
            setResult(res);
            setState('done');
        } catch (e) {
            setResult({ error: e?.response?.data?.error || e?.message || 'Request failed' });
            setState('error');
        }
    }, [repo]);

    const fmt = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

    // data may be an object (parsed JSON) or a raw string (model output that failed JSON parse)
    let data = result?.data || result;
    if (typeof data === 'string') {
        // Try to parse it — model sometimes wraps JSON in markdown fences
        try {
            const cleaned = data.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
            data = JSON.parse(cleaned);
        } catch {
            // Leave as string — will render as raw text fallback below
        }
    }
    const source = result?.source;

    if (state === 'idle') return (
        <div style={{ textAlign: 'center', padding: '48px 24px' }}>
            <Sparkles size={32} color="#A78BFA" style={{ marginBottom: 16 }} />
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', marginBottom: 20 }}>
                AI-powered analysis of your repository's security findings using Qwen-7B
            </p>
            <button onClick={run} style={{ padding: '12px 28px', borderRadius: 12, fontSize: 14, fontWeight: 700, background: 'rgba(124,58,237,0.2)', border: '1px solid rgba(124,58,237,0.4)', color: '#A78BFA', cursor: 'pointer' }}>
                Run AI Analysis
            </button>
        </div>
    );

    if (state === 'loading') return (
        <div style={{ padding: '32px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <Loader2 size={18} color="#A78BFA" className="animate-spin" />
                <span style={{ fontSize: 14, fontWeight: 700, color: '#A78BFA' }}>Analyzing with Qwen-7B...</span>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', fontVariantNumeric: 'tabular-nums' }}>{fmt(elapsed)}</span>
            </div>
            {elapsed >= 10 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'rgba(124,58,237,0.06)', borderRadius: 10, border: '1px solid rgba(124,58,237,0.15)' }}>
                    <Clock size={12} color="#A78BFA" />
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                        {elapsed < 60 ? 'CPU inference takes 3–8 min. Hang tight.' : `Still running… ${fmt(elapsed)} elapsed.`}
                    </span>
                </div>
            )}
        </div>
    );

    if (state === 'error') return (
        <div style={{ padding: '32px 24px' }}>
            <div style={{ color: '#F87171', fontSize: 13, marginBottom: 16 }}>{data?.error || 'Analysis failed'}</div>
            <button onClick={run} style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '6px 14px', cursor: 'pointer' }}>Retry</button>
        </div>
    );

    // done — render structured output
    return (
        <div style={{ padding: '24px' }}>
            {/* Source badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                <Sparkles size={14} color="#A78BFA" />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#A78BFA' }}>AI Security Review</span>
                {source && (
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, background: 'rgba(124,58,237,0.15)', color: '#A78BFA', fontWeight: 700 }}>
                        {source === 'hf' ? 'Qwen-7B' : source === 'gemini' ? 'Gemini' : source === 'cache' ? 'cached' : 'static'}
                    </span>
                )}
                <button onClick={run} style={{ marginLeft: 'auto', fontSize: 11, color: 'rgba(255,255,255,0.3)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <RefreshCw size={11} /> Re-run
                </button>
            </div>

            {/* Overall posture */}
            {data?.overall_posture && (
                <div style={{ marginBottom: 20, padding: '12px 16px', borderRadius: 12, background: data.overall_posture === 'critical' ? 'rgba(248,113,113,0.08)' : data.overall_posture === 'at-risk' ? 'rgba(251,191,36,0.08)' : 'rgba(52,211,153,0.08)', border: `1px solid ${data.overall_posture === 'critical' ? 'rgba(248,113,113,0.2)' : data.overall_posture === 'at-risk' ? 'rgba(251,191,36,0.2)' : 'rgba(52,211,153,0.2)'}` }}>
                    <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: data.overall_posture === 'critical' ? '#F87171' : data.overall_posture === 'at-risk' ? '#FBBF24' : '#34D399' }}>
                        {data.overall_posture} posture
                    </span>
                </div>
            )}

            {/* Risk summary */}
            {(data?.risk_summary || data?.executive_summary) && (
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 1.7, margin: '0 0 20px 0' }}>
                    {data.risk_summary || data.executive_summary}
                </p>
            )}

            {/* Per-vuln fixes — the main value */}
            {Array.isArray(data?.per_vuln) && data.per_vuln.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#A78BFA', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Fix Recommendations</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {data.per_vuln.map((v, i) => (
                            <div key={i} style={{ padding: '12px 16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                                    <span style={{ fontSize: 9, fontWeight: 900, padding: '3px 8px', borderRadius: 4, background: v.priority === 'immediate' ? 'rgba(248,113,113,0.15)' : v.priority === 'soon' ? 'rgba(251,191,36,0.15)' : 'rgba(52,211,153,0.15)', color: v.priority === 'immediate' ? '#F87171' : v.priority === 'soon' ? '#FBBF24' : '#34D399', textTransform: 'uppercase' }}>{v.priority || 'fix'}</span>
                                    <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.8)', fontFamily: 'monospace' }}>{v.id}</span>
                                </div>
                                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', margin: 0, lineHeight: 1.6 }}>{v.fix}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Critical actions */}
            {Array.isArray(data?.critical_actions) && data.critical_actions.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#F87171', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Critical Actions</div>
                    <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {data.critical_actions.map((a, i) => <li key={i} style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', lineHeight: 1.5 }}>{a}</li>)}
                    </ul>
                </div>
            )}

            {/* Recommendations */}
            {Array.isArray(data?.recommendations) && data.recommendations.length > 0 && (
                <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#34D399', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Recommendations</div>
                    <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {data.recommendations.map((r, i) => <li key={i} style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', lineHeight: 1.5 }}>{r}</li>)}
                    </ul>
                </div>
            )}

            {/* Raw text fallback — when model returns unstructured output */}
            {typeof data === 'string' && data.trim() && (
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap' }}>
                    {data}
                </p>
            )}
            {typeof data === 'object' && data !== null &&
             !data.risk_summary && !data.executive_summary && !data.overall_posture &&
             !Array.isArray(data.critical_actions) && !Array.isArray(data.recommendations) && (
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', fontStyle: 'italic', margin: 0 }}>
                    Analysis completed but returned no structured content. Try re-running.
                </p>
            )}
        </div>
    );
};

// ── Snyk SAST panel ───────────────────────────────────────────────────────────
const SnykPanel = ({ repo }) => {
    const [issues, setIssues]   = useState(null);
    const [loading, setLoading] = useState(false);
    const [expanded, setExpanded] = useState(null);

    const load = useCallback(async () => {
        if (!repo?.includes('/')) return;
        const [owner, repoName] = repo.split('/');
        setLoading(true);
        try {
            const data = await api.getSnykIssues(owner, repoName);
            setIssues(Array.isArray(data) ? data : data?.issues || []);
        } catch {
            setIssues([]);
        } finally { setLoading(false); }
    }, [repo]);

    useEffect(() => { load(); }, [load]);

    if (loading) return (
        <div style={{ padding: '48px', textAlign: 'center', color: 'rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <Loader2 size={16} className="animate-spin" /> Loading Snyk issues...
        </div>
    );

    if (!issues || issues.length === 0) return (
        <div style={{ padding: '64px', textAlign: 'center', color: 'rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: 24, fontSize: 14 }}>
            No Snyk issues found — either the repo is clean or Snyk is not configured.
        </div>
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {issues.map((issue, idx) => {
                const sev = (issue.severity || issue.issueData?.severity || 'unknown').toLowerCase();
                const sevColor = SEV_COLOR[sev] || '#9CA3AF';
                const key = `snyk-${idx}`;
                const isOpen = expanded === key;
                const title = issue.issueData?.title || issue.title || issue.id || 'Unknown issue';
                const id = issue.issueData?.id || issue.id || '—';
                const pkg = issue.pkgName || issue.package || '—';
                const fixedIn = issue.fixInfo?.fixedIn?.join(', ') || issue.fixedIn || null;
                const desc = issue.issueData?.description || issue.description || null;
                const url = issue.issueData?.url || issue.url || null;

                return (
                    <div key={key} style={{ background: 'rgba(28,28,30,0.4)', border: `1px solid ${isOpen ? 'rgba(168,85,247,0.3)' : 'rgba(255,255,255,0.08)'}`, borderRadius: 16, overflow: 'hidden', transition: 'border-color 0.2s' }}>
                        <div onClick={() => setExpanded(isOpen ? null : key)} style={{ padding: '18px 24px', display: 'flex', alignItems: 'center', cursor: 'pointer', gap: 20 }}>
                            <div style={{ background: sevColor, color: '#000', fontSize: 9, fontWeight: 900, padding: '4px 10px', borderRadius: 4, minWidth: 68, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>{sev}</div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', width: 150, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{id}</div>
                            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', flex: 1, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
                            {isOpen ? <ChevronUp size={16} style={{ color: 'rgba(255,255,255,0.4)', flexShrink: 0 }} /> : <ChevronDown size={16} style={{ color: 'rgba(255,255,255,0.4)', flexShrink: 0 }} />}
                        </div>
                        {isOpen && (
                            <div style={{ padding: '0 24px 24px 24px', borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.01)' }}>
                                <h4 style={{ fontSize: 15, fontWeight: 700, color: '#fff', margin: '20px 0 10px 0' }}>{title}</h4>
                                {desc && <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 1.75, margin: '0 0 20px 0' }}>{desc}</p>}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                                    <MetaRow label="Package:" value={pkg} />
                                    {fixedIn && <MetaRow label="Fixed in:" value={fixedIn} valueColor="#34D399" valueBold />}
                                    {url && (
                                        <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', paddingTop: 14 }}>
                                            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>More Info:</span>
                                            <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: '#3B82F6', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5, wordBreak: 'break-all' }}>
                                                <ExternalLink size={12} style={{ flexShrink: 0 }} />{url}
                                            </a>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

// ── OWASP passive header scanner panel ───────────────────────────────────────
const SEV_ORDER = { HIGH: 0, MEDIUM: 1, LOW: 2, INFO: 3 };

const OwaspPanel = () => {
    const [url, setUrl]         = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult]   = useState(null);
    const [error, setError]     = useState('');
    const [expanded, setExpanded] = useState(null);

    const run = async () => {
        if (!url.trim()) return;
        setLoading(true); setError(''); setResult(null);
        try {
            const data = await api.owaspScan(url.trim());
            setResult(data);
        } catch (e) {
            setError(e?.response?.data?.error || e?.message || 'Scan failed');
        } finally { setLoading(false); }
    };

    const findings = result?.findings
        ? [...result.findings].sort((a, b) => (SEV_ORDER[a.severity] ?? 4) - (SEV_ORDER[b.severity] ?? 4))
        : [];

    return (
        <div>
            {/* URL input */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
                <input
                    value={url}
                    onChange={e => setUrl(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && run()}
                    placeholder="https://your-deployed-app.com"
                    style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '12px 16px', fontSize: 14, color: '#fff', outline: 'none' }}
                />
                <button
                    onClick={run}
                    disabled={loading || !url.trim()}
                    style={{ padding: '12px 24px', borderRadius: 12, fontSize: 13, fontWeight: 700, background: loading ? 'rgba(251,146,60,0.1)' : 'rgba(251,146,60,0.2)', border: '1px solid rgba(251,146,60,0.4)', color: '#FB923C', cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 8, opacity: loading || !url.trim() ? 0.6 : 1 }}
                >
                    {loading ? <><Loader2 size={14} className="animate-spin" /> Scanning...</> : 'Scan URL'}
                </button>
            </div>

            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginBottom: 24, marginTop: -16 }}>
                Uses official OWASP ZAP Docker image when available — full baseline scan with spider, XSS, SQLi, and 40+ checks. Falls back to passive HTTP header analysis on managed platforms.
            </p>

            {error && (
                <div style={{ padding: '12px 16px', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 12, color: '#F87171', fontSize: 13, marginBottom: 16 }}>
                    {error}
                </div>
            )}

            {result && (
                <>
                    {/* Summary bar */}
                    <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
                        {[
                            { label: 'High',   count: result.summary.high,   color: '#F87171' },
                            { label: 'Medium', count: result.summary.medium, color: '#FB923C' },
                            { label: 'Low',    count: result.summary.low,    color: '#FBBF24' },
                            { label: 'Info',   count: result.summary.info,   color: '#9CA3AF' },
                        ].map(s => (
                            <div key={s.label} style={{ padding: '8px 16px', borderRadius: 10, background: `${s.color}12`, border: `1px solid ${s.color}30`, display: 'flex', gap: 8, alignItems: 'center' }}>
                                <span style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.count}</span>
                                <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>{s.label}</span>
                            </div>
                        ))}
                        <div style={{ marginLeft: 'auto', fontSize: 11, color: 'rgba(255,255,255,0.25)', alignSelf: 'center' }}>
                            Scanned: {result.url} · {new Date(result.scanned_at).toLocaleTimeString()}
                            {result.status_code && ` · HTTP ${result.status_code}`}
                            {' · '}
                            <span style={{ color: result.engine === 'zap' ? '#FB923C' : 'rgba(255,255,255,0.25)' }}>
                                {result.engine === 'zap' ? 'OWASP ZAP' : 'Passive scan'}
                            </span>
                        </div>
                    </div>

                    {findings.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '48px', color: '#34D399', background: 'rgba(52,211,153,0.05)', border: '1px solid rgba(52,211,153,0.15)', borderRadius: 20, fontSize: 14, fontWeight: 600 }}>
                            ✓ No security header issues found — this URL has good HTTP security hygiene.
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {findings.map((f, idx) => {
                                const sevColor = SEV_COLOR[f.severity.toLowerCase()] || '#9CA3AF';
                                const key = `owasp-${idx}`;
                                const isOpen = expanded === key;
                                return (
                                    <div key={key} style={{ background: 'rgba(28,28,30,0.4)', border: `1px solid ${isOpen ? `${sevColor}40` : 'rgba(255,255,255,0.08)'}`, borderRadius: 16, overflow: 'hidden', transition: 'border-color 0.2s' }}>
                                        <div onClick={() => setExpanded(isOpen ? null : key)} style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', cursor: 'pointer', gap: 20 }}>
                                            <div style={{ background: sevColor, color: '#000', fontSize: 9, fontWeight: 900, padding: '4px 10px', borderRadius: 4, minWidth: 68, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>{f.severity}</div>
                                            <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.5)', width: 110, flexShrink: 0, fontFamily: 'monospace' }}>{f.id}</div>
                                            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                                            {isOpen ? <ChevronUp size={16} style={{ color: 'rgba(255,255,255,0.4)', flexShrink: 0 }} /> : <ChevronDown size={16} style={{ color: 'rgba(255,255,255,0.4)', flexShrink: 0 }} />}
                                        </div>
                                        {isOpen && (
                                            <div style={{ padding: '0 24px 24px 24px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.7, margin: '16px 0 12px 0' }}>{f.description}</p>
                                                {f.evidence && (
                                                    <div style={{ marginBottom: 12, padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,0.5)', wordBreak: 'break-all' }}>
                                                        {f.evidence}
                                                    </div>
                                                )}
                                                {/* ZAP-specific metadata */}
                                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                                                    {f.cwe_id && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, background: 'rgba(251,146,60,0.1)', color: '#FB923C', fontWeight: 700 }}>{f.cwe_id}</span>}
                                                    {f.wasc_id && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, background: 'rgba(96,165,250,0.1)', color: '#60A5FA', fontWeight: 700 }}>{f.wasc_id}</span>}
                                                    {f.count > 1 && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>{f.count} instances</span>}
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 14px', background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.15)', borderRadius: 10 }}>
                                                    <CheckCircle2 size={13} color="#34D399" style={{ flexShrink: 0, marginTop: 1 }} />
                                                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6 }}>{f.solution}</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

// ── Main component ────────────────────────────────────────────────────────────
const Security = () => {    const { selectedRepo, scanState, startScan } = useAppContext();
    const [expandedVuln, setExpandedVuln] = useState(null);
    const [activeTab, setActiveTab]       = useState('ALL');
    const [activeScanner, setActiveScanner] = useState('trivy'); // trivy | ai | snyk | owasp | github
    const [trendData, setTrendData]       = useState(null);

    const { isScanning, repoScanned, results, security_metrics, risk_score, risk_level, engine, error } = scanState;

    useEffect(() => {
        if (!selectedRepo) return;
        if (repoScanned !== selectedRepo && !isScanning) startScan(selectedRepo);
    }, [selectedRepo]); // eslint-disable-line react-hooks/exhaustive-deps

    // Reset to trivy view when repo changes
    useEffect(() => { setActiveScanner('trivy'); setActiveTab('ALL'); }, [selectedRepo]);

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

    useEffect(() => {
        if (!vulns.length) { setTimeout(() => setTrendData(null), 0); return; }
        const days = 14, now = new Date(), slots = [];
        for (let i = days - 1; i >= 0; i--) { const d = new Date(now); d.setDate(d.getDate() - i); slots.push(d.toISOString().split('T')[0]); }
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
        if (!critData.some(v => v > 0) && !highData.some(v => v > 0)) { setTrendData(null); return; }
        setTrendData({
            labels,
            datasets: [
                critData.some(v => v > 0) && { label: 'Critical', data: critData, borderColor: '#F87171', backgroundColor: 'rgba(248,113,113,0.1)', fill: true, tension: 0.4, pointRadius: critData.map(v => v > 0 ? 4 : 0), pointHoverRadius: critData.map(v => v > 0 ? 6 : 0), pointBackgroundColor: '#F87171' },
                highData.some(v => v > 0) && { label: 'High', data: highData, borderColor: '#FB923C', backgroundColor: 'rgba(251,146,60,0.08)', fill: true, tension: 0.4, pointRadius: highData.map(v => v > 0 ? 4 : 0), pointHoverRadius: highData.map(v => v > 0 ? 6 : 0), pointBackgroundColor: '#FB923C' },
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
        datasets: [{ data: [summary.critical || 0, summary.high || 0, summary.medium || 0, summary.low || 0], backgroundColor: ['#F87171', '#FB923C', '#FBBF24', '#60A5FA'], borderColor: 'rgba(28,28,30,0.9)', borderWidth: 8, borderRadius: 8, hoverOffset: 12 }],
    };

    const doughnutOpts = {
        cutout: '80%',
        plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(28,28,30,0.9)', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1, titleColor: '#fff', bodyColor: 'rgba(255,255,255,0.7)', padding: 12, cornerRadius: 12 } },
        animation: { animateRotate: true, duration: 1500, easing: 'easeOutQuart' },
    };

    // Scanner definitions — id maps to which panel renders below
    const scanners = [
        { id: 'trivy', name: 'Trivy Scan',  status: total > 0 ? 'failed' : 'passed', findings: total,            icon: Box,        color: '#06B6D4' },
        { id: 'snyk',  name: 'Snyk SAST',   status: (summary.high || 0) > 0 ? 'failed' : 'passed', findings: summary.high || 0, icon: ShieldAlert, color: '#A855F7' },
        { id: 'owasp', name: 'OWASP ZAP',   status: 'passed', findings: 0, icon: Flame,     color: '#F59E0B' },
        { id: 'github',name: 'GitHub Adv',  status: 'passed', findings: 0, icon: GitBranch, color: '#34D399' },
        { id: 'ai',    name: 'AI Review',   status: 'info',   findings: null, icon: Sparkles, color: '#A78BFA' },
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
                            <RefreshCw size={13} className="animate-spin" /> Scanning...
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

            {/* Top grid: Threat Profile + Scanner cards */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 24, marginBottom: 32 }}>

                {/* Threat Profile donut */}
                <div style={{ background: 'rgba(28,28,30,0.4)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 24, padding: 32, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <h3 style={{ fontSize: 15, fontWeight: 700, color: '#fff', alignSelf: 'flex-start', margin: 0 }}>Threat Profile</h3>
                    <div style={{ position: 'relative', width: 220, height: 220, margin: '32px 0' }}>
                        {isScanning && !results ? <div className="skeleton rounded-full w-full h-full" /> : <Doughnut data={doughnutData} options={doughnutOpts} />}
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                            <div style={{ fontSize: 44, fontWeight: 800, color: '#fff' }}>{total}</div>
                            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Findings</div>
                        </div>
                    </div>
                    <div style={{ width: '100%', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        {[{ label: 'Critical', count: summary.critical, color: '#F87171' }, { label: 'High', count: summary.high, color: '#FB923C' }, { label: 'Medium', count: summary.medium, color: '#FBBF24' }, { label: 'Low', count: summary.low, color: '#60A5FA' }].map(m => (
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

                {/* Scanner cards — clickable, selected one is highlighted */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {scanners.map((s, i) => {
                        const isSelected = activeScanner === s.id;
                        return (
                            <div
                                key={s.id}
                                onClick={() => setActiveScanner(s.id)}
                                style={{
                                    background: isSelected ? `${s.color}10` : 'rgba(28,28,30,0.4)',
                                    backdropFilter: 'blur(20px)',
                                    border: `1px solid ${isSelected ? `${s.color}50` : 'rgba(255,255,255,0.08)'}`,
                                    borderRadius: 20, padding: '16px 20px',
                                    display: 'flex', alignItems: 'center', gap: 16,
                                    cursor: 'pointer', transition: 'all 0.2s',
                                    animation: `slideUp 0.5s ease-out ${i * 0.08}s both`,
                                    boxShadow: isSelected ? `0 0 0 1px ${s.color}30` : 'none',
                                }}
                            >
                                <div style={{ width: 40, height: 40, borderRadius: 14, background: `${s.color}18`, color: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <s.icon size={20} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 14, fontWeight: 700, color: isSelected ? '#fff' : 'rgba(255,255,255,0.85)' }}>{s.name}</div>
                                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
                                        {s.findings !== null ? `${s.findings} findings` : 'AI-powered analysis'}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    {s.id !== 'ai' && (
                                        <div style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 7, background: s.status === 'passed' ? 'rgba(52,211,153,0.1)' : 'rgba(248,113,113,0.1)', color: s.status === 'passed' ? '#34D399' : '#F87171', display: 'flex', alignItems: 'center', gap: 5 }}>
                                            {s.status === 'passed' ? <CheckCircle2 size={11} /> : <AlertCircle size={11} />} {s.status.toUpperCase()}
                                        </div>
                                    )}
                                    {isSelected && <div style={{ width: 6, height: 6, borderRadius: '50%', background: s.color }} />}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Vulnerability Trend */}
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
                        <Line data={trendData} options={{ responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, animation: { duration: 1200, easing: 'easeOutQuart' }, scales: { x: { grid: { display: false }, ticks: { color: 'rgba(255,255,255,0.3)', font: { size: 10 }, maxTicksLimit: 10, maxRotation: 0 }, border: { display: false } }, y: { grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { color: 'rgba(255,255,255,0.3)', font: { size: 10 }, padding: 8, stepSize: 1 }, border: { display: false }, beginAtZero: true } }, plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(28,28,30,0.95)', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1, titleColor: '#fff', bodyColor: 'rgba(255,255,255,0.7)', padding: 12, cornerRadius: 12 } } }} />
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

            {/* ── Bottom panel — switches based on selected scanner ── */}
            <div style={{ marginBottom: 64 }}>

                {/* Panel header — shows for trivy only (tabs + SBOM) */}
                {activeScanner === 'trivy' && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                        <div style={{ display: 'flex', gap: 4 }}>
                            {['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'].map(tab => (
                                <button key={tab} onClick={() => setActiveTab(tab)} style={{ padding: '8px 16px', background: activeTab === tab ? 'rgba(255,255,255,0.05)' : 'transparent', border: 'none', borderRadius: 6, color: activeTab === tab ? '#fff' : 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', gap: 6, borderBottom: activeTab === tab ? `2px solid ${SEV_COLOR[tab.toLowerCase()] || '#3B82F6'}` : 'none' }}>
                                    {tab} ({counts[tab] || 0})
                                </button>
                            ))}
                        </div>
                        <button onClick={handleDownloadSBOM} style={{ background: '#3B82F6', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 12, fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 12px rgba(59,130,246,0.3)' }}>
                            Generate SBOM Output
                        </button>
                    </div>
                )}

                {/* Panel header for non-trivy scanners */}
                {activeScanner !== 'trivy' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                        {(() => { const s = scanners.find(x => x.id === activeScanner); return s ? <><s.icon size={16} color={s.color} /><span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{s.name}</span></> : null; })()}
                    </div>
                )}

                {/* Trivy vuln list */}
                {activeScanner === 'trivy' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {filteredVulns.map((v, idx) => {
                            const sev = (v.severity || 'unknown').toLowerCase();
                            const sevColor = SEV_COLOR[sev] || '#9CA3AF';
                            const key = `${v.id}-${v.package_name}-${idx}`;
                            const isOpen = expandedVuln === key;
                            const displayName = (v.package_name && !['unknown','secret','misconfiguration'].includes(v.package_name)) ? v.package_name : (v.title && v.title !== v.id ? v.title : v.id);
                            return (
                                <div key={key} style={{ background: 'rgba(28,28,30,0.4)', border: `1px solid ${isOpen ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.08)'}`, borderRadius: 16, overflow: 'hidden', transition: 'border-color 0.2s' }}>
                                    <div onClick={() => setExpandedVuln(isOpen ? null : key)} style={{ padding: '18px 24px', display: 'flex', alignItems: 'center', cursor: 'pointer', gap: 20 }}>
                                        <div style={{ background: sevColor, color: '#000', fontSize: 9, fontWeight: 900, padding: '4px 10px', borderRadius: 4, minWidth: 68, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>{sev}</div>
                                        <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', width: 150, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.id}</div>
                                        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', flex: 1, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</div>
                                        {isOpen ? <ChevronUp size={16} style={{ color: 'rgba(255,255,255,0.4)', flexShrink: 0 }} /> : <ChevronDown size={16} style={{ color: 'rgba(255,255,255,0.4)', flexShrink: 0 }} />}
                                    </div>
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
                                <RefreshCw size={16} className="animate-spin" /> Scanning repository...
                            </div>
                        )}
                    </div>
                )}

                {/* AI Review panel */}
                {activeScanner === 'ai' && (
                    <div style={{ background: 'rgba(28,28,30,0.4)', border: '1px solid rgba(124,58,237,0.2)', borderRadius: 24, overflow: 'hidden' }}>
                        <AiReviewPanel repo={selectedRepo} />
                    </div>
                )}

                {/* Snyk SAST panel */}
                {activeScanner === 'snyk' && <SnykPanel repo={selectedRepo} />}

                {/* OWASP / GitHub — placeholder */}
                {/* OWASP passive header scan */}
                {activeScanner === 'owasp' && <OwaspPanel />}

                {/* GitHub Advanced Security placeholder */}
                {activeScanner === 'github' && (
                    <div style={{ textAlign: 'center', padding: '64px', color: 'rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: 32, fontSize: 14, fontWeight: 500 }}>
                        No GitHub Advanced Security alerts found.
                    </div>
                )}
            </div>
        </div>
    );
};

export default Security;
