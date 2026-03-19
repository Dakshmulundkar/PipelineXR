import React, { useState, useEffect } from 'react';
import { GitBranch, PlayCircle, Clock, RefreshCw, CheckCircle2, XCircle, Loader2, ChevronRight } from 'lucide-react';
import { api } from '../services/api';
import { useAppContext } from '../contexts/AppContext';
import { Activity, ShieldCheck } from 'lucide-react';
import PipelineStageBar from '../components/PipelineStageBar';

const statusStyle = {
    success: 'badge-green',
    completed: 'badge-green',
    failed: 'badge-red',
    failure: 'badge-red',
    running: 'badge-blue',
    in_progress: 'badge-blue',
};

const statusColor = {
    success: '#34D399',
    completed: '#34D399',
    failed: '#F87171',
    failure: '#F87171',
    running: '#60A5FA',
    in_progress: '#60A5FA',
};

const Pipelines = () => {
    const { selectedRepo } = useAppContext();
    const [runs, setRuns] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const { socket } = useAppContext();

    useEffect(() => {
        if (!socket) return;
        
        const handleWebhook = (event) => {
            if (event.eventType === 'workflow_run' || event.eventType === 'workflow_job') {
                // If it belongs to our repo, or if 'all repos' is selected
                if (!selectedRepo || event.payload?.repository?.full_name === selectedRepo) {
                    load(); // Reload runs on any workflow change
                }
            }
        };

        socket.on('github_webhook', handleWebhook);
        return () => socket.off('github_webhook', handleWebhook);
    }, [socket, selectedRepo]);

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

    useEffect(() => {
        load();
    }, [selectedRepo]); // eslint-disable-line react-hooks/exhaustive-deps

    const total = runs.length;
    const passed = runs.filter(r => r.status === 'success' || r.conclusion === 'success' || r.status === 'completed').length;
    const failed = runs.filter(r => r.status === 'failed' || r.conclusion === 'failure').length;
    const rate = total > 0 ? Math.round((passed / total) * 100) : 0;

    return (
        <div style={{ padding: '32px', maxWidth: 1400, margin: '0 auto', animation: 'fadeIn 0.5s ease-out' }}>

            {/* Header row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 32 }}>
                <div>
                    <h1 style={{ fontSize: 32, fontWeight: 800, color: '#fff', letterSpacing: '-0.04em', margin: 0 }}>
                        Pipeline Runs
                    </h1>
                    <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
                        Real-time monitoring of automated builds and security gates
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
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
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                        className="hover:bg-white/10"
                    >
                        <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
                        Refresh
                    </button>
                    <button
                        onClick={async () => {
                            if (!selectedRepo) return alert('Select a repo');
                            setRefreshing(true);
                            try {
                                const [owner, repo] = selectedRepo.split('/');
                                await api.triggerPipeline({ owner, repo, workflow_id: 'ci.yml' });
                            } catch (e) {
                                console.error(e);
                                alert('Failed to trigger pipeline');
                            }
                            setRefreshing(false);
                            // It takes a few seconds for the run to show up via webhook
                            setTimeout(() => load(), 2000); 
                        }}
                        disabled={refreshing}
                        style={{
                            background: 'linear-gradient(180deg, #3B82F6 0%, #2563EB 100%)',
                            color: '#fff',
                            padding: '10px 20px',
                            borderRadius: 12,
                            fontSize: 13,
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            border: 'none',
                            cursor: refreshing ? 'not-allowed' : 'pointer',
                            opacity: refreshing ? 0.7 : 1,
                            boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)',
                            transition: 'all 0.2s'
                        }}
                        className="hover:scale-[1.02] active:scale-[0.98]"
                    >
                        {refreshing ? <RefreshCw size={16} className="animate-spin" /> : <PlayCircle size={16} />}
                        Trigger Pipeline
                    </button>
                </div>
            </div>

            {/* Quick Stats Summary */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
                {[
                    { label: 'Total Analyses', val: total, icon: Activity, color: '#fff' },
                    { label: 'Passed Gates', val: passed, icon: CheckCircle2, color: '#34D399' },
                    { label: 'Failed Checks', val: failed, icon: XCircle, color: '#F87171' },
                    { label: 'Integrity Rate', val: `${rate}%`, icon: ShieldCheck, color: rate >= 90 ? '#34D399' : '#FBBF24' },
                ].map((s, i) => (
                    <div key={s.label} style={{
                        background: 'rgba(28, 28, 30, 0.4)',
                        backdropFilter: 'blur(10px)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: 20,
                        padding: '16px 20px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 16,
                        animation: `slideUp 0.4s ease-out ${i * 0.05}s both`
                    }}>
                        <div style={{
                            width: 40, height: 40, borderRadius: 12,
                            background: `${s.color}10`, color: s.color,
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
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
                        <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, marginTop: 4 }}>
                            Select a different repository or trigger a new build.
                        </div>
                    </div>
                ) : (
                    runs.map((run, i) => {
                        const status = run.status || run.conclusion || 'queued';
                        const accent = statusColor[status] || 'rgba(255,255,255,0.2)';
                        const repo = run.repository || 'Unknown Project';
                        const branch = run.head_branch || 'main';
                        const time = run.run_started_at ? new Date(run.run_started_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Unknown time';
                        const duration = run.duration_seconds ? `${Math.floor(run.duration_seconds / 60)}m ${run.duration_seconds % 60}s` : 'N/A';
                        const stages = run.stages || (typeof run.stages_json === 'string' ? JSON.parse(run.stages_json || '[]') : []);

                        return (
                            <div key={run.id || i} style={{
                                background: 'rgba(28, 28, 30, 0.4)',
                                backdropFilter: 'blur(20px)',
                                border: '1px solid rgba(255, 255, 255, 0.08)',
                                borderRadius: 20,
                                padding: '16px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 24,
                                animation: `slideUp 0.5s ease-out ${i * 0.05}s both`
                            }} className="hover:border-white/20 transition-all group">

                                {/* Status Icon */}
                                <div style={{
                                    width: 44, height: 44, borderRadius: '50%',
                                    border: `2px solid ${accent}40`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: accent,
                                    position: 'relative'
                                }}>
                                    {status === 'success' || status === 'completed' ? <CheckCircle2 size={24} /> :
                                        status === 'failed' || status === 'failure' ? <XCircle size={24} /> :
                                            <Loader2 size={24} className="animate-spin" />}
                                </div>

                                {/* Run Info */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{repo}</div>
                                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <GitBranch size={10} /> {branch}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
                                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>{time}</div>
                                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>•</div>
                                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <Clock size={10} /> {duration}
                                        </div>
                                    </div>
                                </div>

                                {/* Stage Progress */}
                                <div style={{ flex: 1.5, display: 'flex', gap: 6 }}>
                                    {stages.length > 0 ? (
                                        <PipelineStageBar stages={stages} />
                                    ) : (
                                        <div style={{ display: 'flex', gap: 4, width: '100%' }}>
                                            {[1, 1, 1, 0.5, 0].map((v, idx) => (
                                                <div key={idx} style={{ flex: 1, height: 4, background: v === 1 ? '#34D399' : v === 0.5 ? '#60A5FA' : 'rgba(255,255,255,0.05)', borderRadius: 2 }} />
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Action */}
                                <div style={{ padding: 8, color: 'rgba(255,255,255,0.2)', transition: 'all 0.2s' }} className="group-hover:text-white group-hover:translate-x-1">
                                    <ChevronRight size={18} />
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};

export default Pipelines;
