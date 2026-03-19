import React, { useState, useEffect } from 'react';
import { GitBranch, PlayCircle, Clock, RefreshCw, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { Activity, ShieldCheck, User, ExternalLink } from 'lucide-react';
import { api } from '../services/api';
import { useAppContext } from '../contexts/AppContext';
import PipelineStageBar from '../components/PipelineStageBar';

const statusColor = {
    success: '#34D399',
    completed: '#34D399',
    failed: '#F87171',
    failure: '#F87171',
    running: '#60A5FA',
    in_progress: '#60A5FA',
};

// ── Workflow Trigger Dropdown ────────────────────────────────────────────────
const WorkflowTriggerDropdown = ({ selectedRepo, load }) => {
    const [workflows, setWorkflows] = useState([]);
    const [loadingWorkflows, setLoadingWorkflows] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [triggering, setTriggering] = useState(false);

    useEffect(() => {
        if (!isOpen || !selectedRepo) return;
        const fetchWorkflows = async () => {
            setLoadingWorkflows(true);
            try {
                const [owner, repo] = selectedRepo.split('/');
                const data = await api.getWorkflows(owner, repo);
                setWorkflows(data || []);
            } catch (e) {
                console.error('Failed to load workflows', e);
                setWorkflows([]);
            }
            setLoadingWorkflows(false);
        };
        fetchWorkflows();
    }, [isOpen, selectedRepo]);

    const handleTrigger = async (workflowId) => {
        if (!selectedRepo) return;
        setTriggering(true);
        setIsOpen(false);
        try {
            const [owner, repo] = selectedRepo.split('/');
            await api.triggerPipeline({ owner, repo, workflow_id: workflowId });
        } catch (e) {
            console.error(e);
            alert('Failed to trigger pipeline. Ensure your token has workflow scope and the workflow has a workflow_dispatch trigger.');
        }
        setTriggering(false);
        setTimeout(() => load(), 2000);
    };

    return (
        <div style={{ position: 'relative' }}>
            <button
                onClick={() => {
                    if (!selectedRepo) return alert('Select a repo first to trigger pipelines');
                    setIsOpen(!isOpen);
                }}
                disabled={triggering}
                style={{
                    background: 'linear-gradient(180deg, #3B82F6 0%, #2563EB 100%)',
                    color: '#fff', padding: '10px 20px', borderRadius: 12,
                    fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8,
                    border: 'none', cursor: triggering ? 'not-allowed' : 'pointer',
                    opacity: triggering ? 0.7 : 1,
                    boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)', transition: 'all 0.2s'
                }}
                className="hover:scale-[1.02] active:scale-[0.98]"
            >
                {triggering ? <RefreshCw size={16} className="animate-spin" /> : <PlayCircle size={16} />}
                {triggering ? 'Dispatching...' : 'Trigger Pipeline'}
            </button>

            {isOpen && (
                <div style={{
                    position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 260,
                    background: 'rgba(18, 18, 22, 0.97)', backdropFilter: 'blur(20px)',
                    border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16,
                    padding: 8, zIndex: 50, boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
                }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.4)', padding: '8px 12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Select Workflow
                    </div>
                    {loadingWorkflows ? (
                        <div style={{ padding: '20px', display: 'flex', justifyContent: 'center', color: 'rgba(255,255,255,0.5)' }}>
                            <Loader2 size={20} className="animate-spin" />
                        </div>
                    ) : workflows.length === 0 ? (
                        <div style={{ padding: '16px 12px', fontSize: 13, color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>
                            No dispatchable workflows found
                        </div>
                    ) : (
                        <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                            {workflows.map(wf => (
                                <button key={wf.id} onClick={() => handleTrigger(wf.id)}
                                    style={{
                                        display: 'block', width: '100%', textAlign: 'left',
                                        padding: '10px 12px', background: 'transparent', border: 'none',
                                        color: '#fff', fontSize: 13, borderRadius: 8, cursor: 'pointer',
                                    }}
                                    className="hover:bg-white/10"
                                >
                                    <div style={{ fontWeight: 500 }}>{wf.name}</div>
                                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{wf.path?.split('/').pop()}</div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
            {isOpen && <div onClick={() => setIsOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />}
        </div>
    );
};

// ── Main Page ────────────────────────────────────────────────────────────────
const Pipelines = () => {
    const { selectedRepo, socket } = useAppContext();
    const [runs, setRuns] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const load = async () => {
        setRefreshing(true);
        try {
            const data = await api.getPipelineRuns(20, selectedRepo);
            setRuns(Array.isArray(data) ? data : []);
        } catch {
            setRuns([]);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const syncAndLoad = async () => {
        if (!selectedRepo) { load(); return; }
        setRefreshing(true);
        try {
            await api.syncPipeline(selectedRepo);
        } catch (e) {
            console.warn('Pipeline sync failed, loading from DB anyway:', e.message);
        }
        load();
    };

    useEffect(() => { syncAndLoad(); }, [selectedRepo]); // eslint-disable-line

    // 30s polling fallback
    useEffect(() => {
        const interval = setInterval(() => load(), 30000);
        return () => clearInterval(interval);
    }, [selectedRepo]); // eslint-disable-line

    useEffect(() => {
        if (!socket) return;
        const handleWebhook = (event) => {
            if (event.eventType === 'workflow_run' || event.eventType === 'workflow_job') {
                if (!selectedRepo || event.payload?.repository?.full_name === selectedRepo) load();
            }
        };
        socket.on('github_webhook', handleWebhook);
        return () => socket.off('github_webhook', handleWebhook);
    }, [socket, selectedRepo]); // eslint-disable-line

    const total = runs.length;
    const passed = runs.filter(r => r.conclusion === 'success').length;
    const failed = runs.filter(r => r.conclusion === 'failure' || r.conclusion === 'timed_out' || r.conclusion === 'cancelled').length;
    const rate = total > 0 ? Math.round((passed / total) * 100) : 0;

    return (
        <div style={{ padding: '32px', maxWidth: 1400, margin: '0 auto', animation: 'fadeIn 0.5s ease-out' }}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 32 }}>
                <div>
                    <h1 style={{ fontSize: 32, fontWeight: 800, color: '#fff', letterSpacing: '-0.04em', margin: 0 }}>Pipeline Runs</h1>
                    <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>Real-time monitoring of automated builds and security gates</p>
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                    <button onClick={syncAndLoad} style={{
                        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                        color: 'rgba(255,255,255,0.6)', padding: '10px 16px', borderRadius: 12,
                        fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8,
                        cursor: 'pointer', transition: 'all 0.2s'
                    }} className="hover:bg-white/10">
                        <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
                        Refresh
                    </button>
                    <WorkflowTriggerDropdown selectedRepo={selectedRepo} load={load} />
                </div>
            </div>

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
                {[
                    { label: 'Total Runs', val: total, icon: Activity, color: '#fff' },
                    { label: 'Passed', val: passed, icon: CheckCircle2, color: '#34D399' },
                    { label: 'Failed', val: failed, icon: XCircle, color: '#F87171' },
                    { label: 'Success Rate', val: `${rate}%`, icon: ShieldCheck, color: rate >= 90 ? '#34D399' : '#FBBF24' },
                ].map((s, i) => (
                    <div key={s.label} style={{
                        background: 'rgba(28,28,30,0.4)', backdropFilter: 'blur(10px)',
                        border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20,
                        padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16,
                        animation: `slideUp 0.4s ease-out ${i * 0.05}s both`
                    }}>
                        <div style={{ width: 40, height: 40, borderRadius: 12, background: `${s.color}10`, color: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <s.icon size={20} />
                        </div>
                        <div>
                            <div style={{ fontSize: 20, fontWeight: 700, color: '#fff', lineHeight: 1 }}>{s.val}</div>
                            <div style={{ fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>{s.label}</div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Run List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="skeleton" style={{ height: 100, borderRadius: 20, width: '100%' }} />
                    ))
                ) : runs.length === 0 ? (
                    <div style={{ padding: 60, textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: 24, border: '1px dashed rgba(255,255,255,0.1)' }}>
                        <GitBranch className="mx-auto text-white/10 mb-4" size={48} />
                        <div style={{ color: '#fff', fontWeight: 600 }}>No pipeline runs found</div>
                        <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, marginTop: 4 }}>Select a repository or trigger a new build.</div>
                        <button onClick={syncAndLoad} style={{ marginTop: 16, background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', color: '#60A5FA', padding: '10px 20px', borderRadius: 12, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Sync Now
                        </button>
                    </div>
                ) : (
                    runs.map((run, i) => {
                        const status = run.conclusion || run.status || 'queued';
                        const accent = statusColor[status] || 'rgba(255,255,255,0.2)';
                        const repo = run.repository || 'Unknown';
                        const branch = run.head_branch || 'main';
                        const runNum = run.run_number ? `#${run.run_number}` : '';
                        const event = run.event || 'push';
                        const risk = run.risk_level || 'Healthy';
                        const riskColor = risk === 'Critical' ? '#F87171' : risk === 'At Risk' ? '#FBBF24' : '#34D399';
                        const time = run.run_started_at ? new Date(run.run_started_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
                        const duration = run.duration_seconds ? `${Math.floor(run.duration_seconds / 60)}m ${run.duration_seconds % 60}s` : 'N/A';
                        const stages = run.stages || [];

                        return (
                            <div key={run.id || i}
                                style={{
                                    background: 'rgba(28,28,30,0.4)', backdropFilter: 'blur(20px)',
                                    border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20,
                                    padding: '16px', display: 'flex', alignItems: 'center', gap: 24,
                                    animation: `slideUp 0.5s ease-out ${i * 0.05}s both`
                                }} className="hover:border-white/20 transition-all group">

                                {/* Status icon */}
                                <div style={{
                                    width: 44, height: 44, borderRadius: '50%',
                                    border: `2px solid ${accent}40`, display: 'flex', alignItems: 'center',
                                    justifyContent: 'center', color: accent, position: 'relative', flexShrink: 0
                                }}>
                                    {(status === 'in_progress' || status === 'running') && (
                                        <div style={{ position: 'absolute', inset: -4, border: `2px solid ${accent}80`, borderRadius: '50%', animation: 'pulse 2s infinite' }} />
                                    )}
                                    {status === 'success' || status === 'completed' ? <CheckCircle2 size={24} /> :
                                        status === 'failed' || status === 'failure' ? <XCircle size={24} /> :
                                            <Loader2 size={24} className="animate-spin" />}
                                </div>

                                {/* Run info */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{repo}</span>
                                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <GitBranch size={10} /> {branch}
                                        </span>
                                        {runNum && <span style={{ fontSize: 10, background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: 6, color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>{runNum}</span>}
                                        <span style={{ fontSize: 9, background: `${accent}15`, padding: '2px 6px', borderRadius: 6, color: accent, fontWeight: 800, textTransform: 'uppercase' }}>{event}</span>
                                        <span style={{ fontSize: 9, background: `${riskColor}15`, padding: '2px 6px', borderRadius: 6, color: riskColor, fontWeight: 800, textTransform: 'uppercase' }}>{risk}</span>
                                    </div>
                                    {run.head_commit_message && (
                                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                                            {run.head_commit_message.split('\n')[0]}
                                        </div>
                                    )}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
                                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{time}</span>
                                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>•</span>
                                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <Clock size={10} /> {duration}
                                        </span>
                                        {run.triggering_actor && (
                                            <>
                                                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>•</span>
                                                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                    <User size={10} /> {run.triggering_actor}
                                                </span>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* Stage bar */}
                                <div style={{ flex: 1.5, display: 'flex', gap: 6 }}>
                                    {stages.length > 0 ? (
                                        <PipelineStageBar stages={stages} />
                                    ) : (
                                        <div style={{ display: 'flex', gap: 4, width: '100%', alignItems: 'center' }}>
                                            {[1, 1, 1, 0.5, 0].map((v, idx) => (
                                                <div key={idx} style={{ flex: 1, height: 4, background: v === 1 ? '#34D399' : v === 0.5 ? '#60A5FA' : 'rgba(255,255,255,0.05)', borderRadius: 2 }} />
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* External link */}
                                <a href={run.html_url} target="_blank" rel="noopener noreferrer"
                                    style={{ padding: 8, color: 'rgba(255,255,255,0.2)', transition: 'all 0.2s', display: 'flex' }}
                                    className="group-hover:text-white group-hover:translate-x-1">
                                    <ExternalLink size={18} />
                                </a>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};

export default Pipelines;
