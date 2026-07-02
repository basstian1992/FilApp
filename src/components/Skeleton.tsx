'use client';

export function SkeletonLine({ width = '100%' }: { width?: string }) {
  return (
    <div
      style={{
        height: '1rem',
        width,
        borderRadius: '6px',
        background: 'var(--surface-color)',
        animation: 'skeletonPulse 1.5s ease-in-out infinite',
      }}
    />
  );
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1.5rem', background: 'var(--surface-color)', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
      <div
        style={{
          height: '1.5rem',
          width: '60%',
          borderRadius: '8px',
          background: 'var(--surface-hover)',
          animation: 'skeletonPulse 1.5s ease-in-out infinite',
        }}
      />
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          style={{
            height: '0.85rem',
            width: `${70 + Math.random() * 30}%`,
            borderRadius: '6px',
            background: 'var(--surface-hover)',
            animation: 'skeletonPulse 1.5s ease-in-out infinite',
            animationDelay: `${i * 0.1}s`,
          }}
        />
      ))}
    </div>
  );
}

export function SkeletonScreen({ lines = 5 }: { lines?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
      <div
        style={{
          height: '2rem',
          width: '40%',
          borderRadius: '10px',
          background: 'var(--surface-color)',
          animation: 'skeletonPulse 1.5s ease-in-out infinite',
        }}
      />
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonCard key={i} lines={2 + (i % 3)} />
      ))}
    </div>
  );
}

export function SkeletonCenter({ text = 'Cargando...' }: { text?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1.5rem', minHeight: '60vh' }}>
      <div
        style={{
          width: '40px',
          height: '40px',
          border: '3px solid var(--border-color)',
          borderTopColor: 'var(--primary)',
          borderRadius: '50%',
          animation: 'skeletonSpin 0.8s linear infinite',
        }}
      />
      <span style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>{text}</span>
    </div>
  );
}
