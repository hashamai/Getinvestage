/**
 * Getinvestage brand mark — a solid diamond (square rotated 45°).
 * Drawn as SVG rather than a rotated <span> so it stays crisp at any size,
 * inherits `color`, and can be knocked out on light surfaces.
 */
export function Mark({ size = 22, pulse = false, style }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-hidden="true"
      focusable="false"
      style={{
        display: 'block',
        flexShrink: 0,
        animation: pulse ? 'pulseDot 2.2s ease-in-out infinite' : 'none',
        ...style,
      }}
    >
      <path d="M50 4 L96 50 L50 96 L4 50 Z" fill="currentColor" />
    </svg>
  );
}
