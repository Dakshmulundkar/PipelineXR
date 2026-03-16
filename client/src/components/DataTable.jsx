import React from 'react';

const DataTable = ({ columns = [], data = [], emptyMessage = 'No data available', loading = false }) => {
    const skeletonRows = 6;

    return (
        <div style={{
            background: 'rgba(28, 28, 30, 0.4)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 24,
            overflow: 'hidden',
            boxShadow: '0 20px 50px rgba(0,0,0,0.3)'
        }}>
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, textAlign: 'left' }}>
                    <thead>
                        <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                            {columns.map((col, i) => (
                                <th key={col.key} style={{
                                    padding: '16px 24px',
                                    fontSize: 11,
                                    fontWeight: 700,
                                    color: 'rgba(255,255,255,0.3)',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.08em',
                                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                                    whiteSpace: 'nowrap'
                                }}>
                                    {col.label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            Array.from({ length: skeletonRows }).map((_, rowIdx) => (
                                <tr key={rowIdx}>
                                    {columns.map((col, colIdx) => (
                                        <td key={colIdx} style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                                            <div className="skeleton rounded-lg" style={{ height: 14, width: `${40 + Math.random() * 50}%` }} />
                                        </td>
                                    ))}
                                </tr>
                            ))
                        ) : data.length === 0 ? (
                            <tr>
                                <td colSpan={columns.length} style={{ padding: '80px 24px', textAlign: 'center' }}>
                                    <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: 14, fontWeight: 500 }}>
                                        {emptyMessage}
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            data.map((row, idx) => (
                                <tr
                                    key={idx}
                                    style={{
                                        transition: 'all 0.2s',
                                        animation: `fadeIn 0.4s ease-out ${idx * 0.03}s both`
                                    }}
                                    className="hover:bg-white/[0.02] group"
                                >
                                    {columns.map((col, colIdx) => (
                                        <td key={col.key} style={{
                                            padding: '16px 24px',
                                            fontSize: 14,
                                            color: 'rgba(255,255,255,0.7)',
                                            borderBottom: idx === data.length - 1 ? 'none' : '1px solid rgba(255,255,255,0.02)',
                                            whiteSpace: 'nowrap'
                                        }}>
                                            {col.render ? col.render(row[col.key], row) : row[col.key]}
                                        </td>
                                    ))}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default DataTable;
