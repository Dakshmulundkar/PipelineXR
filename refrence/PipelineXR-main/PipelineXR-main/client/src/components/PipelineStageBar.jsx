import React from 'react';
import { CheckCircle2, XCircle, Loader2, Clock, AlertCircle } from 'lucide-react';

const STATUS_CONFIG = {
    success: { icon: CheckCircle2, color: '#34D399', bg: 'rgba(52, 211, 153, 0.1)', border: 'rgba(52, 211, 153, 0.2)', label: 'Success' },
    completed: { icon: CheckCircle2, color: '#34D399', bg: 'rgba(52, 211, 153, 0.1)', border: 'rgba(52, 211, 153, 0.2)', label: 'Completed' },
    failed: { icon: XCircle, color: '#F87171', bg: 'rgba(248, 113, 113, 0.1)', border: 'rgba(248, 113, 113, 0.2)', label: 'Failed' },
    failure: { icon: XCircle, color: '#F87171', bg: 'rgba(248, 113, 113, 0.1)', border: 'rgba(248, 113, 113, 0.2)', label: 'Failed' },
    running: { icon: Loader2, color: '#60A5FA', bg: 'rgba(96, 165, 250, 0.1)', border: 'rgba(96, 165, 250, 0.4)', label: 'Running', spin: true },
    in_progress: { icon: Loader2, color: '#60A5FA', bg: 'rgba(96, 165, 250, 0.1)', border: 'rgba(96, 165, 250, 0.4)', label: 'In Progress', spin: true },
    pending: { icon: Clock, color: 'rgba(255,255,255,0.2)', bg: 'rgba(255,255,255,0.03)', border: 'rgba(255,255,255,0.05)', label: 'Pending' },
    queued: { icon: Clock, color: 'rgba(255,255,255,0.2)', bg: 'rgba(255,255,255,0.03)', border: 'rgba(255,255,255,0.05)', label: 'Queued' },
};

const PipelineStageBar = ({ stages = [] }) => {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, padding: '12px 0', minWidth: 0 }}>
            {stages.map((stage, idx) => {
                const cfg = STATUS_CONFIG[stage.status?.toLowerCase()] || STATUS_CONFIG.pending;
                const Icon = cfg.icon;

                return (
                    <React.Fragment key={idx}>
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: 10,
                            zIndex: 2,
                            position: 'relative'
                        }}>
                            <div style={{
                                width: 32,
                                height: 32,
                                borderRadius: '50%',
                                background: cfg.bg,
                                border: `1px solid ${cfg.border}`,
                                color: cfg.color,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                                boxShadow: cfg.spin ? `0 0 15px ${cfg.color}30` : 'none'
                            }} className="hover:scale-125 hover:shadow-lg cursor-help group">
                                <Icon size={16} className={cfg.spin ? 'animate-spin' : ''} />

                                {/* Professional Tooltip */}
                                <div style={{
                                    position: 'absolute',
                                    bottom: '100%',
                                    left: '50%',
                                    transform: 'translateX(-50%) translateY(-8px)',
                                    background: 'rgba(0,0,0,0.9)',
                                    backdropFilter: 'blur(10px)',
                                    padding: '6px 12px',
                                    borderRadius: 8,
                                    color: '#fff',
                                    fontSize: 10,
                                    fontWeight: 700,
                                    whiteSpace: 'nowrap',
                                    pointerEvents: 'none',
                                    opacity: 0,
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    boxShadow: '0 10px 20px rgba(0,0,0,0.4)',
                                    transition: 'all 0.2s ease-out'
                                }} className="group-hover:opacity-100 group-hover:translate-y-[-4px]">
                                    {stage.name}: {cfg.label}
                                </div>
                            </div>
                            <div style={{
                                fontSize: 10,
                                fontWeight: 700,
                                color: 'rgba(255,255,255,0.4)',
                                textTransform: 'uppercase',
                                letterSpacing: '0.04em',
                                maxWidth: 64,
                                textAlign: 'center',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                            }}>
                                {stage.name}
                            </div>
                        </div>

                        {idx < stages.length - 1 && (
                            <div style={{
                                height: 1.5,
                                width: 32,
                                background: 'rgba(255,255,255,0.05)',
                                margin: '0 -4px 22px -4px',
                                zIndex: 1,
                                position: 'relative',
                                borderRadius: 1
                            }}>
                                <div style={{
                                    position: 'absolute',
                                    inset: 0,
                                    background: (stage.status === 'success' || stage.status === 'completed') ? '#34D399' : 'transparent',
                                    opacity: 0.3,
                                    borderRadius: 1,
                                    transition: 'all 0.6s ease-in-out'
                                }} />
                            </div>
                        )}
                    </React.Fragment>
                );
            })}
        </div>
    );
};

export default PipelineStageBar;
