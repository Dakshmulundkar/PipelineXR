import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

const StatCard = ({ title, value, subtitle, icon: Icon, trend, trendUp, color = 'blue', loading = false }) => {
    const accentColor = {
        blue: '#3B82F6',
        orange: '#F59E0B',
        purple: '#8B5CF6',
        indigo: '#6366F1',
        emerald: '#10B981',
        fuchsia: '#D946EF',
        rose: '#F43F5E'
    }[color] || '#3B82F6';

    return (
        <div style={{
            background: 'rgba(28, 28, 30, 0.4)',
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 20,
            padding: '24px',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            gap: 12
        }} className="hover:border-white/20 hover:bg-white/5 group">

            {/* Ambient Glow */}
            <div style={{
                position: 'absolute',
                top: -20,
                right: -20,
                width: 100,
                height: 100,
                background: accentColor,
                filter: 'blur(60px)',
                opacity: 0.05,
                pointerEvents: 'none'
            }} />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{
                    padding: 8,
                    borderRadius: 12,
                    background: `${accentColor}15`,
                    color: accentColor,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}>
                    {Icon && <Icon size={18} />}
                </div>

                {trend !== undefined && !loading && (
                    <div style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: trendUp ? '#34D399' : '#F87171',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        background: trendUp ? 'rgba(52, 211, 153, 0.1)' : 'rgba(248, 113, 113, 0.1)',
                        padding: '4px 8px',
                        borderRadius: 8
                    }}>
                        {trendUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                        {trend}%
                    </div>
                )}
            </div>

            {loading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div className="skeleton" style={{ height: 32, width: '60%', borderRadius: 8 }} />
                    <div className="skeleton" style={{ height: 16, width: '40%', borderRadius: 4 }} />
                </div>
            ) : (
                <div>
                    <div style={{
                        fontSize: 32,
                        fontWeight: 700,
                        color: '#fff',
                        letterSpacing: '-0.03em',
                        lineHeight: 1
                    }}>{value}</div>
                    <div style={{
                        fontSize: 13,
                        fontWeight: 500,
                        color: 'rgba(255, 255, 255, 0.5)',
                        marginTop: 4
                    }}>{title}</div>
                    {subtitle && (
                        <div style={{
                            fontSize: 11,
                            color: 'rgba(255, 255, 255, 0.3)',
                            marginTop: 2
                        }}>{subtitle}</div>
                    )}
                </div>
            )}
        </div>
    );
};

export default StatCard;
