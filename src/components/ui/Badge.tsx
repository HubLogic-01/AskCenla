import type { ReactNode } from 'react';
import type { StatusTone } from '@/data/statuses';

export function Badge({
  tone = 'neutral',
  dot,
  children,
}: {
  tone?: StatusTone;
  dot?: boolean;
  children: ReactNode;
}) {
  return (
    <span className={`badge badge--${tone}`}>
      {dot && <span className="badge__dot" />}
      {children}
    </span>
  );
}
