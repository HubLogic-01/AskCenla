import { Icon } from './Icon';

interface ChoiceProps {
  selected: boolean;
  title: string;
  hint?: string;
  onToggle: () => void;
  type?: 'checkbox' | 'radio';
  disabled?: boolean;
}

/** A large, touch-friendly selectable tile used for trades, urgency and roles. */
export function Choice({ selected, title, hint, onToggle, type = 'checkbox', disabled }: ChoiceProps) {
  return (
    <button
      type="button"
      className={`choice${selected ? ' is-selected' : ''}`}
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={selected}
    >
      <span className={`choice__mark${type === 'radio' ? ' choice__mark--radio' : ''}`}>
        {selected && <Icon name="check" size={13} strokeWidth={3} />}
      </span>
      <span>
        <span className="choice__title">{title}</span>
        {hint && <span className="choice__hint">{hint}</span>}
      </span>
    </button>
  );
}
