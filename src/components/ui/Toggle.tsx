export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`switch${checked ? ' is-on' : ''}`}
      style={{ background: 'none', border: 0, padding: 0, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1 }}
    >
      <span className="switch__track">
        <span className="switch__thumb" />
      </span>
      <span className="text-sm text-semibold text-strong">{label}</span>
    </button>
  );
}
