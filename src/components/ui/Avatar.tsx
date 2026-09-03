function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function Avatar({
  name,
  size = 'md',
  tone,
}: {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  tone?: 'navy' | 'grey';
}) {
  return (
    <span
      className={['avatar', size !== 'md' ? `avatar--${size}` : '', tone ? `avatar--${tone}` : '']
        .filter(Boolean)
        .join(' ')}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}
