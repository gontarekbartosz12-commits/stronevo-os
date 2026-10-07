'use client';

import { ActivityPoint } from '@/lib/types';

// Prosty słupkowy wykres aktywności (SVG, bez zależności).
export default function ActivityChart({ points }: { points: ActivityPoint[] }) {
  if (points.length === 0) {
    return <p className="text-sm text-stone-600">Brak danych o aktywności.</p>;
  }

  const max = Math.max(...points.map((p) => p.wykonania), 1);
  const barWidth = 100 / points.length;

  return (
    <div>
      <svg viewBox="0 0 100 40" className="h-40 w-full" preserveAspectRatio="none">
        {points.map((p, i) => {
          const h = (p.wykonania / max) * 34;
          return (
            <rect
              key={p.data}
              x={i * barWidth + barWidth * 0.15}
              y={40 - h}
              width={barWidth * 0.7}
              height={h}
              rx={0.6}
              fill={i === points.length - 1 ? '#d8b677' : '#7B2D3B'}
              opacity={0.55 + (p.wykonania / max) * 0.45}
            >
              <title>{`${p.data}: ${p.wykonania} wykonań`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-stone-600">
        <span>{points[0].data.slice(5)}</span>
        <span>
          max {max}/dzień · dziś{' '}
          <span className="text-gold-light">{points[points.length - 1].wykonania}</span>
        </span>
        <span>{points[points.length - 1].data.slice(5)}</span>
      </div>
    </div>
  );
}
