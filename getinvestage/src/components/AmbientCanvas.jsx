import { useEffect, useRef } from 'react';
import { mulberry32 } from '../useMarket';

/**
 * Landing ambience: 4 flowing sine lines, ~42 rising particles, and a
 * self-drawing "live market trace" with a glowing head dot. DOM canvas only.
 */
export function AmbientCanvas({ active = true }) {
  const ref = useRef(null);

  useEffect(() => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const canvas = ref.current;
    if (!canvas || !active || reduced) return;

    const ctx = canvas.getContext('2d');
    let w = 0;
    let h = 0;
    let raf = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);

    const resize = () => {
      const rect = canvas.parentElement.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const rng = mulberry32(20260704);
    const particles = Array.from({ length: 42 }, () => ({
      x: rng(),
      y: rng(),
      r: 0.6 + rng() * 1.6,
      speed: 0.00025 + rng() * 0.0007,
      drift: (rng() - 0.5) * 0.0002,
      a: 0.04 + rng() * 0.09,
    }));

    const accent = getComputedStyle(document.documentElement)
      .getPropertyValue('--accent')
      .trim() || '#ededed';

    // Live trace state.
    let trace = [];
    let traceWalk = 0;
    const resetTrace = () => {
      trace = [];
      traceWalk = h * (0.32 + Math.random() * 0.22);
    };
    resetTrace();

    let t = 0;
    const draw = () => {
      t += 1;
      ctx.clearRect(0, 0, w, h);

      // (a) flowing sine lines
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        const baseY = h * (0.22 + i * 0.18);
        const amp = 14 + i * 8;
        for (let x = 0; x <= w; x += 8) {
          const y = baseY + Math.sin(x * 0.004 + t * (0.006 + i * 0.002) + i * 2.1) * amp;
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.strokeStyle = 'rgba(255,255,255,0.03)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // (b) rising particles
      for (const p of particles) {
        p.y -= p.speed;
        p.x += p.drift;
        if (p.y < -0.02) {
          p.y = 1.02;
          p.x = Math.random();
        }
        ctx.beginPath();
        ctx.arc(p.x * w, p.y * h, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${p.a})`;
        ctx.fill();
      }

      // (c) live market trace drawing itself across the hero
      if (t % 2 === 0) {
        const lastX = trace.length ? trace[trace.length - 1].x : 0;
        traceWalk += (Math.random() - 0.5) * 7;
        traceWalk = Math.max(h * 0.14, Math.min(h * 0.72, traceWalk));
        trace.push({ x: lastX + 2.2, y: traceWalk });
        if (lastX > w * 0.92) resetTrace();
      }
      if (trace.length > 1) {
        ctx.beginPath();
        ctx.moveTo(trace[0].x, trace[0].y);
        for (const pt of trace) ctx.lineTo(pt.x, pt.y);
        ctx.strokeStyle = accent;
        ctx.globalAlpha = 0.28;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.globalAlpha = 1;
        const head = trace[trace.length - 1];
        ctx.beginPath();
        ctx.arc(head.x, head.y, 2.4, 0, Math.PI * 2);
        ctx.fillStyle = accent;
        ctx.shadowColor = accent;
        ctx.shadowBlur = 12;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [active]);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        opacity: 0,
        animation: 'fadeIn 1s ease 0.15s forwards',
        pointerEvents: 'none',
      }}
    />
  );
}
