import React from 'react';

// pause bars on whole pixels with equal space either side; lucide's bars land on fractions of a pixel
// at small sizes, so one bar blurs more than the other and the icon looks off-center in round buttons.
// keep size the same parity as the button (even in an even button) so the icon sits on whole pixels too
export default function PauseIcon({ size = 14, className }) {
  const bar = Math.max(2, Math.round(size * 0.22));
  let gap = Math.max(2, Math.round(size * 0.2));
  if ((size - 2 * bar - gap) % 2) gap += 1;
  let height = Math.round(size * 0.78);
  if ((size - height) % 2) height -= 1;
  const x = (size - 2 * bar - gap) / 2;
  const y = (size - height) / 2;

  return (
    <svg className={className} width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="currentColor" aria-hidden="true">
      <rect x={x} y={y} width={bar} height={height} rx="1" />
      <rect x={x + bar + gap} y={y} width={bar} height={height} rx="1" />
    </svg>
  );
}
