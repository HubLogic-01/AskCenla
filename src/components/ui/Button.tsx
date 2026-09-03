import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from './Icon';

type Variant = 'primary' | 'secondary' | 'ghost' | 'navy' | 'danger' | 'success';
type Size = 'sm' | 'md' | 'lg';

function classes(variant: Variant, size: Size, block?: boolean, extra?: string) {
  return [
    'btn',
    `btn--${variant}`,
    size !== 'md' ? `btn--${size}` : '',
    block ? 'btn--block' : '',
    extra ?? '',
  ]
    .filter(Boolean)
    .join(' ');
}

interface BaseProps {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  icon?: IconName;
  iconRight?: IconName;
  children?: ReactNode;
  className?: string;
}

export function Button({
  variant = 'primary',
  size = 'md',
  block,
  icon,
  iconRight,
  children,
  className,
  ...rest
}: BaseProps & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={classes(variant, size, block, className)} {...rest}>
      {icon && <Icon name={icon} size={size === 'sm' ? 15 : 17} />}
      {children}
      {iconRight && <Icon name={iconRight} size={size === 'sm' ? 15 : 17} />}
    </button>
  );
}

/** Same visual treatment as Button, but renders a router link. */
export function ButtonLink({
  to,
  variant = 'primary',
  size = 'md',
  block,
  icon,
  iconRight,
  children,
  className,
}: BaseProps & { to: string }) {
  return (
    <Link to={to} className={classes(variant, size, block, className)}>
      {icon && <Icon name={icon} size={size === 'sm' ? 15 : 17} />}
      {children}
      {iconRight && <Icon name={iconRight} size={size === 'sm' ? 15 : 17} />}
    </Link>
  );
}
