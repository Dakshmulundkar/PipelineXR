import { useState, useEffect, useRef } from 'react';
import { Sparkles, Loader2, ChevronDown, ChevronUp, AlertTriangle, CheckCircle2, Zap, X, FileCode, Wrench, MapPin, Clock } from 'lucide-react';

const GRADE_COLOR   = { Elite: '#34D399', High: '#60A5FA', Medium: '#FBBF24', Low: '#F87171' };
const POSTURE_COLOR = { secure: '#34D399', 'at-risk': '#FBBF24', critical: '#F87171' };

// ── Known error patterns → human-readable diagnosis ──────────────────────────
const ERROR_DIAGNOSES = [
    {
        match: /models\/gemini.*not found|gemini.*404/i,
        title: 'Gemini model deprecated',
        file: 'services/ai/llm.js  +  server/index.js',
        location: 'llm.js line ~60 · server/index.js line ~180',
        cause: 'The model ID "gemini-1.5-flash" was retired by Google. The API now returns 404.',
        fix: 'Change model to "gemini-2.0-flash-lite" in both files.',
        code: `// services/ai/llm.js
_gemini = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-lite' });

// server/index.js
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-lite' });`,
    },
    {
        match: /API_KEY_INVALID|api.?key.*invalid|invalid.*api.?key/i,
        title: 'Invalid Gemini API key',
        file: '.env / Railway environment variables',
        location: 'GEMINI_API_KEY env var',
        cause: 'The GEMINI_API_KEY value is missing, expired, or malformed.',
        fix: 'Generate a new key at aistudio.google.com → API Keys and update the env var.',
        code: `# .env
GEMINI_API_KEY=AIza...your_new_key_here`,
    },
    {
        match: /HF.*not configured|HF_SPACE_URL/i,
        title: 'Hugging Face Space not configured',
        file: '.env / Railway environment variables',
        location: 'HUGGINGFACE_LLM_URL env var',
        cause: 'No HF Space URL is set so the primary LLM engine is skipped.',
        fix: 'Deploy PipelineXR-LLM to HF Spaces and set the URL.',
        code: `# Railway env vars
HUGGINGFACE_LLM_URL=https://yourname-pipelinexr-llm.hf.space
HUGGINGFACE_API_SECRET=your_secret`,
    },
    {
        match: /fetch.*failed|ECONNREFUSED|ENOTFOUND|network/i,
        title: 'Network / connection error',
        file: 'services/ai/llm.js',
        location: 'hfPost() fetch call',
        cause: 'The HF Space URL is unreachable — Space may be sleeping or URL is wrong.',
        fix: 'Wake the Space by visiting its URL, or check HUGGINGFACE_LLM_URL is correct.',
        code: `# Verify the URL is reachable:
curl https://yourname-pipelinexr-llm.hf.space/health`,
    },
    {
        match: /abort|timeout/i,
        title: 'Request timed out',
        file: 'services/ai/llm.js',
        location: 'hfPost() — AbortController timer',
        cause: `Request exceeded HF_TIMEOUT_MS (default 600s / 10 min). Space may be cold-starting with the 4.4GB model.`,
        fix: 'Wait a few minutes for the Space to warm up, then retry. The keepalive pinger should prevent this after first load.',
        code: `# If you need longer timeout:
HF_TIMEOUT_MS=720000   # 12 minutes`,
    },
];

function diagnose(errorMsg) {
    return ERROR_DIAGNOSES.find(d => d.match.test(errorMsg)) || null;
}

// ── Error detail modal ────────────────────────────────────────────────────────
const ErrorModal = ({ error, onClose }) => {
    const diag = diagnose(error);
    return (
        <div
            onClick={onClose}
            style={{
                position: 'fixed', inset: 0, zIndex: 1000,
                background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 24,
            }}
        >
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    background: 'rgba(18,18,22,0.98)',
                    border: '1px solid rgba(248,113,113,0.3)',
                    borderRadius: 20, padding: 28, maxWidth: 620, width: '100%',
                    boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
                    maxHeight: '85vh', overflowY: 'auto',
                }}
            >
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                    <AlertTriangle size={18} color="#F87171" />
                    <span style={{ fontSize: 15, fontWeight: 800, color: '#fff', flex: 1 }}>
                        {diag ? diag.title : 'AI Request Failed'}
                    </span>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', padding: 4 }}>
                        <X size={18} />
                    </button>
                </div>

                {/* Raw error */}
                <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Error Message</div>
                    <div style={{ fontSize: 12, color: '#F87171', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 10, padding: '10px 14px', fontFamily: 'monospace', lineHeight: 1.6, wordBreak: 'break-word' }}>
                        {error}
                    </div>
                </div>

                {diag ? (
                    <>
                        {/* File + location */}
                        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
                            <InfoChip icon={FileCode} label="File" value={diag.file} color="#60A5FA" />
                            <InfoChip icon={MapPin}   label="Location" value={diag.location} color="#A78BFA" />
                        </div>

                        {/* Cause */}
                        <div style={{ marginBottom: 20 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Root Cause</div>
                            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', margin: 0, lineHeight: 1.6 }}>{diag.cause}</p>
                        </div>

                        {/* Fix */}
                        <div style={{ marginBottom: 20 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                                <Wrench size={13} color="#34D399" />
                                <span style={{ fontSize: 11, fontWeight: 700, color: '#34D399', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Fix</span>
                            </div>
                            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', margin: '0 0 12px', lineHeight: 1.6 }}>{diag.fix}</p>
                            <pre style={{
                                fontSize: 11, color: '#34D399',
                                background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.15)',
                                borderRadius: 10, padding: '12px 14px', margin: 0,
                                overflowX: 'auto', lineHeight: 1.7, fontFamily: 'monospace',
                                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                            }}>
                                {diag.code}
                            </pre>
                        </div>
                    </>
                ) : (
                    <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', margin: 0 }}>
                        No automatic diagnosis available. Check Railway logs for more detail.
                    </p>
                )}

                <button
                    onClick={onClose}
                    style={{
                        marginTop: 8, width: '100%', padding: '10px', borderRadius: 12,
                        background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                        color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    }}
                >
                    Dismiss
                </button>
            </div>
        </div>
    );
};

const InfoChip = ({ icon: Icon, label, value, color }) => (
    <div style={{ flex: 1, minWidth: 200, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '8px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
            <Icon size={11} color={color} />
            <span style={{ fontSize: 10, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', fontFamily: 'monospace', wordBreak: 'break-word' }}>{value}</div>
    </div>
);

// ── Simple markdown renderer ──────────────────────────────────────────────────
// Handles: ### headers, **bold**, * bullet lists, --- dividers, blank lines
function renderMarkdown(text) {
    if (!text) return null;
    const lines = text.split('\n');
    const elements = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];

        // Skip empty lines
        if (!line.trim()) { i++; continue; }

        // Horizontal rule
        if (/^---+$/.test(line.trim())) {
            elements.push(<hr key={i} style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.08)', margin: '8px 0' }} />);
            i++; continue;
        }

        // ### Header
        if (line.startsWith('### ')) {
            elements.push(
                <div key={i} style={{ fontSize: 11, fontWeight: 700, color: '#A78BFA', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 10, marginBottom: 4 }}>
                    {line.replace(/^###\s*/, '')}
                </div>
            );
            i++; continue;
        }

        // ## Header
        if (line.startsWith('## ')) {
            elements.push(
                <div key={i} style={{ fontSize: 12, fontWeight: 700, color: '#fff', marginTop: 10, marginBottom: 4 }}>
                    {line.replace(/^##\s*/, '')}
                </div>
            );
            i++; continue;
        }

        // Bullet: * or - at start
        if (/^\s*[*-]\s/.test(line)) {
            const bulletLines = [];
            while (i < lines.length && /^\s*[*-]\s/.test(lines[i])) {
                bulletLines.push(lines[i].replace(/^\s*[*-]\s*/, ''));
                i++;
            }
            elements.push(
                <ul key={`ul-${i}`} style={{ margin: '4px 0', paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {bulletLines.map((b, bi) => (
                        <li key={bi} style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>
                            {renderInline(b)}
                        </li>
                    ))}
                </ul>
            );
            continue;
        }

        // Regular paragraph
        elements.push(
            <p key={i} style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', lineHeight: 1.6, margin: '2px 0' }}>
                {renderInline(line)}
            </p>
        );
        i++;
    }
    return elements;
}

// Render inline **bold** and *italic*
function renderInline(text) {
    const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
    return parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={i} style={{ color: '#fff', fontWeight: 700 }}>{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith('*') && part.endsWith('*')) {
            return <em key={i} style={{ color: 'rgba(255,255,255,0.85)' }}>{part.slice(1, -1)}</em>;
        }
        return part;
    });
}

// ── Main panel ────────────────────────────────────────────────────────────────
const AiInsightPanel = ({ title = 'AI Analysis', onFetch, children }) => {
    const [state, setState]       = useState('idle');
    const [result, setResult]     = useState(null);
    const [error, setError]       = useState('');
    const [expanded, setExpanded] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [elapsed, setElapsed]   = useState(0);
    const timerRef = useRef(null);

    // Tick elapsed seconds while loading
    useEffect(() => {
        if (state === 'loading') {
            setElapsed(0);
            timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
        } else {
            clearInterval(timerRef.current);
        }
        return () => clearInterval(timerRef.current);
    }, [state]);

    const handleFetch = async () => {
        setState('loading');
        setError('');
        try {
            const res = await onFetch();
            setResult(res);
            setState('done');
        } catch (e) {
            const msg = e?.response?.data?.error || e?.message || 'Request failed';
            setError(msg);
            setState('error');
        }
    };

    const data    = result?.data || result;
    const source  = result?.source;
    const latency = result?.latency_ms;

    // Format elapsed time as mm:ss
    const fmtElapsed = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

    return (
        <>
            {showModal && <ErrorModal error={error} onClose={() => setShowModal(false)} />}

            <div style={{
                background: 'rgba(124,58,237,0.04)',
                border: `1px solid ${state === 'error' ? 'rgba(248,113,113,0.3)' : 'rgba(124,58,237,0.2)'}`,
                borderRadius: 16, overflow: 'hidden',
            }}>
                {/* Header */}
                <div
                    style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px',
                        borderBottom: state === 'done' ? '1px solid rgba(124,58,237,0.15)' : 'none',
                        cursor: state === 'done' ? 'pointer' : 'default',
                    }}
                    onClick={() => state === 'done' && setExpanded(e => !e)}
                >
                    <Sparkles size={15} color="#A78BFA" />
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#A78BFA', flex: 1 }}>{title}</span>

                    {source && (
                        <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 6, background: 'rgba(124,58,237,0.15)', color: '#A78BFA', fontWeight: 700 }}>
                            {source === 'hf' ? 'Qwen-7B' : source === 'gemini' ? 'Gemini' : source === 'cache' ? 'cached' : 'static'}
                        </span>
                    )}
                    {latency && <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{latency > 60000 ? `${Math.round(latency/1000)}s` : `${latency}ms`}</span>}

                    {state === 'idle' && (
                        <button onClick={e => { e.stopPropagation(); handleFetch(); }} style={{
                            padding: '6px 14px', borderRadius: 9, fontSize: 12, fontWeight: 700,
                            background: 'rgba(124,58,237,0.2)', border: '1px solid rgba(124,58,237,0.4)',
                            color: '#A78BFA', cursor: 'pointer',
                        }}>Analyze</button>
                    )}
                    {state === 'loading' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Loader2 size={16} color="#A78BFA" className="animate-spin" />
                            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontVariantNumeric: 'tabular-nums' }}>
                                {fmtElapsed(elapsed)}
                            </span>
                        </div>
                    )}
                    {state === 'done' && (expanded
                        ? <ChevronUp size={14} color="rgba(255,255,255,0.3)" />
                        : <ChevronDown size={14} color="rgba(255,255,255,0.3)" />
                    )}
                    {state === 'error' && (
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button
                                onClick={e => { e.stopPropagation(); setShowModal(true); }}
                                style={{ fontSize: 11, color: '#F87171', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 7, padding: '3px 10px', cursor: 'pointer', fontWeight: 700 }}
                            >
                                Details
                            </button>
                            <button
                                onClick={e => { e.stopPropagation(); handleFetch(); }}
                                style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', background: 'none', border: 'none', cursor: 'pointer' }}
                            >
                                Retry
                            </button>
                        </div>
                    )}
                </div>

                {/* Slow model hint — shown after 10s to reassure user it's not frozen */}
                {state === 'loading' && elapsed >= 10 && (
                    <div style={{ padding: '8px 18px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid rgba(124,58,237,0.1)', background: 'rgba(124,58,237,0.04)' }}>
                        <Clock size={11} color="#A78BFA" />
                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                            {elapsed < 60
                                ? 'Qwen-7B is running on CPU — this takes 3–8 min. Hang tight.'
                                : `Still running… ${fmtElapsed(elapsed)} elapsed. CPU inference is slow but working.`}
                        </span>
                    </div>
                )}

                {/* Inline error summary */}
                {state === 'error' && (                    <div
                        onClick={() => setShowModal(true)}
                        style={{ padding: '10px 18px', display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}
                        title="Click for details"
                    >
                        <AlertTriangle size={13} color="#F87171" style={{ flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: '#F87171', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {error}
                        </span>
                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', flexShrink: 0 }}>click for fix →</span>
                    </div>
                )}

                {/* Result */}
                {state === 'done' && expanded && data && (
                    <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>

                        {(data.risk_summary || data.executive_summary) && (
                            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', lineHeight: 1.6 }}>
                                {renderMarkdown(data.risk_summary || data.executive_summary)}
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                            {data.overall_posture && <Badge color={POSTURE_COLOR[data.overall_posture] || '#A78BFA'} label={`Posture: ${data.overall_posture}`} />}
                            {data.performance_grade && <Badge color={GRADE_COLOR[data.performance_grade] || '#A78BFA'} label={`Grade: ${data.performance_grade}`} />}
                            {data.estimated_fix_time && <Badge color="#60A5FA" label={`Fix time: ${data.estimated_fix_time}`} />}
                            {data.predicted_trend && <Badge color={data.predicted_trend === 'improving' ? '#34D399' : data.predicted_trend === 'degrading' ? '#F87171' : '#FBBF24'} label={`Trend: ${data.predicted_trend}`} />}
                        </div>

                        {[
                            { key: 'critical_actions',    label: 'Critical Actions',  icon: AlertTriangle, color: '#F87171' },
                            { key: 'key_insights',        label: 'Key Insights',      icon: Zap,           color: '#FBBF24' },
                            { key: 'recommendations',     label: 'Recommendations',   icon: CheckCircle2,  color: '#34D399' },
                            { key: 'immediate_actions',   label: 'Immediate Actions', icon: AlertTriangle, color: '#F87171' },
                            { key: 'post_incident_tasks', label: 'Post-Incident',     icon: CheckCircle2,  color: '#60A5FA' },
                        ].map(({ key, label, icon: Icon, color }) =>
                            Array.isArray(data[key]) && data[key].length > 0 ? (
                                <div key={key}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                                        <Icon size={12} color={color} />
                                        <span style={{ fontSize: 11, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
                                    </div>
                                    <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                        {data[key].map((item, i) => (
                                            <li key={i} style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', lineHeight: 1.5 }}>{item}</li>
                                        ))}
                                    </ul>
                                </div>
                            ) : null
                        )}

                        {Array.isArray(data.per_vuln) && data.per_vuln.length > 0 && (
                            <div>
                                <div style={{ fontSize: 11, fontWeight: 700, color: '#A78BFA', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Fix Recommendations</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {data.per_vuln.slice(0, 5).map((v, i) => (
                                        <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
                                            <span style={{ fontSize: 10, fontWeight: 800, color: v.priority === 'immediate' ? '#F87171' : v.priority === 'soon' ? '#FBBF24' : '#34D399', minWidth: 60 }}>{v.priority?.toUpperCase()}</span>
                                            <div>
                                                <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>{v.id}</div>
                                                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>{v.fix}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {data.escalation_path && (
                            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
                                <span style={{ fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>Escalation: </span>{data.escalation_path}
                            </div>
                        )}

                        {Array.isArray(data.diagnostic_commands) && data.diagnostic_commands.length > 0 && (
                            <div>
                                <div style={{ fontSize: 11, fontWeight: 700, color: '#60A5FA', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Diagnostic Commands</div>
                                {data.diagnostic_commands.map((cmd, i) => (
                                    <code key={i} style={{ display: 'block', fontSize: 11, color: '#34D399', background: 'rgba(0,0,0,0.3)', padding: '4px 8px', borderRadius: 6, marginBottom: 4, fontFamily: 'monospace' }}>{cmd}</code>
                                ))}
                            </div>
                        )}

                        {data.benchmark_comparison && (
                            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', margin: 0, fontStyle: 'italic' }}>{data.benchmark_comparison}</p>
                        )}
                    </div>
                )}

                {children && <div style={{ padding: '0 18px 16px' }}>{children}</div>}
            </div>
        </>
    );
};

const Badge = ({ color, label }) => (
    <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 8, background: `${color}18`, border: `1px solid ${color}40`, color, fontWeight: 700 }}>
        {label}
    </span>
);

export default AiInsightPanel;
