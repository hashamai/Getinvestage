import { useState } from 'react';
import { TrendUp } from '@phosphor-icons/react';

/**
 * Brand logo. Drop your logo file at frontend/public/logo.png (or logo.svg and
 * change the path below) and it will be used automatically; until then a
 * built-in gold monogram renders as fallback.
 */
export function Logo({ size = 34 }: { size?: number }) {
  const [missing, setMissing] = useState(false);

  if (missing) {
    return (
      <span className="brand-mark" style={{ width: size, height: size }} aria-hidden="true">
        <TrendUp size={size * 0.55} weight="bold" />
      </span>
    );
  }
  return (
    <img
      src="/logo.png"
      alt=""
      aria-hidden="true"
      className="brand-logo"
      style={{ width: size, height: size }}
      onError={() => setMissing(true)}
    />
  );
}
