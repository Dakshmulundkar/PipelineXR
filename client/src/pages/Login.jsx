import React, { useState } from 'react';
import { Shield, Lock, Activity, Globe, Github } from 'lucide-react';

const Login = () => {
    const [hover, setHover] = useState(false);

    const features = [
        { label: 'Cloud Security', icon: Globe, color: '#3B82F6' },
        { label: 'Threat Intelligence', icon: Shield, color: '#10B981' },
        { label: 'Access Control', icon: Lock, color: '#F59E0B' },
        { label: 'Real-time Metrics', icon: Activity, color: '#8B5CF6' }
    ];

    return (
        <div style={{
            minHeight: '100vh',
            background: '#020203',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            overflow: 'hidden',
            fontFamily: "'Inter', -apple-system, system-ui, sans-serif",
        }}>
            {/* Animated Background Orbs */}
            <div style={{
                position: 'absolute',
                top: '10%',
                left: '20%',
                width: '600px',
                height: '600px',
                background: 'radial-gradient(circle, rgba(59, 130, 246, 0.1) 0%, transparent 70%)',
                filter: 'blur(80px)',
                animation: 'pulse 15s infinite alternate',
                pointerEvents: 'none',
            }} />
            <div style={{
                position: 'absolute',
                bottom: '10%',
                right: '15%',
                width: '500px',
                height: '500px',
                background: 'radial-gradient(circle, rgba(139, 92, 246, 0.08) 0%, transparent 70%)',
                filter: 'blur(80px)',
                animation: 'pulse 12s infinite alternate-reverse',
                pointerEvents: 'none',
            }} />

            <style>{`
                @keyframes pulse {
                    0% { transform: scale(1) translate(0, 0); }
                    100% { transform: scale(1.2) translate(50px, 30px); }
                }
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes slideRight {
                    from { transform: translateX(-20px); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
            `}</style>

            <div style={{
                width: 900,
                height: 600,
                display: 'grid',
                gridTemplateColumns: '1.2fr 1fr',
                background: 'rgba(10, 10, 12, 0.7)',
                backdropFilter: 'blur(40px)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: 40,
                boxShadow: '0 50px 100px rgba(0,0,0,0.8), inset 0 0 0 1px rgba(255,255,255,0.02)',
                position: 'relative',
                zIndex: 10,
                overflow: 'hidden',
                animation: 'fadeIn 0.8s cubic-bezier(0.16, 1, 0.3, 1) both'
            }}>

                {/* Brand Side */}
                <div style={{
                    padding: 60,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    borderRight: '1px solid rgba(255,255,255,0.05)',
                    background: 'linear-gradient(135deg, rgba(255,255,255,0.02) 0%, transparent 100%)'
                }}>
                    <div>
                        <div style={{
                            width: 60,
                            height: 60,
                            background: 'linear-gradient(135deg, #3B82F6 0%, #7C3AED 100%)',
                            borderRadius: 18,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 24,
                            fontWeight: 900,
                            color: '#fff',
                            boxShadow: '0 0 40px rgba(59, 130, 246, 0.4)',
                            marginBottom: 40
                        }}>PX</div>
                        <h1 style={{ fontSize: 44, fontWeight: 800, color: '#fff', letterSpacing: '-0.05em', margin: 0, lineHeight: 1 }}>
                            PipelineXR
                        </h1>
                        <p style={{ fontSize: 18, color: 'rgba(255,255,255,0.4)', marginTop: 16, fontWeight: 500, lineHeight: 1.4 }}>
                            Advanced DevSecOps observability for modern engineering teams.
                        </p>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                        {features.map((f, i) => (
                            <div key={f.label} style={{
                                animation: `slideRight 0.5s ease-out ${0.4 + (i * 0.1)}s both`
                            }}>
                                <f.icon size={20} style={{ color: f.color, marginBottom: 12 }} />
                                <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{f.label}</div>
                                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>System Shield Active</div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Action Side */}
                <div style={{
                    padding: 60,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    textAlign: 'center'
                }}>
                    <h2 style={{ fontSize: 24, fontWeight: 800, color: '#fff', marginBottom: 8, letterSpacing: '-0.02em' }}>
                        Welcome back
                    </h2>
                    <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', marginBottom: 40 }}>
                        Authenticate to access your cloud cluster
                    </p>

                    <a
                        href="/auth/github"
                        style={{
                            width: '100%',
                            background: '#fff',
                            color: '#000',
                            padding: '16px 24px',
                            borderRadius: 16,
                            textDecoration: 'none',
                            fontSize: 15,
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 12,
                            boxShadow: hover ? '0 20px 40px rgba(255,255,255,0.15)' : '0 4px 12px rgba(0,0,0,0.2)',
                            transform: hover ? 'translateY(-2px)' : 'translateY(0)',
                            transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                        }}
                        onMouseEnter={() => setHover(true)}
                        onMouseLeave={() => setHover(false)}
                    >
                        <Github size={20} />
                        Continue with GitHub
                    </a>

                    <div style={{
                        marginTop: 40,
                        padding: '16px 20px',
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.05)',
                        borderRadius: 16,
                        width: '100%'
                    }}>
                        <div style={{ fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
                            Enterprise Grade Security
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
                            {['OAuth 2.0', 'Session Encrypted', 'No Token Storage', 'GitHub Verified'].map(label => (
                                <div key={label} style={{
                                    padding: '4px 10px', borderRadius: 6,
                                    background: 'rgba(255,255,255,0.05)',
                                    border: '1px solid rgba(255,255,255,0.08)',
                                    fontSize: 10, fontWeight: 600,
                                    color: 'rgba(255,255,255,0.4)',
                                    letterSpacing: '0.03em'
                                }}>{label}</div>
                            ))}
                        </div>
                    </div>


                </div>

            </div>
        </div>
    );
};

export default Login;
