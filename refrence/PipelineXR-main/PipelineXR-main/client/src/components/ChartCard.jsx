import React from 'react';

const ChartCard = ({ title, icon: Icon, badge, children, className = '' }) => {
    return (
        <div style={{
            background: 'rgba(28, 28, 30, 0.4)',
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 24,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            transition: 'all 0.3s ease'
        }} className={`hover:border-white/10 ${className}`}>
            {/* Header */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '20px 24px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.05)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {Icon && <Icon size={16} style={{ color: 'rgba(255, 255, 255, 0.4)' }} />}
                    <h3 style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: '#fff',
                        margin: 0,
                        letterSpacing: '-0.01em'
                    }}>{title}</h3>
                </div>
                {badge && (
                    <span style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: 6,
                        background: badge.className?.includes('green') ? 'rgba(52, 211, 153, 0.1)' : 'rgba(255, 255, 255, 0.05)',
                        color: badge.className?.includes('green') ? '#34D399' : 'rgba(255, 255, 255, 0.4)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em'
                    }}>
                        {badge.label}
                    </span>
                )}
            </div>

            {/* Body */}
            <div style={{ flex: 1, padding: 24, minHeight: 250 }}>
                {children}
            </div>
        </div>
    );
};

export default ChartCard;
