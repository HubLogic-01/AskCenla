import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
  flat?: boolean;
}

export function Card({ children, className, interactive, flat }: CardProps) {
  return (
    <div
      className={['card', interactive ? 'card--interactive' : '', flat ? 'card--flat' : '', className ?? '']
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="card__header">
      <div>
        <div className="card__title">{title}</div>
        {subtitle && <div className="card__subtitle">{subtitle}</div>}
      </div>
      {action}
    </div>
  );
}

export function CardBody({
  children,
  tight,
  flush,
  className,
}: {
  children: ReactNode;
  tight?: boolean;
  flush?: boolean;
  className?: string;
}) {
  return (
    <div
      className={['card__body', tight ? 'card__body--tight' : '', flush ? 'card__body--flush' : '', className ?? '']
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  );
}

export function CardFooter({ children }: { children: ReactNode }) {
  return <div className="card__footer">{children}</div>;
}
