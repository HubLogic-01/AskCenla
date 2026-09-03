import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

const ICONS: Record<string, IconName> = {
  info: 'shield',
  success: 'checkCircle',
  warning: 'alert',
  danger: 'alert',
};

export function Alert({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'success' | 'warning' | 'danger';
  title?: string;
  children?: ReactNode;
}) {
  return (
    <div className={`alert alert--${tone}`}>
      <Icon name={ICONS[tone]} size={18} />
      <div>
        {title && <div className="alert__title">{title}</div>}
        {children}
      </div>
    </div>
  );
}
