import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '@/components/ui/Icon';

export function PageHeader({
  title,
  description,
  actions,
  backTo,
  backLabel,
  eyebrow,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  backTo?: string;
  backLabel?: string;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="page-header">
      {backTo && (
        <Link to={backTo} className="back-link">
          <Icon name="chevronLeft" size={15} />
          {backLabel ?? 'Back'}
        </Link>
      )}
      <div className="page-header__row">
        <div>
          {eyebrow && <div className="eyebrow" style={{ marginBottom: 'var(--sp-2)' }}>{eyebrow}</div>}
          <h1 className="page-header__title">{title}</h1>
          {description && <div className="page-header__desc">{description}</div>}
        </div>
        {actions && <div className="page-header__actions">{actions}</div>}
      </div>
    </div>
  );
}
