import React from 'react';

const GridBackground = () => {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden">
      {/* CSS Grid Pattern */}
      <div
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
        }}
      />

      {/* Dot Grid Pattern */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)`,
          backgroundSize: '30px 30px',
        }}
      />

      {/* Radial Fade Mask */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at 50% 0%, transparent 0%, rgba(10,10,15,0.5) 50%, rgba(10,10,15,1) 100%)',
        }}
      />

      {/* Top Highlight Line */}
      <div
        className="absolute top-0 left-0 right-0 h-px opacity-20"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(59,130,246,0.5), rgba(168,85,247,0.5), transparent)',
        }}
      />
    </div>
  );
};

export default GridBackground;
